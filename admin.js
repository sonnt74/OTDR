// ==========================================================================
// TỆP ADMIN.JS - ĐIỀU KHIỂN QUẢN TRỊ, ĐỔI MẬT KHẨU & TẢI DỮ LIỆU AN TOÀN
// ==========================================================================

var confirmPromiseResolver = null;

async function openModal(modalId, tabId) {
  closeModals();
  var targetModal = document.getElementById(modalId);
  if (targetModal) targetModal.style.display = 'flex';

  // Tự động ẩn bảng điều khiển khi mở quản trị
  var panel = document.getElementById('control-panel');
  if (panel) panel.style.display = 'none';

  if (modalId === 'adminMasterModal') {
    // Ép buộc tải dữ liệu trực tiếp từ Supabase để các bảng quản trị luôn có dữ liệu hiển thị
    try {
      if (navigator.onLine && typeof supabaseClient !== 'undefined') {
        var [uRes, dRes, tRes, tuRes, doRes] = await Promise.all([
          supabaseClient.from('tai_khoan').select('*'),
          supabaseClient.from('dai_vt').select('*'),
          supabaseClient.from('tram_vt').select('*'),
          supabaseClient.from('tuyen_cap').select('*'),
          supabaseClient.from('v_doan_cap_full').select('*')
        ]);
        window.rawUserList = uRes.data || [];
        window.rawDaiList = dRes.data || [];
        window.rawTramList = tRes.data || [];
        window.rawTuyenList = tuRes.data || [];
        window.rawDoanCapList = doRes.data || [];
      }
    } catch (e) {
      console.warn("Lỗi tải dữ liệu trực tiếp:", e);
    }

    renderAllAdminTables();
    if (tabId) switchAdminTab(tabId);
    else switchAdminTab('tab-accounts');
  }
}

function closeModals() {
  document.querySelectorAll('.app-modal').forEach(m => m.style.display = 'none');
  
  // Hiển thị lại bảng điều khiển khi đóng modal nếu đã đăng nhập
  var user = getCurrentUser();
  var panel = document.getElementById('control-panel');
  if (panel && user && user.username && user.username !== 'guest') {
    panel.style.display = 'block';
  }
}

