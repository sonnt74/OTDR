// ==========================================================================
// TỆP ADMIN.JS - ĐIỀU KHIỂN GIAO DIỆN QUẢN TRỊ MỐC OK6 & PHÂN QUYỀN RBAC
// ==========================================================================

// Biến toàn cục lưu trạng thái xác nhận Modal
var confirmResolver = null;

/**
 * 1. ĐÓNG MỞ MODAL VÀ CHUYỂN TAB QUẢN TRỊ
 */
function openModal(modalId, tabId) {
  closeModals();
  var targetModal = document.getElementById(modalId);
  if (targetModal) {
    targetModal.style.display = 'flex';
  }

  if (modalId === 'adminMasterModal') {
    renderAllAdminTables();
    if (tabId) switchAdminTab(tabId);
  }
}

function closeModals() {
  var modals = document.querySelectorAll('.app-modal');
  modals.forEach(function(m) {
    m.style.display = 'none';
  });
}

function switchAdminTab(tabPaneId) {
  // Đổi trạng thái Nút Tab
  var tabBtns = document.querySelectorAll('.admin-tabs .tab-btn');
  tabBtns.forEach(function(btn) {
    if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(tabPaneId)) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Đổi trạng thái Khung Nội dung
  var tabPanes = document.querySelectorAll('.tab-pane');
  tabPanes.forEach(function(pane) {
    if (pane.id === tabPaneId) {
      pane.classList.add('active');
    } else {
      pane.classList.remove('active');
    }
  });
}

/**
 * 2. KIỂM TRA QUYỀN THAO TÁC (RBAC 4 CẤP)
 */
function getCurrentUser() {
  var state = AppStore.getState();
  return state.currentUser || JSON.parse(localStorage.getItem('TNN_USER_INFO')) || {
    username: 'guest',
    role: 'nhan_vien',
    id_dai: null,
    id_tram: null
  };
}

function checkAdminPermission(action, idDaiTarget, idTramTarget) {
  var user = getCurrentUser();
  var role = user.role;

  if (role === 'admin_sys') return true;

  if (role === 'nhan_vien') {
    if (action !== 'XEM') {
      alert("⛔ Tài khoản Nhân viên chỉ có quyền xem dữ liệu!");
      return false;
    }
    return true;
  }

  if (role === 'admin_dai') {
    if (idDaiTarget && String(idDaiTarget) !== String(user.id_dai)) {
      alert("⛔ Bạn chỉ có quyền quản lý dữ liệu thuộc Đài của mình!");
      return false;
    }
    return true;
  }

  if (role === 'admin_tram') {
    if (idTramTarget && String(idTramTarget) !== String(user.id_tram)) {
      alert("⛔ Bạn chỉ có quyền quản lý dữ liệu thuộc Trạm của mình!");
      return false;
    }
    return true;
  }

  return false;
}

/**
 * 3. HÀM ĐỔ DỮ LIỆU VÀO 5 BẢNG QUẢN TRỊ
 */
function renderAllAdminTables() {
  renderMasterAccountTable();
  renderMasterDaiTable();
  renderMasterTramTable();
  renderMasterTuyenTable();
  renderMasterDoanTable();
}

// 3.1 Bảng Tài khoản
function renderMasterAccountTable() {
  var tbody = document.getElementById('masterAccountTableBody');
  if (!tbody) return;

  var state = AppStore.getState();
  var users = state.rawUserList || [];
  var user = getCurrentUser();

  var listDaiMap = Object.fromEntries((state.rawDaiList || []).map(d => [d.id_dai, d.ten_dai]));
  var listTramMap = Object.fromEntries((state.rawTramList || []).map(t => [t.id_tram, t.ten_tram]));

  if (user.role === 'admin_dai') users = users.filter(u => String(u.id_dai) === String(user.id_dai));
  if (user.role === 'admin_tram') users = users.filter(u => String(u.id_tram) === String(user.id_tram));

  var html = users.map(u => `
    <tr>
      <td><b>${u.username || u.email}</b></td>
      <td><span class="badge" style="background:#0d6efd; color:#fff; padding:2px 6px; border-radius:3px;">${u.role || 'nhan_vien'}</span></td>
      <td>${listDaiMap[u.id_dai] || 'Tất cả'}</td>
      <td>${listTramMap[u.id_tram] || 'Tất cả'}</td>
      <td>${u.can_edit_map ? '✅ Có' : '❌ Không'}</td>
      <td>
        <button class="btn-small btn-success" onclick="chuanBiFormThemThanhVien('${u.username || u.email}')">✏️ Sửa</button>
        <button class="btn-small del" onclick="deleteAdminRecord('users', '${u.username || u.email}')">🗑️ Xóa</button>
      </td>
    </tr>
  `).join('');

  tbody.innerHTML = html || '<tr><td colspan="6" style="text-align:center;">Chưa có dữ liệu tài khoản</td></tr>';
}

// 3.2 Bảng Đài Viễn thông
function renderMasterDaiTable() {
  var tbody = document.getElementById('masterDaiTableBody');
  if (!tbody) return;

  var state = AppStore.getState();
  var list = state.rawDaiList || [];
  var user = getCurrentUser();

  if (user.role === 'admin_dai') list = list.filter(d => String(d.id_dai) === String(user.id_dai));

  var html = list.map(item => `
    <tr>
      <td>${item.id_dai}</td>
      <td><b>${item.ten_dai}</b></td>
      <td>
        ${checkAdminPermission('SUA', item.id_dai) ? `<button class="btn-small btn-success" onclick="moFormThemDai(${item.id_dai})">✏️ Sửa</button>` : ''}
        ${checkAdminPermission('XOA', item.id_dai) ? `<button class="btn-small del" onclick="deleteAdminRecord('dai_vt', ${item.id_dai})">🗑️ Xóa</button>` : ''}
      </td>
    </tr>
  `).join('');

  tbody.innerHTML = html || '<tr><td colspan="3" style="text-align:center;">Chưa có dữ liệu Đài</td></tr>';
}

// 3.3 Bảng Trạm Viễn thông
function renderMasterTramTable() {
  var tbody = document.getElementById('masterTramTableBody');
  if (!tbody) return;

  var state = AppStore.getState();
  var list = state.rawTramList || [];
  var user = getCurrentUser();
  var listDaiMap = Object.fromEntries((state.rawDaiList || []).map(d => [d.id_dai, d.ten_dai]));

  if (user.role === 'admin_dai') list = list.filter(t => String(t.id_dai) === String(user.id_dai));
  if (user.role === 'admin_tram' || user.role === 'nhan_vien') list = list.filter(t => String(t.id_tram) === String(user.id_tram));

  var html = list.map(item => `
    <tr>
      <td>${item.id_tram}</td>
      <td><b>${item.ten_tram}</b></td>
      <td>🏢 ${listDaiMap[item.id_dai] || 'Chưa gán'}</td>
      <td>
        ${checkAdminPermission('SUA', item.id_dai, item.id_tram) ? `<button class="btn-small btn-success" onclick="moFormThemTram(${item.id_tram})">✏️ Sửa</button>` : ''}
        ${checkAdminPermission('XOA', item.id_dai, item.id_tram) ? `<button class="btn-small del" onclick="deleteAdminRecord('tram_vt', ${item.id_tram})">🗑️ Xóa</button>` : ''}
      </td>
    </tr>
  `).join('');

  tbody.innerHTML = html || '<tr><td colspan="4" style="text-align:center;">Chưa có dữ liệu Trạm</td></tr>';
}

// 3.4 Bảng Tuyến Cáp
function renderMasterTuyenTable() {
  var tbody = document.getElementById('masterTuyenTableBody');
  if (!tbody) return;

  var state = AppStore.getState();
  var list = state.rawTuyenList || [];

  var html = list.map(item => `
    <tr>
      <td>${item.id_tuyen}</td>
      <td>${item.ma_tuyen || 'N/A'}</td>
      <td><b>${item.ten_tuyen}</b></td>
      <td>
        ${checkAdminPermission('SUA') ? `<button class="btn-small btn-success" onclick="moFormThemTuyen(${item.id_tuyen})">✏️ Sửa</button>` : ''}
        ${checkAdminPermission('XOA') ? `<button class="btn-small del" onclick="deleteAdminRecord('tuyen_cap', ${item.id_tuyen})">🗑️ Xóa</button>` : ''}
      </td>
    </tr>
  `).join('');

  tbody.innerHTML = html || '<tr><td colspan="4" style="text-align:center;">Chưa có dữ liệu Tuyến cáp</td></tr>';
}

// 3.5 Bảng Đoạn Cáp
function renderMasterDoanTable() {
  var tbody = document.getElementById('masterDoanTableBody');
  if (!tbody) return;

  var state = AppStore.getState();
  var list = state.rawDoanList || [];
  var user = getCurrentUser();

  var listTuyenMap = Object.fromEntries((state.rawTuyenList || []).map(t => [t.id_tuyen, t.ten_tuyen]));
  var listTramMap = Object.fromEntries((state.rawTramList || []).map(t => [t.id_tram, t.ten_tram]));

  if (user.role === 'admin_tram' || user.role === 'nhan_vien') list = list.filter(d => String(d.id_tram) === String(user.id_tram));

  var html = list.map(item => `
    <tr>
      <td>${item.id_doan}</td>
      <td>${item.ma_doan || 'N/A'}</td>
      <td>🔌 ${listTuyenMap[item.id_tuyen] || 'Chưa gán'}</td>
      <td>🏠 ${listTramMap[item.id_tram] || 'Chưa gán'}</td>
      <td>
        ${checkAdminPermission('SUA', null, item.id_tram) ? `<button class="btn-small btn-success" onclick="moFormThemDoan(${item.id_doan})">✏️ Sửa</button>` : ''}
        ${checkAdminPermission('XOA', null, item.id_tram) ? `<button class="btn-small del" onclick="deleteAdminRecord('doan_cap', ${item.id_doan})">🗑️ Xóa</button>` : ''}
      </td>
    </tr>
  `).join('');

  tbody.innerHTML = html || '<tr><td colspan="5" style="text-align:center;">Chưa có dữ liệu Đoạn cáp</td></tr>';
}

/**
 * 4. XỬ LÝ FORM THÊM / SỬA TÀI KHOẢN
 */
function chuanBiFormThemThanhVien(usernameToEdit) {
  var state = AppStore.getState();
  var selectDai = document.getElementById('newMemberDai');
  var selectTram = document.getElementById('newMemberTram');

  if (selectDai) {
    selectDai.innerHTML = '<option value="">-- Tất cả Đài --</option>' + 
      (state.rawDaiList || []).map(d => `<option value="${d.id_dai}">${d.ten_dai}</option>`).join('');
  }
  if (selectTram) {
    selectTram.innerHTML = '<option value="">-- Tất cả Trạm --</option>' + 
      (state.rawTramList || []).map(t => `<option value="${t.id_tram}">${t.ten_tram}</option>`).join('');
  }

  var accountInput = document.getElementById('newMemberAccount') || document.getElementById('loginEmail');

  if (usernameToEdit) {
    var userObj = (state.rawUserList || []).find(u => (u.username || u.email) === usernameToEdit);
    document.getElementById('accountModalTitle').innerText = "✏️ Sửa Tài Khoản";
    document.getElementById('editingAccountId').value = usernameToEdit;
    if (accountInput) accountInput.value = usernameToEdit;
    if (userObj) {
      document.getElementById('newMemberRole').value = userObj.role || 'nhan_vien';
      document.getElementById('newMemberCanEdit').checked = !!userObj.can_edit_map;
      document.getElementById('newMemberDai').value = userObj.id_dai || '';
      document.getElementById('newMemberTram').value = userObj.id_tram || '';
    }
  } else {
    document.getElementById('accountModalTitle').innerText = "👥 Thêm Tài Khoản Mới";
    document.getElementById('editingAccountId').value = "";
    if (accountInput) accountInput.value = "";
    document.getElementById('newMemberPass').value = "";
    document.getElementById('newMemberRole').value = "nhan_vien";
    document.getElementById('newMemberCanEdit').checked = false;
  }

  openModal('addMemberModal');
}

async function saveAccountAction() {
  var accountInput = document.getElementById('newMemberAccount') || document.getElementById('loginEmail');
  var username = accountInput ? accountInput.value.trim() : '';
  var password = document.getElementById('newMemberPass').value.trim();
  var role = document.getElementById('newMemberRole').value;
  var canEdit = document.getElementById('newMemberCanEdit').checked;
  var idDai = document.getElementById('newMemberDai').value || null;
  var idTram = document.getElementById('newMemberTram').value || null;

  if (!username) {
    alert("⚠️ Vui lòng nhập tên tài khoản / email!");
    return;
  }

  var payload = {
    username: username,
    role: role,
    can_edit_map: canEdit,
    id_dai: idDai ? Number(idDai) : null,
    id_tram: idTram ? Number(idTram) : null
  };
  if (password) payload.password = password;

  try {
    if (navigator.onLine && typeof supabaseClient !== 'undefined') {
      var { error } = await supabaseClient.from('users').upsert([payload]);
      if (error) throw error;
      alert("✅ Đã lưu thông tin tài khoản thành công!");
    } else {
      await idbThemHangDoiSync({ actionType: 'SAVE_USER', payload: payload });
      alert("🔄 Đã lưu vào hàng đợi đồng bộ Offline!");
    }

    closeModals();
    if (typeof taiDuLieuSupabase === 'function') await taiDuLieuSupabase(true);
    openModal('adminMasterModal', 'tab-accounts');
  } catch (err) {
    alert("❌ Lỗi khi lưu tài khoản: " + err.message);
  }
}

/**
 * 5. XỬ LÝ FORM THÊM / SỬA DANH MỤC PHỤ (ĐÀI, TRẠM, TUYẾN, ĐOẠN)
 */
function moFormThemDai(id) { moGenericAuxForm('dai_vt', id); }
function moFormThemTram(id) { moGenericAuxForm('tram_vt', id); }
function moFormThemTuyen(id) { moGenericAuxForm('tuyen_cap', id); }
function moFormThemDoan(id) { moGenericAuxForm('doan_cap', id); }

function moGenericAuxForm(tableType, recordId) {
  var state = AppStore.getState();
  document.getElementById('auxTableType').value = tableType;
  document.getElementById('auxRecordId').value = recordId || '';

  var fieldsContainer = document.getElementById('auxFormFields');
  var html = '';

  if (tableType === 'dai_vt') {
    var rec = (state.rawDaiList || []).find(d => String(d.id_dai) === String(recordId)) || {};
    document.getElementById('auxModalTitle').innerText = recordId ? "✏️ Sửa Đài VT" : "➕ Thêm Đài VT";
    html = `<div class="form-group"><label>Tên Đài VT:</label><input type="text" id="auxTen" value="${rec.ten_dai || ''}"></div>`;
  } 
  else if (tableType === 'tram_vt') {
    var rec = (state.rawTramList || []).find(t => String(t.id_tram) === String(recordId)) || {};
    document.getElementById('auxModalTitle').innerText = recordId ? "✏️ Sửa Trạm VT" : "➕ Thêm Trạm VT";
    html = `
      <div class="form-group"><label>Tên Trạm VT:</label><input type="text" id="auxTen" value="${rec.ten_tram || ''}"></div>
      <div class="form-group"><label>Đài Quản Lý:</label><select id="auxDaiId">
        ${(state.rawDaiList || []).map(d => `<option value="${d.id_dai}" ${String(d.id_dai) === String(rec.id_dai) ? 'selected' : ''}>${d.ten_dai}</option>`).join('')}
      </select></div>
    `;
  }
  else if (tableType === 'tuyen_cap') {
    var rec = (state.rawTuyenList || []).find(t => String(t.id_tuyen) === String(recordId)) || {};
    document.getElementById('auxModalTitle').innerText = recordId ? "✏️ Sửa Tuyến Cáp" : "➕ Thêm Tuyến Cáp";
    html = `
      <div class="form-group"><label>Mã Tuyến:</label><input type="text" id="auxMa" value="${rec.ma_tuyen || ''}"></div>
      <div class="form-group"><label>Tên Tuyến Cáp:</label><input type="text" id="auxTen" value="${rec.ten_tuyen || ''}"></div>
    `;
  }
  else if (tableType === 'doan_cap') {
    var rec = (state.rawDoanList || []).find(d => String(d.id_doan) === String(recordId)) || {};
    document.getElementById('auxModalTitle').innerText = recordId ? "✏️ Sửa Đoạn Cáp" : "➕ Thêm Đoạn Cáp";
    html = `
      <div class="form-group"><label>Mã Đoạn:</label><input type="text" id="auxMa" value="${rec.ma_doan || ''}"></div>
      <div class="form-group"><label>Thuộc Tuyến Cáp:</label><select id="auxTuyenId">
        ${(state.rawTuyenList || []).map(t => `<option value="${t.id_tuyen}" ${String(t.id_tuyen) === String(rec.id_tuyen) ? 'selected' : ''}>${t.ten_tuyen}</option>`).join('')}
      </select></div>
      <div class="form-group"><label>Trạm Quản Lý:</label><select id="auxTramId">
        ${(state.rawTramList || []).map(t => `<option value="${t.id_tram}" ${String(t.id_tram) === String(rec.id_tram) ? 'selected' : ''}>${t.ten_tram}</option>`).join('')}
      </select></div>
    `;
  }

  fieldsContainer.innerHTML = html;
  openModal('genericAuxModal');
}

async function saveAuxRecord() {
  var tableType = document.getElementById('auxTableType').value;
  var recordId = document.getElementById('auxRecordId').value;
  var payload = {};

  if (tableType === 'dai_vt') {
    payload.ten_dai = document.getElementById('auxTen').value.trim();
    if (recordId) payload.id_dai = Number(recordId);
  } else if (tableType === 'tram_vt') {
    payload.ten_tram = document.getElementById('auxTen').value.trim();
    payload.id_dai = Number(document.getElementById('auxDaiId').value);
    if (recordId) payload.id_tram = Number(recordId);
  } else if (tableType === 'tuyen_cap') {
    payload.ma_tuyen = document.getElementById('auxMa').value.trim();
    payload.ten_tuyen = document.getElementById('auxTen').value.trim();
    if (recordId) payload.id_tuyen = Number(recordId);
  } else if (tableType === 'doan_cap') {
    payload.ma_doan = document.getElementById('auxMa').value.trim();
    payload.id_tuyen = Number(document.getElementById('auxTuyenId').value);
    payload.id_tram = Number(document.getElementById('auxTramId').value);
    if (recordId) payload.id_doan = Number(recordId);
  }

  try {
    if (navigator.onLine && typeof supabaseClient !== 'undefined') {
      var { error } = await supabaseClient.from(tableType).upsert([payload]);
      if (error) throw error;
      alert("✅ Lưu danh mục thành công!");
    } else {
      await idbThemHangDoiSync({ actionType: 'SAVE_AUX', payload: { table: tableType, data: payload } });
      alert("🔄 Đã lưu vào hàng đợi Offline!");
    }

    closeModals();
    if (typeof taiDuLieuSupabase === 'function') await taiDuLieuSupabase(true);
    
    var tabMap = { dai_vt: 'tab-dai', tram_vt: 'tab-tram', tuyen_cap: 'tab-tuyen', doan_cap: 'tab-doan' };
    openModal('adminMasterModal', tabMap[tableType]);
  } catch (err) {
    alert("❌ Lỗi khi lưu: " + err.message);
  }
}

/**
 * 6. XÓA BẢN GHI VÀ KIỂM TRA RÀNG BUỘC PHỤ THUỘC CSDL
 */
async function deleteAdminRecord(tableName, idItem) {
  var state = AppStore.getState();

  // Kiểm tra ràng buộc
  if (tableName === 'dai_vt') {
    var countTram = (state.rawTramList || []).filter(t => String(t.id_dai) === String(idItem)).length;
    if (countTram > 0) return alert(`⚠️ KHÔNG THỂ XÓA: Đài này chứa ${countTram} Trạm viễn thông!`);
  }
  if (tableName === 'tram_vt') {
    var countDoan = (state.rawDoanList || []).filter(d => String(d.id_tram) === String(idItem)).length;
    if (countDoan > 0) return alert(`⚠️ KHÔNG THỂ XÓA: Trạm này đang quản lý ${countDoan} Đoạn cáp!`);
  }
  if (tableName === 'tuyen_cap') {
    var countDoan = (state.rawDoanList || []).filter(d => String(d.id_tuyen) === String(idItem)).length;
    if (countDoan > 0) return alert(`⚠️ KHÔNG THỂ XÓA: Tuyến cáp này chứa ${countDoan} Đoạn cáp!`);
  }

  if (!confirm("❓ Bạn có chắc chắn muốn xóa bản ghi này?")) return;

  try {
    if (navigator.onLine && typeof supabaseClient !== 'undefined') {
      var keyField = (tableName === 'users') ? 'username' : 'id_' + tableName.replace('_vt', '').replace('_cap', '');
      var { error } = await supabaseClient.from(tableName).delete().eq(keyField, idItem);
      if (error) throw error;
      alert("✅ Đã xóa bản ghi thành công!");
    } else {
      await idbThemHangDoiSync({ actionType: 'DELETE_RECORD', payload: { table: tableName, id: idItem } });
      alert("🔄 Đã lưu lệnh xóa vào hàng đợi Offline!");
    }

    if (typeof taiDuLieuSupabase === 'function') await taiDuLieuSupabase(true);
    renderAllAdminTables();
  } catch (err) {
    alert("❌ Lỗi khi xóa: " + err.message);
  }
}
