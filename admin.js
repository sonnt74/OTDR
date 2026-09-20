// ==========================================================================
// TỆP ADMIN.JS - QUẢN TRỊ 5 TAB, PHÂN CẤP PHÂN QUYỀN & LUỒNG LIÊN KẾT DỮ LIỆU
// ==========================================================================

async function openModal(modalId, tabId) {
  closeModals();
  var targetModal = document.getElementById(modalId);
  if (targetModal) targetModal.style.display = 'flex';

  var panel = document.getElementById('control-panel');
  if (panel) panel.style.display = 'none';

  if (modalId === 'adminMasterModal') {
    try {
      if (navigator.onLine && typeof supabaseClient !== 'undefined') {
        var [uRes, dRes, tRes, tuRes, doRes] = await Promise.all([
          supabaseClient.from('v_tai_khoan_full').select('*'),
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

        if (typeof AppStore !== 'undefined' && AppStore.setState) {
          AppStore.setState({
            rawUserList: window.rawUserList,
            rawDaiList: window.rawDaiList,
            rawTramList: window.rawTramList,
            rawTuyenList: window.rawTuyenList,
            rawDoanList: window.rawDoanCapList
          });
        }
      }
    } catch (e) {
      console.warn("Dùng dữ liệu lưu trữ tạm:", e);
    }

    renderAllAdminTables();

    if (tabId) {
      var btn = document.querySelector(`.admin-tabs .tab-btn[onclick*="${tabId}"]`);
      switchAdminTab(tabId, btn);
    } else {
      var firstBtn = document.querySelector('.admin-tabs .tab-btn');
      switchAdminTab('tab-accounts', firstBtn);
    }
  }
}

function closeModals() {
  document.querySelectorAll('.app-modal').forEach(m => m.style.display = 'none');
  
  var user = getCurrentUser();
  var panel = document.getElementById('control-panel');
  if (panel && user && user.account && user.account !== 'guest') {
    panel.style.display = 'block';
  }
}

function switchAdminTab(tabPaneId, btnEl) {
  document.querySelectorAll('.admin-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));

  if (btnEl) {
    btnEl.classList.add('active');
  } else {
    var targetBtn = document.querySelector(`.admin-tabs .tab-btn[onclick*="${tabPaneId}"]`);
    if (targetBtn) targetBtn.classList.add('active');
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
    account: 'guest', role: 'nhan_vien', id_dai: null, id_tram: null
  };
}

function getSafeDataList(keyNames) {
  var state = (typeof AppStore !== 'undefined' && AppStore.getState) ? AppStore.getState() : {};
  for (var i = 0; i < keyNames.length; i++) {
    var k = keyNames[i];
    if (state[k] && Array.isArray(state[k]) && state[k].length > 0) return state[k];
    if (window[k] && Array.isArray(window[k]) && window[k].length > 0) return window[k];
  }
  if (keyNames.includes('rawUserList') && window.rawUserList) return window.rawUserList;
  if (keyNames.includes('rawDaiList') && window.rawDaiList) return window.rawDaiList;
  if (keyNames.includes('rawTramList') && window.rawTramList) return window.rawTramList;
  if (keyNames.includes('rawTuyenList') && window.rawTuyenList) return window.rawTuyenList;
  if (keyNames.includes('rawDoanList') || keyNames.includes('rawDoanCapList') || keyNames.includes('doanCapList')) {
    return window.rawDoanCapList || window.rawDoanList || state.rawDoanList || state.doanCapList || [];
  }
  return [];
}

// ==========================================================================
// HỆ THỐNG LỌC PHÂN CẤP THEO VAI TRÒ ĐĂNG NHẬP (LUỒNG DỮ LIỆU ĐỒNG BỘ)
// ==========================================================================
function getFilteredUsers() {
  var users = getSafeDataList(['rawUserList', 'userList', 'users', 'taiKhoanList']);
  var user = getCurrentUser();
  var role = (user.role || '').toLowerCase();
  var idDai = user.id_dai || user.idDai;
  var idTram = user.id_tram || user.idTram;

  if (role.includes('sys') || role === 'admin_sys') {
    return users;
  } else if (role.includes('dai') || role === 'admin_dai') {
    return users.filter(u => String(u.id_dai) === String(idDai));
  } else if (role.includes('tram') || role === 'admin_tram') {
    return users.filter(u => String(u.id_tram) === String(idTram));
  }
  return users.filter(u => u.account === user.account);
}

function getFilteredDaiList() {
  var daiList = getSafeDataList(['rawDaiList', 'daiList', 'dai_vt']);
  var user = getCurrentUser();
  var role = (user.role || '').toLowerCase();
  var idDai = user.id_dai || user.idDai;

  if (role.includes('sys') || role === 'admin_sys') return daiList;
  else if (role.includes('dai') || role === 'admin_dai') {
    return daiList.filter(d => String(d.id_dai || d.id) === String(idDai));
  }
  return daiList;
}

function getFilteredTramList() {
  var tramList = getSafeDataList(['rawTramList', 'tramList', 'tram_vt']);
  var user = getCurrentUser();
  var role = (user.role || '').toLowerCase();
  var idDai = user.id_dai || user.idDai;
  var idTram = user.id_tram || user.idTram;

  if (role.includes('sys') || role === 'admin_sys') return tramList;
  else if (role.includes('dai') || role === 'admin_dai') {
    return tramList.filter(t => String(t.id_dai || t.dai_id) === String(idDai));
  } else if (role.includes('tram') || role === 'admin_tram') {
    return tramList.filter(t => String(t.id_tram || t.id) === String(idTram));
  }
  return tramList;
}

function getFilteredTuyenList() {
  var tuyenList = getSafeDataList(['rawTuyenList', 'tuyenList', 'tuyen_cap']);
  var user = getCurrentUser();
  var role = (user.role || '').toLowerCase();
  var idTram = user.id_tram || user.idTram;

  if (role.includes('sys') || role === 'admin_sys') {
    return tuyenList;
  } else if (role.includes('dai') || role === 'admin_dai') {
    var validTramIds = getFilteredTramList().map(t => String(t.id_tram || t.id));
    var doanList = getSafeDataList(['rawDoanList', 'doanCapList', 'doan_cap', 'rawDoanCapList']);
    var validTuyenIds = doanList.filter(d => validTramIds.includes(String(d.id_tram || d.tram_id)))
                                .map(d => String(d.id_tuyen || d.tuyen_id));
    return tuyenList.filter(tu => validTuyenIds.includes(String(tu.id_tuyen_cap || tu.id || tu.tuyen_id)));
  } else if (role.includes('tram') || role === 'admin_tram') {
    var doanList = getSafeDataList(['rawDoanList', 'doanCapList', 'doan_cap', 'rawDoanCapList']);
    var validTuyenIds = doanList.filter(d => String(d.id_tram || d.tram_id) === String(idTram))
                                .map(d => String(d.id_tuyen || d.tuyen_id));
    return tuyenList.filter(tu => validTuyenIds.includes(String(tu.id_tuyen_cap || tu.id || tu.tuyen_id)));
  }
  return tuyenList;
}

function getFilteredDoanList() {
  var doanList = getSafeDataList(['rawDoanList', 'doanCapList', 'doan_cap', 'rawDoanCapList']);
  var user = getCurrentUser();
  var role = (user.role || '').toLowerCase();
  var idTram = user.id_tram || user.idTram;

  if (role.includes('sys') || role === 'admin_sys') return doanList;
  else if (role.includes('dai') || role === 'admin_dai') {
    var validTramIds = getFilteredTramList().map(t => String(t.id_tram || t.id));
    return doanList.filter(d => validTramIds.includes(String(d.id_tram || d.tram_id)));
  } else if (role.includes('tram') || role === 'admin_tram') {
    return doanList.filter(d => String(d.id_tram || d.tram_id) === String(idTram));
  }
  return doanList;
}

function getDaiName(idDai) {
  if (idDai === null || idDai === undefined || idDai === '') return 'Tất cả';
  var list = getSafeDataList(['rawDaiList', 'daiList', 'dai_vt']);
  var found = list.find(d => String(d.id_dai || d.id || d.dai_id) === String(idDai));
  return found ? (found.ten_dai || found.ten || found.name) : `Đài ID: ${idDai}`;
}

function getTramName(idTram) {
  if (idTram === null || idTram === undefined || idTram === '') return 'Tất cả';
  var list = getSafeDataList(['rawTramList', 'tramList', 'tram_vt']);
  var found = list.find(t => String(t.id_tram || t.id || t.tram_id) === String(idTram));
  return found ? (found.ten_tram || found.ten || found.name) : `Trạm ID: ${idTram}`;
}

function getTuyenName(idTuyen) {
  if (idTuyen === null || idTuyen === undefined || idTuyen === '') return 'Tất cả';
  var list = getSafeDataList(['rawTuyenList', 'tuyenList', 'tuyen_cap']);
  var found = list.find(t => String(t.id_tuyen_cap || t.id_tuyen || t.id || t.tuyen_id) === String(idTuyen));
  return found ? (found.ten_tuyen || found.ten || found.ma_tuyencap || found.ma_tuyen) : `Tuyến ID: ${idTuyen}`;
}

function renderAllAdminTables() {
  renderMasterAccountTable();
  renderMasterDaiTable();
  renderMasterTramTable();
  renderMasterTuyenTable();
  renderMasterDoanTable();
}

/** 1. BẢNG TÀI KHOẢN */
function renderMasterAccountTable() {
  var tbody = document.getElementById('masterAccountTableBody');
  if (!tbody) return;
  var users = getFilteredUsers();
  var html = users.map(u => {
    var accName = u.account || 'Tài khoản';
    var tenDai = u.ten_dai || getDaiName(u.id_dai);
    var tenTram = u.ten_tram || getTramName(u.id_tram);

    return `
      <tr>
        <td><b>${accName}</b></td>
        <td><span style="background:#0ea5e9; color:#fff; padding:2px 6px; border-radius:4px; font-size:11px;">${u.role || 'nhan_vien'}</span></td>
        <td>🏢 ${tenDai}</td>
        <td>📡 ${tenTram}</td>
        <td>${u.can_edit_map ? '✅ Có' : '❌ Không'}</td>
        <td>
          <button class="btn-small btn-success" onclick="chuanBiFormThemThanhVien('${accName}')">✏️ Sửa</button>
          <button class="btn-small" style="background:#ef4444; color:white;" onclick="deleteAdminRecord('tai_khoan', '${accName}')">🗑️ Xóa</button>
        </td>
      </tr>
    `;
  }).join('');
  tbody.innerHTML = html || '<tr><td colspan="6" style="text-align:center; padding:15px; color:#64748b;">Không có dữ liệu tài khoản</td></tr>';
}

/** 2. BẢNG ĐÀI VIỄN THÔNG */
function renderMasterDaiTable() {
  var tbody = document.getElementById('masterDaiTableBody');
  if (!tbody) return;
  var list = getFilteredDaiList();
  tbody.innerHTML = list.map(item => `
    <tr>
      <td>${item.id_dai || item.id}</td>
      <td><b>${item.ten_dai || item.ten}</b></td>
      <td>
        <button class="btn-small btn-success" onclick="moFormThemDai(${item.id_dai || item.id})">✏️ Sửa</button>
        <button class="btn-small" style="background:#ef4444; color:white;" onclick="deleteAdminRecord('dai_vt', '${item.id_dai || item.id}')">🗑️ Xóa</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="3" style="text-align:center; padding:15px; color:#64748b;">Không có dữ liệu Đài</td></tr>';
}

/** 3. BẢNG TRẠM VIỄN THÔNG */
function renderMasterTramTable() {
  var tbody = document.getElementById('masterTramTableBody');
  if (!tbody) return;
  var list = getFilteredTramList();
  tbody.innerHTML = list.map(item => {
    var tenDai = item.ten_dai || getDaiName(item.id_dai || item.dai_id);
    return `
      <tr>
        <td>${item.id_tram || item.id}</td>
        <td><b>${item.ten_tram || item.ten}</b></td>
        <td>🏢 ${tenDai}</td>
        <td>
          <button class="btn-small btn-success" onclick="moFormThemTram(${item.id_tram || item.id})">✏️ Sửa</button>
          <button class="btn-small" style="background:#ef4444; color:white;" onclick="deleteAdminRecord('tram_vt', '${item.id_tram || item.id}')">🗑️ Xóa</button>
        </td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="4" style="text-align:center; padding:15px; color:#64748b;">Không có dữ liệu Trạm</td></tr>';
}

/** 4. BẢNG TUYẾN CÁP (HIỂN THỊ TÊN TUYẾN CHÍNH XÁC) */
/** 4. BẢNG TUYẾN CÁP (ĐÃ MỞ RỘNG CÁC BIẾN TÊN TUYẾN ĐỂ HIỂN THỊ CHÍNH XÁC) */
function renderMasterTuyenTable() {
  var tbody = document.getElementById('masterTuyenTableBody');
  if (!tbody) return;
  var list = getFilteredTuyenList();
  
  tbody.innerHTML = list.map(item => {
    // Kiểm tra tất cả các tên biến có thể có trong cơ sở dữ liệu cho tên tuyến và mã tuyến
    var maTuyen = item.ma_tuyencap || item.ma_tuyen || item.macap || '';
    var tenTuyen = item.ten_tuyen || item.ten_tuyencap || item.ten || item.name || 'Chưa cập nhật tên';
    var idTuyen = item.id_tuyen_cap || item.id_tuyen || item.id;

    return `
      <tr>
        <td>${idTuyen}</td>
        <td>${maTuyen}</td>
        <td><b>${tenTuyen}</b></td>
        <td>
          <button class="btn-small btn-success" onclick="moFormThemTuyen(${idTuyen})">✏️ Sửa</button>
          <button class="btn-small" style="background:#ef4444; color:white;" onclick="deleteAdminRecord('tuyen_cap', '${idTuyen}')">🗑️ Xóa</button>
        </td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="4" style="text-align:center; padding:15px; color:#64748b;">Không có dữ liệu Tuyến cáp</td></tr>';
}

/** 5. BẢNG ĐOẠN TUYẾN CÁP */
function renderMasterDoanTable() {
  var tbody = document.getElementById('masterDoanTableBody');
  if (!tbody) return;
  var list = getFilteredDoanList();
  tbody.innerHTML = list.map(item => {
    var tenTuyen = item.ten_tuyen || getTuyenName(item.id_tuyen || item.tuyen_id);
    var tenTram = item.ten_tram || getTramName(item.id_tram || item.tram_id);
    return `
      <tr>
        <td>${item.id_doan_cap || item.id}</td>
        <td><b>${item.ma_doancap || item.ma_doan || ''}</b></td>
        <td>🛤️ ${tenTuyen}</td>
        <td>📡 ${tenTram}</td>
        <td>
          <button class="btn-small btn-success" onclick="moFormThemDoan(${item.id_doan_cap || item.id})">✏️ Sửa</button>
          <button class="btn-small" style="background:#ef4444; color:white;" onclick="deleteAdminRecord('doan_cap', '${item.id_doan_cap || item.id}')">🗑️ Xóa</button>
        </td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="5" style="text-align:center; padding:15px; color:#64748b;">Không có dữ liệu Đoạn cáp</td></tr>';
}

// ==========================================================================
// FORM THÊM / SỬA / XÓA (ĐẢM BẢO TẢI ĐẦY ĐỦ LIÊN KẾT GỐC)
// ==========================================================================

function chuanBiFormThemThanhVien(accToEdit) {
  var accountInput = document.getElementById('newMemberAccount');
  var passInput = document.getElementById('newMemberPass');
  var roleSelect = document.getElementById('newMemberRole');
  var canEditCheck = document.getElementById('newMemberCanEdit');
  var daiSelect = document.getElementById('newMemberDai');
  var tramSelect = document.getElementById('newMemberTram');

  var daiList = getSafeDataList(['rawDaiList', 'daiList', 'dai_vt']);
  if (daiSelect) {
    daiSelect.innerHTML = '<option value="">-- Chọn Đài --</option>';
    daiList.forEach(d => {
      daiSelect.innerHTML += `<option value="${d.id_dai || d.id}">${d.ten_dai || d.ten}</option>`;
    });
  }

  var tramList = getSafeDataList(['rawTramList', 'tramList', 'tram_vt']);
  if (tramSelect) {
    tramSelect.innerHTML = '<option value="">-- Chọn Trạm --</option>';
    tramList.forEach(t => {
      tramSelect.innerHTML += `<option value="${t.id_tram || t.id}">${t.ten_tram || t.ten}</option>`;
    });
  }

  if (accToEdit && accountInput) {
    accountInput.value = accToEdit;
    accountInput.disabled = true;
    if (passInput) passInput.value = '';

    var users = getSafeDataList(['rawUserList', 'userList', 'users', 'taiKhoanList']);
    var uObj = users.find(u => u.account === accToEdit);
    if (uObj) {
      if (roleSelect) roleSelect.value = uObj.role || 'nhan_vien';
      if (canEditCheck) canEditCheck.checked = !!uObj.can_edit_map;
      if (daiSelect) daiSelect.value = uObj.id_dai || '';
      if (tramSelect) tramSelect.value = uObj.id_tram || '';
    }
  } else {
    if (accountInput) {
      accountInput.value = '';
      accountInput.disabled = false;
    }
    if (passInput) passInput.value = '';
    if (roleSelect) roleSelect.value = 'nhan_vien';
    if (canEditCheck) canEditCheck.checked = false;
    if (daiSelect) daiSelect.value = '';
    if (tramSelect) tramSelect.value = '';
  }

  var modal = document.getElementById('addMemberModal');
  if (modal) modal.style.display = 'flex';
}

async function saveAccountAction() {
  var accountInput = document.getElementById('newMemberAccount');
  var accVal = accountInput ? accountInput.value.trim() : '';
  var password = document.getElementById('newMemberPass').value.trim();
  var role = document.getElementById('newMemberRole').value;
  var canEdit = document.getElementById('newMemberCanEdit').checked;
  var idDai = document.getElementById('newMemberDai').value || null;
  var idTram = document.getElementById('newMemberTram').value || null;

  if (!accVal) { 
    showToast("⚠️ Vui lòng nhập tên tài khoản!", "error"); 
    return; 
  }

  var payload = {
    account: accVal,
    role: role,
    can_edit_map: canEdit,
    id_dai: idDai ? Number(idDai) : null,
    id_tram: idTram ? Number(idTram) : null
  };
  if (password) payload.password = password;

  try {
    if (navigator.onLine && typeof supabaseClient !== 'undefined') {
      var { error } = await supabaseClient.from('tai_khoan').upsert([payload]);
      if (error) throw error;
      showToast("✅ Đã lưu thông tin tài khoản thành công!", "success");
    } else {
      showToast("⚠️ Cần kết nối mạng trực tuyến để lưu tài khoản!", "error");
    }

    document.getElementById('addMemberModal').style.display = 'none';
    if (typeof taiDuLieuSupabase === 'function') await taiDuLieuSupabase(true);
    renderAllAdminTables();
  } catch (err) { 
    showToast("❌ Lỗi khi lưu tài khoản: " + err.message, "error"); 
  }
}

// ==========================================================================
// QUẢN LÝ FORM PHỤ (ĐÀI, TRẠM, TUYẾN, ĐOẠN CÁP)
// ==========================================================================

function moFormThemDai(id) {
  document.getElementById('auxTableType').value = 'dai_vt';
  document.getElementById('auxRecordId').value = id || '';
  document.getElementById('auxModalTitle').innerText = id ? '✏️ Sửa Đài Viễn Thông' : '➕ Thêm Đài Viễn Thông';
  
  var list = getSafeDataList(['rawDaiList', 'daiList', 'dai_vt']);
  var item = id ? list.find(d => String(d.id_dai || d.id) === String(id)) : {};
  
  var html = `
    <div class="form-group"><label>Tên Đài:</label><input type="text" id="auxTenDai" value="${item.ten_dai || item.ten || ''}" placeholder="Nhập tên đài"></div>
  `;
  document.getElementById('auxFormFields').innerHTML = html;
  document.getElementById('genericAuxModal').style.display = 'flex';
}

function moFormThemTram(id) {
  document.getElementById('auxTableType').value = 'tram_vt';
  document.getElementById('auxRecordId').value = id || '';
  document.getElementById('auxModalTitle').innerText = id ? '✏️ Sửa Trạm Viễn Thông' : '➕ Thêm Trạm Viễn Thông';
  
  var list = getSafeDataList(['rawTramList', 'tramList', 'tram_vt']);
  var item = id ? list.find(t => String(t.id_tram || t.id) === String(id)) : {};
  
  var daiList = getSafeDataList(['rawDaiList', 'daiList', 'dai_vt']);
  var daiOptions = daiList.map(d => `<option value="${d.id_dai || d.id}" ${String(d.id_dai || d.id) === String(item.id_dai || item.dai_id) ? 'selected' : ''}>${d.ten_dai || d.ten}</option>`).join('');

  var html = `
    <div class="form-group"><label>Tên Trạm:</label><input type="text" id="auxTenTram" value="${item.ten_tram || item.ten || ''}" placeholder="Nhập tên trạm"></div>
    <div class="form-group"><label>Thuộc Đài:</label><select id="auxIdDai"><option value="">-- Chọn Đài --</option>${daiOptions}</select></div>
  `;
  document.getElementById('auxFormFields').innerHTML = html;
  document.getElementById('genericAuxModal').style.display = 'flex';
}

function moFormThemTuyen(id) {
  document.getElementById('auxTableType').value = 'tuyen_cap';
  document.getElementById('auxRecordId').value = id || '';
  document.getElementById('auxModalTitle').innerText = id ? '✏️ Sửa Tuyến Cáp' : '➕ Thêm Tuyến Cáp';
  
  var list = getSafeDataList(['rawTuyenList', 'tuyenList', 'tuyen_cap']);
  var item = id ? list.find(t => String(t.id_tuyen_cap || t.id) === String(id)) : {};
  
  var html = `
    <div class="form-group"><label>Mã tuyến cáp:</label><input type="text" id="auxMaTuyen" value="${item.ma_tuyencap || item.ma_tuyen || ''}" placeholder="VD: T01"></div>
    <div class="form-group"><label>Tên tuyến cáp:</label><input type="text" id="auxTenTuyen" value="${item.ten_tuyen || item.ten || ''}" placeholder="Nhập tên tuyến"></div>
  `;
  document.getElementById('auxFormFields').innerHTML = html;
  document.getElementById('genericAuxModal').style.display = 'flex';
}

function moFormThemDoan(id) {
  document.getElementById('auxTableType').value = 'doan_cap';
  document.getElementById('auxRecordId').value = id || '';
  document.getElementById('auxModalTitle').innerText = id ? '✏️ Sửa Đoạn Cáp' : '➕ Thêm Đoạn Cáp';
  
  var list = getSafeDataList(['rawDoanList', 'doanCapList', 'doan_cap', 'rawDoanCapList']);
  var item = id ? list.find(d => String(d.id_doan_cap || d.id) === String(id)) : {};
  
  var tuyenList = getSafeDataList(['rawTuyenList', 'tuyenList', 'tuyen_cap']);
  var tuyenOptions = tuyenList.map(tu => `<option value="${tu.id_tuyen_cap || tu.id}" ${String(tu.id_tuyen_cap || tu.id) === String(item.id_tuyen || item.tuyen_id) ? 'selected' : ''}>${tu.ten_tuyen || tu.ten || tu.ma_tuyencap}</option>`).join('');

  var tramList = getSafeDataList(['rawTramList', 'tramList', 'tram_vt']);
  var tramOptions = tramList.map(tr => `<option value="${tr.id_tram || tr.id}" ${String(tr.id_tram || tr.id) === String(item.id_tram || item.tram_id) ? 'selected' : ''}>${tr.ten_tram || tr.ten}</option>`).join('');

  var html = `
    <div class="form-group"><label>Mã đoạn cáp:</label><input type="text" id="auxMaDoan" value="${item.ma_doancap || item.ma_doan || ''}" placeholder="VD: D01"></div>
    <div class="form-group"><label>Thuộc Tuyến:</label><select id="auxIdTuyen"><option value="">-- Chọn Tuyến --</option>${tuyenOptions}</select></div>
    <div class="form-group"><label>Thuộc Trạm:</label><select id="auxIdTram"><option value="">-- Chọn Trạm --</option>${tramOptions}</select></div>
  `;
  document.getElementById('auxFormFields').innerHTML = html;
  document.getElementById('genericAuxModal').style.display = 'flex';
}

async function saveAuxRecord() {
  var tableType = document.getElementById('auxTableType').value;
  var recordId = document.getElementById('auxRecordId').value;
  var payload = {};
  var pkCol = '';

  if (tableType === 'dai_vt') {
    pkCol = 'id_dai';
    payload.ten_dai = document.getElementById('auxTenDai').value.trim();
    if (!payload.ten_dai) { showToast("⚠️ Vui lòng nhập tên Đài!", "error"); return; }
  } else if (tableType === 'tram_vt') {
    pkCol = 'id_tram';
    payload.ten_tram = document.getElementById('auxTenTram').value.trim();
    payload.id_dai = document.getElementById('auxIdDai').value ? Number(document.getElementById('auxIdDai').value) : null;
    if (!payload.ten_tram) { showToast("⚠️ Vui lòng nhập tên Trạm!", "error"); return; }
  } else if (tableType === 'tuyen_cap') {
    pkCol = 'id_tuyen_cap';
    payload.ma_tuyencap = document.getElementById('auxMaTuyen').value.trim();
    payload.ten_tuyen = document.getElementById('auxTenTuyen').value.trim();
    if (!payload.ten_tuyen) { showToast("⚠️ Vui lòng nhập tên Tuyến cáp!", "error"); return; }
  } else if (tableType === 'doan_cap') {
    pkCol = 'id_doan_cap';
    payload.ma_doancap = document.getElementById('auxMaDoan').value.trim();
    payload.id_tuyen = document.getElementById('auxIdTuyen').value ? Number(document.getElementById('auxIdTuyen').value) : null;
    payload.id_tram = document.getElementById('auxIdTram').value ? Number(document.getElementById('auxIdTram').value) : null;
    if (!payload.ma_doancap) { showToast("⚠️ Vui lòng nhập mã đoạn cáp!", "error"); return; }
  }

  if (recordId && recordId !== '') {
    payload[pkCol] = Number(recordId);
  }

  try {
    if (navigator.onLine && typeof supabaseClient !== 'undefined') {
      var { error } = await supabaseClient.from(tableType).upsert([payload]);
      if (error) throw error;
      showToast("✅ Lưu dữ liệu danh mục thành công!", "success");
    } else {
      showToast("⚠️ Cần kết nối mạng để lưu dữ liệu!", "error");
    }

    document.getElementById('genericAuxModal').style.display = 'none';
    if (typeof taiDuLieuSupabase === 'function') await taiDuLieuSupabase(true);
    renderAllAdminTables();
  } catch (err) {
    showToast("❌ Lỗi khi lưu dữ liệu: " + err.message, "error");
  }
}

async function deleteAdminRecord(tableName, idItem) {
  if (!confirm(`Bạn có chắc chắn muốn xóa bản ghi này?`)) return;

  var pkCol = '';
  if (tableName === 'tai_khoan') pkCol = 'account';
  else if (tableName === 'dai_vt') pkCol = 'id_dai';
  else if (tableName === 'tram_vt') pkCol = 'id_tram';
  else if (tableName === 'tuyen_cap') pkCol = 'id_tuyen_cap';
  else if (tableName === 'doan_cap') pkCol = 'id_doan_cap';

  try {
    if (navigator.onLine && typeof supabaseClient !== 'undefined') {
      var query = supabaseClient.from(tableName).delete();
      if (tableName === 'tai_khoan') {
        query = query.eq(pkCol, idItem);
      } else {
        query = query.eq(pkCol, Number(idItem));
      }
      var { error } = await query;
      if (error) throw error;
      showToast("🗑️ Đã xóa bản ghi thành công!", "success");
    } else {
      showToast("⚠️ Cần kết nối mạng để xóa dữ liệu!", "error");
    }

    if (typeof taiDuLieuSupabase === 'function') await taiDuLieuSupabase(true);
    renderAllAdminTables();
  } catch (err) {
    showToast("❌ Lỗi khi xóa bản ghi: " + err.message, "error");
  }
}

/** ĐỔI MẬT KHẨU */
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
    showToast("⚠️ Vui lòng nhập đầy đủ thông tin mật khẩu!", "error");
    return;
  }
  if (newPass !== confirmPass) {
    showToast("❌ Mật khẩu mới và xác nhận mật khẩu không khớp!", "error");
    return;
  }

  var user = getCurrentUser();
  var accName = user.account;
  if (!accName) { 
    showToast("⚠️ Không tìm thấy thông tin tài khoản!", "error"); 
    return; 
  }

  try {
    if (navigator.onLine && typeof supabaseClient !== 'undefined') {
      var res = await supabaseClient.from('tai_khoan').update({ password: newPass }).eq('account', accName);
      if (res.error) throw res.error;

      showToast("✅ Đổi mật khẩu thành công!", "success");
      document.getElementById('changePasswordModal').style.display = 'none';
    } else {
      showToast("⚠️ Yêu cầu kết nối mạng để đổi mật khẩu!", "error");
    }
  } catch (err) {
    showToast("❌ Lỗi đổi mật khẩu: " + err.message, "error");
  }
}