function switchAdminTab(tabPaneId, btnEl) {
  document.querySelectorAll('.admin-tabs .tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });

  if (btnEl) {
    btnEl.classList.add('active');
  } else {
    document.querySelectorAll('.admin-tabs .tab-btn').forEach(btn => {
      var attr = btn.getAttribute('onclick') || '';
      if (attr.indexOf(tabPaneId) !== -1) btn.classList.add('active');
    });
  }

  document.querySelectorAll('.tab-pane').forEach(pane => {
    if (pane.id === tabPaneId) {
      pane.classList.add('active');
    } else {
      pane.classList.remove('active');
    }
  });
}

function getCurrentUser() {
  var state = (typeof AppStore !== 'undefined' && AppStore.getState) ? AppStore.getState() : {};
  return state.currentUser || (typeof currentUser !== 'undefined' ? currentUser : null) || JSON.parse(localStorage.getItem('tnn_user')) || {
    username: 'guest',
    role: 'nhan_vien',
    id_dai: null,
    id_tram: null
  };
}

// Hàm lấy dữ liệu dự phòng thông minh quét qua AppStore và Biến toàn cục tránh trống bảng
function getSafeDataList(keyNames) {
  var state = (typeof AppStore !== 'undefined' && AppStore.getState) ? AppStore.getState() : {};
  for (var i = 0; i < keyNames.length; i++) {
    var k = keyNames[i];
    if (state[k] && state[k].length > 0) return state[k];
    if (window[k] && window[k].length > 0) return window[k];
  }
  
  if (keyNames.includes('rawUserList') && window.rawUserList && window.rawUserList.length > 0) return window.rawUserList;
  if (keyNames.includes('userList') && window.rawUserList && window.rawUserList.length > 0) return window.rawUserList;
  if (keyNames.includes('users') && window.rawUserList && window.rawUserList.length > 0) return window.rawUserList;
  if (keyNames.includes('taiKhoanList') && window.rawUserList && window.rawUserList.length > 0) return window.rawUserList;
  
  if (keyNames.includes('rawDaiList') && window.rawDaiList && window.rawDaiList.length > 0) return window.rawDaiList;
  if (keyNames.includes('daiList') && window.rawDaiList && window.rawDaiList.length > 0) return window.rawDaiList;
  
  if (keyNames.includes('rawTramList') && window.rawTramList && window.rawTramList.length > 0) return window.rawTramList;
  if (keyNames.includes('tramList') && window.rawTramList && window.rawTramList.length > 0) return window.rawTramList;
  
  if (keyNames.includes('rawTuyenList') && window.rawTuyenList && window.rawTuyenList.length > 0) return window.rawTuyenList;
  if (keyNames.includes('tuyenList') && window.rawTuyenList && window.rawTuyenList.length > 0) return window.rawTuyenList;
  
  if (keyNames.includes('rawDoanList') && window.rawDoanCapList && window.rawDoanCapList.length > 0) return window.rawDoanCapList;
  if (keyNames.includes('doanCapList') && window.rawDoanCapList && window.rawDoanCapList.length > 0) return window.rawDoanCapList;
  
  return [];
}

function checkAdminPermission(action, idDaiTarget, idTramTarget, silent = true) {
  var user = getCurrentUser();
  var role = user.role || user.user_role;

  if (role === 'admin_sys' || role === 'sys_admin') return true;

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

/** 3.1 BẢNG TÀI KHOẢN */
function renderMasterAccountTable() {
  var tbody = document.getElementById('masterAccountTableBody');
  if (!tbody) return;

  var users = getSafeDataList(['rawUserList', 'userList', 'users', 'taiKhoanList']);
  if (!users || users.length === 0) {
    var curr = getCurrentUser();
    if (curr && (curr.username || curr.email)) users = [curr];
  }

  var daiList = getSafeDataList(['rawDaiList', 'daiList', 'dai_vt']);
  var tramList = getSafeDataList(['rawTramList', 'tramList', 'tram_vt']);

  var listDaiMap = {};
  daiList.forEach(d => { var id = getSafeStrId(d, ['id_dai', 'id']); if (id) listDaiMap[id] = d.ten_dai || d.ten; });
  var listTramMap = {};
  tramList.forEach(t => { var id = getSafeStrId(t, ['id_tram', 'id', 'id_tram_vt']); if (id) listTramMap[id] = t.ten_tram || t.ten; });

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
        <td><span style="background:#0ea5e9; color:#fff; padding:2px 6px; border-radius:4px; font-weight:600; font-size:11px;">${roleName}</span></td>
        <td>${tenDai}</td>
        <td>${tenTram}</td>
        <td>${canEdit ? '✅ Có' : '❌ Không'}</td>
        <td style="white-space: nowrap;">
          <button class="btn-small btn-success" onclick="chuanBiFormThemThanhVien('${accountName}')">✏️ Sửa</button>
          <button class="btn-small" style="background:#ef4444; color:white; margin-left:4px;" onclick="deleteAdminRecord('tai_khoan', '${accountName}')">🗑️ Xóa</button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = html || '<tr><td colspan="6" style="text-align:center; padding:15px; color:#64748b;">Chưa có dữ liệu tài khoản</td></tr>';
}

/** 3.2 BẢNG ĐÀI VIỄN THÔNG */
function renderMasterDaiTable() {
  var tbody = document.getElementById('masterDaiTableBody');
  if (!tbody) return;

  var list = getSafeDataList(['rawDaiList', 'daiList', 'dai_vt']);
  var user = getCurrentUser();

  if (user.role === 'admin_dai' || user.role === 'dai_admin') {
    list = list.filter(d => String(getSafeStrId(d, ['id_dai', 'id'])) === String(user.id_dai || user.idDai));
  }

  var html = list.map(item => {
    var idDai = getSafeStrId(item, ['id_dai', 'id']);
    return `
      <tr>
        <td>${idDai}</td>
        <td><b>${item.ten_dai || item.ten || 'Đài VT'}</b></td>
        <td style="white-space: nowrap;">
          ${checkAdminPermission('SUA', idDai, null, true) ? `<button class="btn-small btn-success" onclick="moFormThemDai(${idDai})">✏️ Sửa</button>` : ''}
          ${checkAdminPermission('XOA', idDai, null, true) ? `<button class="btn-small" style="background:#ef4444; color:white; margin-left:4px;" onclick="deleteAdminRecord('dai_vt', ${idDai})">🗑️ Xóa</button>` : ''}
        </td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = html || '<tr><td colspan="3" style="text-align:center; padding:15px; color:#64748b;">Chưa có dữ liệu Đài</td></tr>';
}

/** 3.3 BẢNG TRẠM VIỄN THÔNG */
function renderMasterTramTable() {
  var tbody = document.getElementById('masterTramTableBody');
  if (!tbody) return;

  var list = getSafeDataList(['rawTramList', 'tramList', 'tram_vt']);
  var daiList = getSafeDataList(['rawDaiList', 'daiList', 'dai_vt']);
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
          ${checkAdminPermission('XOA', idDai, idTram, true) ? `<button class="btn-small" style="background:#ef4444; color:white; margin-left:4px;" onclick="deleteAdminRecord('tram_vt', ${idTram})">🗑️ Xóa</button>` : ''}
        </td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = html || '<tr><td colspan="4" style="text-align:center; padding:15px; color:#64748b;">Chưa có dữ liệu Trạm</td></tr>';
}

/** 3.4 BẢNG TUYẾN CÁP */
function renderMasterTuyenTable() {
  var tbody = document.getElementById('masterTuyenTableBody');
  if (!tbody) return;

  var list = getSafeDataList(['rawTuyenList', 'tuyenList', 'tuyen_cap']);

  var html = list.map(item => {
    var idTuyen = getSafeStrId(item, ['id_tuyen_cap', 'id_tuyen', 'id']);
    return `
      <tr>
        <td>${idTuyen}</td>
        <td>${item.ma_tuyencap || item.ma_tuyen || 'N/A'}</td>
        <td><b>${item.ten_tuyen || item.ten || 'Tuyến cáp'}</b></td>
        <td style="white-space: nowrap;">
          ${checkAdminPermission('SUA', null, null, true) ? `<button class="btn-small btn-success" onclick="moFormThemTuyen(${idTuyen})">✏️ Sửa</button>` : ''}
          ${checkAdminPermission('XOA', null, null, true) ? `<button class="btn-small" style="background:#ef4444; color:white; margin-left:4px;" onclick="deleteAdminRecord('tuyen_cap', ${idTuyen})">🗑️ Xóa</button>` : ''}
        </td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = html || '<tr><td colspan="4" style="text-align:center; padding:15px; color:#64748b;">Chưa có dữ liệu Tuyến cáp</td></tr>';
}

/** 3.5 BẢNG ĐOẠN CÁP */
function renderMasterDoanTable() {
  var tbody = document.getElementById('masterDoanTableBody');
  if (!tbody) return;

  var list = getSafeDataList(['rawDoanList', 'doanCapList', 'doan_cap']);

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
          ${checkAdminPermission('XOA', null, idTram, true) ? `<button class="btn-small" style="background:#ef4444; color:white; margin-left:4px;" onclick="deleteAdminRecord('doan_cap', ${idDoan})">🗑️ Xóa</button>` : ''}
        </td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = html || '<tr><td colspan="5" style="text-align:center; padding:15px; color:#64748b;">Chưa có dữ liệu Đoạn cáp</td></tr>';
}

/** 4. HÀM CHUẨN BỊ FORM TÀI KHOẢN */
function chuanBiFormThemThanhVien(usernameToEdit) {
  var daiList = getSafeDataList(['rawDaiList', 'daiList', 'dai_vt']);
  var tramList = getSafeDataList(['rawTramList', 'tramList', 'tram_vt']);

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
  var users = getSafeDataList(['rawUserList', 'userList', 'users']);

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

  document.getElementById('addMemberModal').style.display = 'flex';
}

/** 5. LƯU TÀI KHOẢN */
async function saveAccountAction() {
  if (!checkAdminPermission('SUA', null, null, false)) return;

  var accountInput = document.getElementById('newMemberAccount') || document.getElementById('loginEmail');
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
      alert("✅ Đã lưu thông tin tài khoản thành công!");
    } else {
      await idbThemVaoHangDoiSync('SAVE_USER', payload);
      alert("🔄 Đã lưu vào hàng đợi đồng bộ Offline!");
    }

    document.getElementById('addMemberModal').style.display = 'none';
    if (typeof taiDuLieuSupabase === 'function') await taiDuLieuSupabase(true);
    renderAllAdminTables();
  } catch (err) { alert("❌ Lỗi khi lưu tài khoản: " + err.message); }
}

function moFormThemDai(id) { moGenericAuxForm('dai_vt', id); }
function moFormThemTram(id) { moGenericAuxForm('tram_vt', id); }
function moFormThemTuyen(id) { moGenericAuxForm('tuyen_cap', id); }
function moFormThemDoan(id) { moGenericAuxForm('doan_cap', id); }

/** 6. CHUẨN BỊ FORM DANH MỤC */
function moGenericAuxForm(tableType, recordId) {
  var daiList = getSafeDataList(['rawDaiList', 'daiList', 'dai_vt']);
  var tramList = getSafeDataList(['rawTramList', 'tramList', 'tram_vt']);
  var tuyenList = getSafeDataList(['rawTuyenList', 'tuyenList', 'tuyen_cap']);

  document.getElementById('auxTableType').value = tableType;
  document.getElementById('auxRecordId').value = recordId || '';

  var fieldsContainer = document.getElementById('auxFormFields');
  var html = '';

  if (tableType === 'dai_vt') {
    var rec = daiList.find(d => String(getSafeStrId(d, ['id_dai', 'id'])) === String(recordId)) || {};
    document.getElementById('auxModalTitle').innerText = recordId ? "✏️ Sửa Đài VT" : "➕ Thêm Đài VT";
    html = `<div class="form-group"><label>Tên Đài VT:</label><input type="text" id="auxTen" value="${rec.ten_dai || rec.ten || ''}"></div>`;
  } 
  else if (tableType === 'tram_vt') {
    var rec = tramList.find(t => String(getSafeStrId(t, ['id_tram', 'id'])) === String(recordId)) || {};
    document.getElementById('auxModalTitle').innerText = recordId ? "✏️ Sửa Trạm VT" : "➕ Thêm Trạm VT";
    html = `
      <div class="form-group"><label>Tên Trạm VT:</label><input type="text" id="auxTen" value="${rec.ten_tram || rec.ten || ''}"></div>
      <div class="form-group"><label>Đài Quản Lý:</label><select id="auxDaiId">
        ${daiList.map(d => { var dId = getSafeStrId(d, ['id_dai', 'id']); return `<option value="${dId}" ${String(dId) === String(rec.id_dai \vert{}\vert{} rec.dai_id) ? 'selected' : ''}>${d.ten_dai || d.ten}</option>`; }).join('')}
      </select></div>
    `;
  }
  else if (tableType === 'tuyen_cap') {
    var rec = tuyenList.find(t => String(getSafeStrId(t, ['id_tuyen_cap', 'id_tuyen', 'id'])) === String(recordId)) || {};
    document.getElementById('auxModalTitle').innerText = recordId ? "✏️ Sửa Tuyến Cáp" : "➕ Thêm Tuyến Cáp";
    html = `
      <div class="form-group"><label>Mã Tuyến:</label><input type="text" id="auxMa" value="${rec.ma_tuyencap || rec.ma_tuyen || ''}"></div>
      <div class="form-group"><label>Tên Tuyến Cáp:</label><input type="text" id="auxTen" value="${rec.ten_tuyen || rec.ten || ''}"></div>
    `;
  }
  else if (tableType === 'doan_cap') {
    var doanList = getSafeDataList(['rawDoanList', 'doanCapList', 'doan_cap']);
    var rec = doanList.find(d => String(getSafeStrId(d, ['id_doan_cap', 'id_doan', 'id'])) === String(recordId)) || {};
    document.getElementById('auxModalTitle').innerText = recordId ? "✏️ Sửa Đoạn Cáp" : "➕ Thêm Đoạn Cáp";
    html = `
      <div class="form-group"><label>Mã Đoạn:</label><input type="text" id="auxMa" value="${rec.ma_doancap || rec.ma_doan || ''}"></div>
      <div class="form-group"><label>Thuộc Tuyến Cáp:</label><select id="auxTuyenId">
        ${tuyenList.map(t => { var tId = getSafeStrId(t, ['id_tuyen_cap', 'id_tuyen', 'id']); return `<option value="${tId}" ${String(tId) === String(rec.id_tuyen \vert{}\vert{} rec.tuyen_cap_id) ? 'selected' : ''}>${t.ten_tuyen || t.ten}</option>`; }).join('')}
      </select></div>
      <div class="form-group"><label>Trạm Quản Lý:</label><select id="auxTramId">
        ${tramList.map(t => { var trId = getSafeStrId(t, ['id_tram', 'id']); return `<option value="${trId}" ${String(trId) === String(rec.id_tram) ? 'selected' : ''}>${t.ten_tram || t.ten}</option>`; }).join('')}
      </select></div>
    `;
  }

  fieldsContainer.innerHTML = html;
  document.getElementById('genericAuxModal').style.display = 'flex';
}

/** 7. LƯU DANH MỤC */
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
      alert("✅ Lưu danh mục thành công!");
    } else {
      await idbThemVaoHangDoiSync('SAVE_AUX', { table: tableType, data: payload });
      alert("🔄 Đã lưu vào hàng đợi Offline!");
    }

    document.getElementById('genericAuxModal').style.display = 'none';
    if (typeof taiDuLieuSupabase === 'function') await taiDuLieuSupabase(true);
    renderAllAdminTables();
  } catch (err) { alert("❌ Lỗi khi lưu: " + err.message); }
}

