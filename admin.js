// ==========================================================================
// TỆP ADMIN.JS - ĐIỀU KHIỂN GIAO DIỆN QUẢN TRỊ (TỐI ƯU UX KHÔNG ĐÓNG FORM TỔNG)
// ==========================================================================

var confirmPromiseResolver = null;

function openModal(modalId, tabId) {
  closeModals();
  var targetModal = document.getElementById(modalId);
  if (targetModal) targetModal.style.display = 'flex';

  if (modalId === 'adminMasterModal') {
    renderAllAdminTables();
    if (tabId) switchAdminTab(tabId);
  }
}

function closeModals() {
  document.querySelectorAll('.app-modal').forEach(m => m.style.display = 'none');
}

function switchAdminTab(tabPaneId) {
  document.querySelectorAll('.admin-tabs .tab-btn').forEach(btn => {
    if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(tabPaneId)) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  document.querySelectorAll('.tab-pane').forEach(pane => {
    if (pane.id === tabPaneId) pane.classList.add('active');
    else pane.classList.remove('active');
  });
}

function getCurrentUser() {
  var state = (typeof AppStore !== 'undefined') ? AppStore.getState() : {};
  return state.currentUser || (typeof currentUser !== 'undefined' ? currentUser : null) || JSON.parse(localStorage.getItem('tnn_user')) || {
    username: 'guest',
    role: 'nhan_vien',
    id_dai: null,
    id_tram: null
  };
}

function checkAdminPermission(action, idDaiTarget, idTramTarget, silent = true) {
  var user = getCurrentUser();
  var role = user.role || user.user_role;

  if (role === 'sys_admin' || role === 'admin_sys') return true;

  if (role === 'nhan_vien' || role === 'member' || role === 'tram_user') {
    if (action !== 'XEM') {
      if (!silent) alert("⛔ Tài khoản Nhân viên chỉ có quyền xem dữ liệu!");
      return false;
    }
    return true;
  }

  if (role === 'admin_dai' || role === 'dai_admin') {
    var userDai = String(user.id_dai || user.idDai || '');
    if (idDaiTarget && String(idDaiTarget) !== userDai) {
      if (!silent) alert("⛔ Bạn chỉ có quyền quản lý dữ liệu thuộc Đài của mình!");
      return false;
    }
    return true;
  }

  if (role === 'admin_tram' || role === 'tram_admin') {
    var userTram = String(user.id_tram || user.idTram || '');
    if (idTramTarget && String(idTramTarget) !== userTram) {
      if (!silent) alert("⛔ Bạn chỉ có quyền quản lý dữ liệu thuộc Trạm của mình!");
      return false;
    }
    return true;
  }

  return false;
}

function renderAllAdminTables() {
  renderMasterAccountTable();
  renderMasterDaiTable();
  renderMasterTramTable();
  renderMasterTuyenTable();
  renderMasterDoanTable();
}

/** BẢNG TÀI KHOẢN */
function renderMasterAccountTable() {
  var tbody = document.getElementById('masterAccountTableBody');
  if (!tbody) return;

  var state = AppStore.getState();
  var users = state.rawUserList || (typeof rawUserList !== 'undefined' ? rawUserList : []);

  if (!users || users.length === 0) {
    var curr = getCurrentUser();
    if (curr && (curr.username || curr.email)) users = [curr];
  }

  var daiList = state.rawDaiList || state.daiList || [];
  var tramList = state.rawTramList || state.tramList || [];

  var listDaiMap = {};
  daiList.forEach(d => { var idDai = getSafeStrId(d, ['id_dai', 'id']); if (idDai) listDaiMap[idDai] = d.ten_dai || d.ten; });
  var listTramMap = {};
  tramList.forEach(t => { var idTram = getSafeStrId(t, ['id_tram', 'id', 'id_tram_vt']); if (idTram) listTramMap[idTram] = t.ten_tram || t.ten; });

  var user = getCurrentUser();
  if (user.role === 'admin_dai' || user.role === 'dai_admin') {
    users = users.filter(u => String(u.id_dai || u.idDai) === String(user.id_dai || user.idDai));
  } else if (user.role === 'admin_tram' || user.role === 'tram_admin') {
    users = users.filter(u => String(u.id_tram || u.idTram) === String(user.id_tram || user.idTram));
  }

  var html = users.map(u => {
    var accountName = u.username || u.email || u.user_name || u.name || 'Tài khoản';
    var roleName = u.role || u.user_role || 'nhan_vien';
    var daiId = getSafeStrId(u, ['id_dai', 'idDai', 'dai_id']);
    var tramId = getSafeStrId(u, ['id_tram', 'idTram', 'tram_id']);
    var canEdit = !!(u.can_edit_map || u.canEditMap || u.can_edit);
    
    var tenDai = u.ten_dai || listDaiMap[daiId] || 'Tất cả';
    var tenTram = u.ten_tram || listTramMap[tramId] || 'Tất cả';

    return `
      <tr>
        <td><b>${accountName}</b></td>
        <td><span style="background:var(--primary-blue); color:#fff; padding:2px 6px; border-radius:3px; font-size:12px;">${roleName}</span></td>
        <td>${tenDai}</td>
        <td>${tenTram}</td>
        <td>${canEdit ? '✅ Có' : '❌ Không'}</td>
        <td style="white-space: nowrap;">
          <button class="btn-small btn-success" onclick="chuanBiFormThemThanhVien('${accountName}')">✏️ Sửa</button>
          <button class="btn-small btn-danger" onclick="deleteAdminRecord('tai_khoan', '${accountName}')">🗑️ Xóa</button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = html || '<tr><td colspan="6" style="text-align:center;">Chưa có dữ liệu tài khoản</td></tr>';
}

/** BẢNG ĐÀI VIỄN THÔNG */
function renderMasterDaiTable() {
  var tbody = document.getElementById('masterDaiTableBody');
  if (!tbody) return;

  var state = AppStore.getState();
  var list = state.rawDaiList || state.daiList || [];
  var user = getCurrentUser();

  if (user.role === 'admin_dai' || user.role === 'dai_admin') {
    list = list.filter(d => String(d.id_dai || d.id) === String(user.id_dai || user.idDai));
  }

  var html = list.map(item => {
    var idDai = getSafeStrId(item, ['id_dai', 'id']);
    return `
      <tr>
        <td>${idDai}</td>
        <td><b>${item.ten_dai || item.ten || 'Đài VT'}</b></td>
        <td style="white-space: nowrap;">
          ${checkAdminPermission('SUA', idDai, null, true) ? `<button class="btn-small btn-success" onclick="moFormThemDai(${idDai})">✏️ Sửa</button>` : ''}
          ${checkAdminPermission('XOA', idDai, null, true) ? `<button class="btn-small btn-danger" onclick="deleteAdminRecord('dai_vt', ${idDai})">🗑️ Xóa</button>` : ''}
        </td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = html || '<tr><td colspan="3" style="text-align:center;">Chưa có dữ liệu Đài</td></tr>';
}

/** BẢNG TRẠM VIỄN THÔNG */
function renderMasterTramTable() {
  var tbody = document.getElementById('masterTramTableBody');
  if (!tbody) return;

  var state = AppStore.getState();
  var list = state.rawTramList || state.tramList || [];
  var daiList = state.rawDaiList || state.daiList || [];
  
  var listDaiMap = Object.fromEntries(daiList.map(d => [getSafeStrId(d, ['id_dai', 'id']), d.ten_dai || d.ten]));

  var user = getCurrentUser();
  if (user.role === 'admin_dai' || user.role === 'dai_admin') {
    list = list.filter(t => String(t.id_dai || t.dai_id) === String(user.id_dai || user.idDai));
  }

  var html = list.map(item => {
    var idTram = getSafeStrId(item, ['id_tram', 'id']);
    var idDai = getSafeStrId(item, ['id_dai', 'dai_id']);
    var tenDai = item.ten_dai || listDaiMap[idDai] || 'Chưa gán';

    return `
      <tr>
        <td>${idTram}</td>
        <td><b>${item.ten_tram || item.ten || 'Trạm VT'}</b></td>
        <td>🏢 ${tenDai}</td>
        <td style="white-space: nowrap;">
          ${checkAdminPermission('SUA', idDai, idTram, true) ? `<button class="btn-small btn-success" onclick="moFormThemTram(${idTram})">✏️ Sửa</button>` : ''}
          ${checkAdminPermission('XOA', idDai, idTram, true) ? `<button class="btn-small btn-danger" onclick="deleteAdminRecord('tram_vt', ${idTram})">🗑️ Xóa</button>` : ''}
        </td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = html || '<tr><td colspan="4" style="text-align:center;">Chưa có dữ liệu Trạm</td></tr>';
}

/** BẢNG TUYẾN CÁP */
function renderMasterTuyenTable() {
  var tbody = document.getElementById('masterTuyenTableBody');
  if (!tbody) return;

  var state = AppStore.getState();
  var list = state.rawTuyenList || state.tuyenList || [];

  var html = list.map(item => {
    var idTuyen = getSafeStrId(item, ['id_tuyen_cap', 'id_tuyen', 'id']);
    return `
      <tr>
        <td>${idTuyen}</td>
        <td>${item.ma_tuyencap || item.ma_tuyen || 'N/A'}</td>
        <td><b>${item.ten_tuyen || item.ten || 'Tuyến cáp'}</b></td>
        <td style="white-space: nowrap;">
          ${checkAdminPermission('SUA', null, null, true) ? `<button class="btn-small btn-success" onclick="moFormThemTuyen(${idTuyen})">✏️ Sửa</button>` : ''}
          ${checkAdminPermission('XOA', null, null, true) ? `<button class="btn-small btn-danger" onclick="deleteAdminRecord('tuyen_cap', ${idTuyen})">🗑️ Xóa</button>` : ''}
        </td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = html || '<tr><td colspan="4" style="text-align:center;">Chưa có dữ liệu Tuyến cáp</td></tr>';
}

/** BẢNG ĐOẠN CÁP */
function renderMasterDoanTable() {
  var tbody = document.getElementById('masterDoanTableBody');
  if (!tbody) return;

  var state = AppStore.getState();
  var list = state.rawDoanList || state.doanCapList || [];

  var user = getCurrentUser();
  if (user.role === 'admin_tram' || user.role === 'tram_admin') {
    list = list.filter(d => String(d.id_tram || d.tram_id || d.id_tram_vt) === String(user.id_tram || user.idTram));
  }

  var html = list.map(item => {
    var idDoan = getSafeStrId(item, ['id_doan_cap', 'id_doan', 'id']);
    var idTuyen = getSafeStrId(item, ['id_tuyen', 'tuyen_cap_id', 'id_tuyen_cap', 'ma_tuyen']);
    var idTram = getSafeStrId(item, ['id_tram', 'tram_id', 'id_tram_vt', 'tram_ql']);
    var maDoan = item.ma_doancap || item.ma_doan || item.ten_doancap || 'N/A';

    var tenTuyen = item.ten_tuyen || (idTuyen ? `ID: ${idTuyen}` : 'Chưa gán');
    var tenTram = item.ten_tram || (idTram ? `ID: ${idTram}` : 'Chưa gán');

    return `
      <tr>
        <td>${idDoan}</td>
        <td>${maDoan}</td>
        <td>🔌 ${tenTuyen}</td>
        <td>🏠 ${tenTram}</td>
        <td style="white-space: nowrap;">
          ${checkAdminPermission('SUA', null, idTram, true) ? `<button class="btn-small btn-success" onclick="moFormThemDoan(${idDoan})">✏️ Sửa</button>` : ''}
          ${checkAdminPermission('XOA', null, idTram, true) ? `<button class="btn-small btn-danger" onclick="deleteAdminRecord('doan_cap', ${idDoan})">🗑️ Xóa</button>` : ''}
        </td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = html || '<tr><td colspan="5" style="text-align:center;">Chưa có dữ liệu Đoạn cáp</td></tr>';
}

/** CHUẨN BỊ FORM THÊM/SỬA TÀI KHOẢN */
function chuanBiFormThemThanhVien(usernameToEdit) {
  var state = AppStore.getState();
  var daiList = state.rawDaiList || state.daiList || [];
  var tramList = state.rawTramList || state.tramList || [];

  var selectDai = document.getElementById('newMemberDai');
  var selectTram = document.getElementById('newMemberTram');

  if (selectDai) {
    selectDai.innerHTML = '<option value="">-- Tất cả Đài --</option>' + 
      daiList.map(d => `<option value="${getSafeStrId(d, ['id_dai', 'id'])}">${d.ten_dai || d.ten}</option>`).join('');
  }
  if (selectTram) {
    selectTram.innerHTML = '<option value="">-- Tất cả Trạm --</option>' + 
      tramList.map(t => `<option value="${getSafeStrId(t, ['id_tram', 'id'])}">${t.ten_tram || t.ten}</option>`).join('');
  }

  var accountInput = document.getElementById('newMemberAccount') || document.getElementById('loginEmail');
  var users = state.rawUserList || [];

  if (usernameToEdit) {
    var userObj = users.find(u => (u.username || u.email || u.user_name || u.name) === usernameToEdit);
    document.getElementById('accountModalTitle').innerText = "✏️ Sửa Tài Khoản";
    document.getElementById('editingAccountId').value = usernameToEdit;
    if (accountInput) accountInput.value = usernameToEdit;
    if (userObj) {
      document.getElementById('newMemberRole').value = userObj.role || 'nhan_vien';
      document.getElementById('newMemberCanEdit').checked = !!(userObj.can_edit_map || userObj.canEditMap);
      document.getElementById('newMemberDai').value = getSafeStrId(userObj, ['id_dai', 'idDai']);
      document.getElementById('newMemberTram').value = getSafeStrId(userObj, ['id_tram', 'idTram']);
    }
  } else {
    document.getElementById('accountModalTitle').innerText = "👥 Thêm Tài Khoản Mới";
    document.getElementById('editingAccountId').value = "";
    if (accountInput) accountInput.value = "";
    document.getElementById('newMemberPass').value = "";
    document.getElementById('newMemberRole').value = "nhan_vien";
    document.getElementById('newMemberCanEdit').checked = false;
  }

  // TỐI ƯU UX: Chỉ hiển thị form con lên đè form quản trị
  var modalForm = document.getElementById('addMemberModal');
  if (modalForm) modalForm.style.display = 'flex';
}

/** LƯU TÀI KHOẢN (Chỉ đóng form con) */
async function saveAccountAction() {
  if (!checkAdminPermission('SUA', null, null, false)) return;

  var accountInput = document.getElementById('newMemberAccount');
  var username = accountInput ? accountInput.value.trim() : '';
  var password = document.getElementById('newMemberPass').value.trim();
  var role = document.getElementById('newMemberRole').value;
  var canEdit = document.getElementById('newMemberCanEdit').checked;
  var idDai = document.getElementById('newMemberDai').value || null;
  var idTram = document.getElementById('newMemberTram').value || null;

  if (!username) { alert("⚠️ Vui lòng nhập tên tài khoản / email!"); return; }

  var payload = {
    email: username, username: username, role: role, can_edit_map: canEdit,
    id_dai: idDai ? Number(idDai) : null, id_tram: idTram ? Number(idTram) : null
  };
  if (password) payload.password = password;

  try {
    if (navigator.onLine && typeof supabaseClient !== 'undefined') {
      var { error } = await supabaseClient.from('tai_khoan').upsert([payload]);
      if (error) throw error;
      if(typeof showToast === 'function') showToast("Đã lưu thông tin tài khoản thành công!", "success");
    } else {
      if(typeof idbThemHangDoiSync === 'function') await idbThemHangDoiSync({ actionType: 'SAVE_USER', payload: payload });
    }

    // TỐI ƯU UX: Ẩn form con, giữ form Admin
    var modalForm = document.getElementById('addMemberModal');
    if (modalForm) modalForm.style.display = 'none';

    if (typeof taiDuLieuSupabase === 'function') await taiDuLieuSupabase(true);
  } catch (err) { alert("❌ Lỗi khi lưu tài khoản: " + err.message); }
}

function moFormThemDai(id) { moGenericAuxForm('dai_vt', id); }
function moFormThemTram(id) { moGenericAuxForm('tram_vt', id); }
function moFormThemTuyen(id) { moGenericAuxForm('tuyen_cap', id); }
function moFormThemDoan(id) { moGenericAuxForm('doan_cap', id); }

/** CHUẨN BỊ FORM THÊM/SỬA DANH MỤC */
function moGenericAuxForm(tableType, recordId) {
  var state = AppStore.getState();
  var daiList = state.rawDaiList || state.daiList || [];
  var tramList = state.rawTramList || state.tramList || [];
  var tuyenList = state.rawTuyenList || state.tuyenList || [];

  document.getElementById('auxTableType').value = tableType;
  document.getElementById('auxRecordId').value = recordId || '';

  var fieldsContainer = document.getElementById('auxFormFields');
  var html = '';

  if (tableType === 'dai_vt') {
    var rec = daiList.find(d => String(getSafeStrId(d, ['id_dai', 'id'])) === String(recordId)) || {};
    document.getElementById('auxModalTitle').innerText = recordId ? "✏️ Sửa Đài VT" : "➕ Thêm Đài VT";
    html = `<div class="form-group"><label>Tên Đài VT:</label><input type="text" id="auxTen" class="form-control" value="${rec.ten_dai || rec.ten || ''}"></div>`;
  } 
  else if (tableType === 'tram_vt') {
    var rec = tramList.find(t => String(getSafeStrId(t, ['id_tram', 'id'])) === String(recordId)) || {};
    document.getElementById('auxModalTitle').innerText = recordId ? "✏️ Sửa Trạm VT" : "➕ Thêm Trạm VT";
    html = `
      <div class="form-group"><label>Tên Trạm VT:</label><input type="text" id="auxTen" class="form-control" value="${rec.ten_tram || rec.ten || ''}"></div>
      <div class="form-group"><label>Đài Quản Lý:</label><select id="auxDaiId" class="form-control">
        ${daiList.map(d => { var dId = getSafeStrId(d, ['id_dai', 'id']); return `<option value="${dId}" ${String(dId) === String(rec.id_dai \vert{}\vert{} rec.dai_id) ? 'selected' : ''}>${d.ten_dai || d.ten}</option>`; }).join('')}
      </select></div>
    `;
  }
  else if (tableType === 'tuyen_cap') {
    var rec = tuyenList.find(t => String(getSafeStrId(t, ['id_tuyen_cap', 'id_tuyen', 'id'])) === String(recordId)) || {};
    document.getElementById('auxModalTitle').innerText = recordId ? "✏️ Sửa Tuyến Cáp" : "➕ Thêm Tuyến Cáp";
    html = `
      <div class="form-group"><label>Mã Tuyến:</label><input type="text" id="auxMa" class="form-control" value="${rec.ma_tuyencap || rec.ma_tuyen || ''}"></div>
      <div class="form-group"><label>Tên Tuyến Cáp:</label><input type="text" id="auxTen" class="form-control" value="${rec.ten_tuyen || rec.ten || ''}"></div>
    `;
  }
  else if (tableType === 'doan_cap') {
    var doanList = state.rawDoanList || state.doanCapList || [];
    var rec = doanList.find(d => String(getSafeStrId(d, ['id_doan_cap', 'id_doan', 'id'])) === String(recordId)) || {};
    document.getElementById('auxModalTitle').innerText = recordId ? "✏️ Sửa Đoạn Cáp" : "➕ Thêm Đoạn Cáp";
    html = `
      <div class="form-group"><label>Mã Đoạn:</label><input type="text" id="auxMa" class="form-control" value="${rec.ma_doancap || rec.ma_doan || ''}"></div>
      <div class="form-group"><label>Thuộc Tuyến Cáp:</label><select id="auxTuyenId" class="form-control">
        ${tuyenList.map(t => { var tId = getSafeStrId(t, ['id_tuyen_cap', 'id_tuyen', 'id']); return `<option value="${tId}" ${String(tId) === String(rec.id_tuyen \vert{}\vert{} rec.tuyen_cap_id) ? 'selected' : ''}>${t.ten_tuyen || t.ten}</option>`; }).join('')}
      </select></div>
      <div class="form-group"><label>Trạm Quản Lý:</label><select id="auxTramId" class="form-control">
        ${tramList.map(t => { var trId = getSafeStrId(t, ['id_tram', 'id']); return `<option value="${trId}" ${String(trId) === String(rec.id_tram) ? 'selected' : ''}>${t.ten_tram || t.ten}</option>`; }).join('')}
      </select></div>
    `;
  }

  fieldsContainer.innerHTML = html;
  var modalForm = document.getElementById('genericAuxModal');
  if (modalForm) modalForm.style.display = 'flex';
}

/** LƯU DANH MỤC (Chỉ đóng form con, không đóng form Admin) */
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
    payload.ma_tuyencap = document.getElementById('auxMa').value.trim();
    payload.ten_tuyen = document.getElementById('auxTen').value.trim();
    if (recordId) payload.id_tuyen_cap = Number(recordId);
  } else if (tableType === 'doan_cap') {
    payload.ma_doancap = document.getElementById('auxMa').value.trim();
    payload.id_tuyen = Number(document.getElementById('auxTuyenId').value);
    payload.id_tram = Number(document.getElementById('auxTramId').value); 
    if (recordId) payload.id_doan_cap = Number(recordId);
  }

  try {
    if (navigator.onLine && typeof supabaseClient !== 'undefined') {
      var { error } = await supabaseClient.from(tableType).upsert([payload]);
      if (error) throw error;
      if (typeof showToast === 'function') showToast("Lưu danh mục thành công!", "success");
    } else {
      if (typeof idbThemHangDoiSync === 'function') await idbThemHangDoiSync({ actionType: 'SAVE_AUX', payload: { table: tableType, data: payload } });
    }

    // TỐI ƯU UX: Ẩn form phụ, giữ nguyên form Quản trị
    var modalForm = document.getElementById('genericAuxModal');
    if (modalForm) modalForm.style.display = 'none';

    if (typeof taiDuLieuSupabase === 'function') await taiDuLieuSupabase(true);
  } catch (err) { alert("❌ Lỗi khi lưu: " + err.message); }
}

/** XÓA BẢN GHI (Xóa xong tự làm mới bảng, không đóng Admin) */
async function deleteAdminRecord(tableName, idItem) {
  if (!checkAdminPermission('XOA', null, null, false)) return;

  var state = AppStore.getState();
  var tramList = state.rawTramList || state.tramList || [];
  var doanList = state.rawDoanList || state.doanCapList || [];

  if (tableName === 'dai_vt') {
    var countTram = tramList.filter(t => String(getSafeStrId(t, ['id_dai', 'dai_id'])) === String(idItem)).length;
    if (countTram > 0) return alert(`⚠️ KHÔNG THỂ XÓA: Đài này chứa ${countTram} Trạm viễn thông!`);
  }
  if (tableName === 'tram_vt') {
    var countDoan = doanList.filter(d => String(getSafeStrId(d, ['id_tram', 'tram_id'])) === String(idItem)).length;
    if (countDoan > 0) return alert(`⚠️ KHÔNG THỂ XÓA: Trạm này đang quản lý ${countDoan} Đoạn cáp!`);
  }
  if (tableName === 'tuyen_cap') {
    var countDoan = doanList.filter(d => String(getSafeStrId(d, ['id_tuyen', 'tuyen_cap_id'])) === String(idItem)).length;
    if (countDoan > 0) return alert(`⚠️ KHÔNG THỂ XÓA: Tuyến cáp này chứa ${countDoan} Đoạn cáp!`);
  }

  if (!confirm("❓ Bạn có chắc chắn muốn xóa bản ghi này?")) return;

  try {
    if (navigator.onLine && typeof supabaseClient !== 'undefined') {
      var keyField = (tableName === 'tai_khoan') ? 'email' : (tableName === 'doan_cap' ? 'id_doan_cap' : (tableName === 'tuyen_cap' ? 'id_tuyen_cap' : 'id_' + tableName.replace('_vt', '')));
      var { error } = await supabaseClient.from(tableName).delete().eq(keyField, idItem);
      if (error) throw error;
    } else {
      if (typeof idbThemHangDoiSync === 'function') await idbThemHangDoiSync({ actionType: 'DELETE_RECORD', payload: { table: tableName, id: idItem } });
    }

    if (typeof taiDuLieuSupabase === 'function') await taiDuLieuSupabase(true);
  } catch (err) { alert("❌ Lỗi khi xóa: " + err.message); }
}

/** QUẢN LÝ ĐIỂM HẠ TẦNG TRỰC TIẾP TRÊN BẢN ĐỒ */
function openCrudModalForPoint(actionType, pointData) {
  var modal = document.getElementById('crudModal');
  if (!modal) return;

  document.getElementById('crudActionType').value = actionType || 'ADD';
  document.getElementById('crudObjectId').value = pointData.id || '';
  document.getElementById('crudObjectName').value = pointData.ten || '';
  document.getElementById('crudObjectLyTrinh').value = pointData.lyTrinh || '';
  document.getElementById('crudObjectLat').value = pointData.lat ? pointData.lat.toFixed(6) : '';
  document.getElementById('crudObjectLng').value = pointData.lng ? pointData.lng.toFixed(6) : '';

  var selectLoai = document.getElementById('crudObjectLoai');
  if (selectLoai) {
    selectLoai.innerHTML = `
      <option value="1" ${Number(pointData.idLoaiDiem) === 1 ? 'selected' : ''}>💈 Cột viễn thông</option>
      <option value="2" ${Number(pointData.idLoaiDiem) === 2 ? 'selected' : ''}>🔲 Bể cáp quang</option>
      <option value="3" ${Number(pointData.idLoaiDiem) === 3 ? 'selected' : ''}>🔵 Mốc cáp / Mốc QL</option>
      <option value="4" ${Number(pointData.idLoaiDiem) === 4 ? 'selected' : ''}>🔀 Măng xông cáp quang</option>
    `;
  }

  document.getElementById('crudTitle').innerText = actionType === 'ADD' ? '➕ Thêm Điểm Mới' : '✏️ Cập Nhật Điểm';
  modal.style.display = 'flex';
}

async function executeCrudAction() {
  if (!checkAdminPermission('SUA', null, null, false)) return;

  var actionType = document.getElementById('crudActionType').value;
  var objectId = document.getElementById('crudObjectId').value;
  var name = document.getElementById('crudObjectName').value.trim();
  var lyTrinh = document.getElementById('crudObjectLyTrinh').value.trim();
  var idLoai = Number(document.getElementById('crudObjectLoai').value);
  var lat = parseFloat(document.getElementById('crudObjectLat').value);
  var lng = parseFloat(document.getElementById('crudObjectLng').value);

  if (!name) { alert("⚠️ Vui lòng nhập tên điểm hạ tầng!"); return; }

  var payload = { ten_diem: name, ly_trinh: lyTrinh, id_loaidiem: idLoai, lat: lat, long: lng };
  if (actionType === 'EDIT' && objectId) payload.id_diem = Number(objectId);

  try {
    if (navigator.onLine && typeof supabaseClient !== 'undefined') {
      var { error } = await supabaseClient.from('diem_ha_tang').upsert([payload]);
      if (error) throw error;
    } else {
      if (typeof idbThemHangDoiSync === 'function') await idbThemHangDoiSync({ actionType: 'SAVE_GIS_POINT', payload: payload });
    }

    var modal = document.getElementById('crudModal');
    if (modal) modal.style.display = 'none';

    if (typeof taiDuLieuSupabase === 'function') await taiDuLieuSupabase(true);
    if (typeof veLaiTuyenAB === 'function') veLaiTuyenAB();
  } catch (err) { alert("❌ Lỗi khi lưu điểm hạ tầng: " + err.message); }
}

/** HỘP THOẠI XÁC NHẬN TÙY CHỈNH (CUSTOM CONFIRM) */
function showCustomConfirm(message, title) {
  return new Promise(function(resolve) {
    confirmPromiseResolver = resolve;
    var modal = document.getElementById('customConfirmModal');
    if (modal) {
      if (title) document.getElementById('confirmModalTitle').innerText = title;
      document.getElementById('confirmModalMessage').innerText = message;
      modal.style.display = 'flex';
    } else {
      resolve(confirm(message));
    }
  });
}

function resolveConfirm(result) {
  var modal = document.getElementById('customConfirmModal');
  if (modal) modal.style.display = 'none';
  if (confirmPromiseResolver) {
    confirmPromiseResolver(result);
    confirmPromiseResolver = null;
  }
}

/** CÁC HÀM ĐÓNG FORM CON LẺ (Dùng cho nút Hủy) */
function closeGenericAuxModal() { var m = document.getElementById('genericAuxModal'); if (m) m.style.display = 'none'; }
function closeAddMemberModal() { var m = document.getElementById('addMemberModal'); if (m) m.style.display = 'none'; }