/** 8. XÓA BẢN GHI */
async function deleteAdminRecord(tableName, idItem) {
  if (!checkAdminPermission('XOA', null, null, false)) return;

  var tramList = getSafeDataList(['rawTramList', 'tramList', 'tram_vt']);
  var doanList = getSafeDataList(['rawDoanList', 'doanCapList', 'doan_cap']);

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
      alert("✅ Đã xóa bản ghi thành công!");
    } else {
      await idbThemVaoHangDoiSync('DELETE_RECORD', { table: tableName, id: idItem });
      alert("🔄 Đã lưu lệnh xóa vào hàng đợi Offline!");
    }

    if (typeof taiDuLieuSupabase === 'function') await taiDuLieuSupabase(true);
    renderAllAdminTables();
  } catch (err) { alert("❌ Lỗi khi xóa: " + err.message); }
}

/** 9. QUẢN LÝ ĐIỂM HẠ TẦNG TRỰC TIẾP TRÊN BẢN ĐỒ */
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

  document.getElementById('crudTitle').innerText = actionType === 'ADD' ? '➕ Thêm Điểm Hạ Tầng' : '✏️ Cập Nhật Điểm Hạ Tầng';
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
      alert("✅ Đã lưu điểm hạ tầng GIS thành công!");
    } else {
      await idbThemVaoHangDoiSync('SAVE_GIS_POINT', payload);
      alert("🔄 Đã lưu điểm hạ tầng vào hàng đợi Offline!");
    }

    document.getElementById('crudModal').style.display = 'none';
    if (typeof taiDuLieuSupabase === 'function') await taiDuLieuSupabase(true);
    if (typeof veLaiTuyenAB === 'function') veLaiTuyenAB();
  } catch (err) { alert("❌ Lỗi khi lưu điểm hạ tầng: " + err.message); }
}

/** 10. TÍNH NĂNG ĐỔI MẬT KHẨU HOẠT ĐỘNG CHÍNH XÁC */
function openChangePasswordModal() {
  var modal = document.getElementById('changePasswordModal');
  if (modal) {
    document.getElementById('txtCurrentPass').value = '';
    document.getElementById('txtNewPass').value = '';
    document.getElementById('txtConfirmPass').value = '';
    modal.style.display = 'flex';
  }
}

async function executeChangePassword() {
  var currentPass = document.getElementById('txtCurrentPass').value.trim();
  var newPass = document.getElementById('txtNewPass').value.trim();
  var confirmPass = document.getElementById('txtConfirmPass').value.trim();

  if (!currentPass || !newPass || !confirmPass) {
    alert("⚠️ Vui lòng nhập đầy đủ thông tin mật khẩu!");
    return;
  }
  if (newPass !== confirmPass) {
    alert("❌ Mật khẩu mới và xác nhận mật khẩu không khớp!");
    return;
  }

  var user = getCurrentUser();
  var username = user.username || user.email || user.user_name;
  if (!username) {
    alert("⚠️ Không tìm thấy thông tin tài khoản hiện tại!");
    return;
  }

  try {
    if (navigator.onLine && typeof supabaseClient !== 'undefined') {
      var res = await supabaseClient
        .from('tai_khoan')
        .update({ password: newPass })
        .eq('email', username);

      if (res.error) {
        var res2 = await supabaseClient
          .from('tai_khoan')
          .update({ password: newPass })
          .eq('username', username);
        if (res2.error) throw res2.error;
      }

      alert("✅ Đổi mật khẩu thành công!");
      document.getElementById('changePasswordModal').style.display = 'none';
    } else {
      alert("⚠️ Chức năng đổi mật khẩu yêu cầu kết nối mạng trực tuyến!");
    }
  } catch (err) {
    alert("❌ Lỗi khi đổi mật khẩu: " + err.message);
  }
}

/** 11. HỘP THOẠI XÁC NHẬN */
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
