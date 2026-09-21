// ==========================================================================
// TỆP ADMIN.JS - QUẢN TRỊ 5 TAB, PHÂN QUYỀN CHẶT CHẼ & TỐI ƯU HÓA CRUD
// ==========================================================================

function openModal(modalId, tabId) {
  closeModals();
  var targetModal = document.getElementById(modalId);
  if (targetModal) targetModal.style.display = 'flex';

  var panel = document.getElementById('control-panel');
  if (panel) panel.style.display = 'none';

  if (modalId === 'adminMasterModal') {
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
  if (btnEl) btnEl.classList.add('active');
  else {
    var targetBtn = document.querySelector(`.admin-tabs .tab-btn[onclick*="${tabPaneId}"]`);
    if (targetBtn) targetBtn.classList.add('active');
  }

  document.querySelectorAll('.tab-pane').forEach(pane => {
    if (pane.id === tabPaneId) pane.classList.add('active');
    else pane.classList.remove('active');
  });
}

function getCurrentUser() {
  var state = (typeof AppStore !== 'undefined' && AppStore.getState) ? AppStore.getState() : {};
  return state.currentUser || (typeof currentUser !== 'undefined' ? currentUser : null) || JSON.parse(localStorage.getItem('tnn_user')) || {
    account: 'guest', role: 'nhan_vien', id_dai: null, id_tram: null
  };
}

// Hàm xác định quyền hạn người dùng hiện tại một cách rõ ràng
function getRoleAccess() {
  var user = getCurrentUser();
  var r = (user.role || '').toLowerCase();
  return {
    isSys: r.includes('sys'),
    isDai: r.includes('dai'),
    isTram: r.includes('tram'),
    idDai: String(user.id_dai || user.idDai || ''),
    idTram: String(user.id_tram || user.idTram || ''),
    account: user.account
  };
}

function getSafeDataList(keyNames) {
  var state = (typeof AppStore !== 'undefined' && AppStore.getState) ? AppStore.getState() : {};
  for (var i = 0; i < keyNames.length; i++) {
    var k = keyNames[i];
    if (state[k] && Array.isArray(state[k]) && state[k].length > 0) return state[k];
    if (window[k] && Array.isArray(window[k]) && window[k].length > 0) return window[k];
  }
  return [];
}

// ==========================================================================
// HỆ THỐNG LỌC PHÂN CẤP PHÂN QUYỀN THEO VAI TRÒ
// ==========================================================================
function getFilteredUsers() {
  var users = getSafeDataList(['rawUserList', 'userList', 'users', 'taiKhoanList']);
  var access = getRoleAccess();

  if (access.isSys) return users;
  if (access.isDai) return users.filter(u => String(u.id_dai) === access.idDai);
  if (access.isTram) return users.filter(u => String(u.id_tram) === access.idTram);
  return users.filter(u => u.account === access.account);
}

function getFilteredDaiList() {
  var daiList = getSafeDataList(['rawDaiList', 'daiList', 'dai_vt']);
  var access = getRoleAccess();

  if (access.isSys) return daiList;
  if (access.isDai) return daiList.filter(d => String(d.id_dai || d.id) === access.idDai);
  if (access.isTram) {
    var tramList = getSafeDataList(['rawTramList', 'tramList', 'tram_vt']);
    var myTram = tramList.find(t => String(t.id_tram || t.id) === access.idTram);
    var parentDaiId = myTram ? String(myTram.id_dai || myTram.dai_id) : null;
    return daiList.filter(d => String(d.id_dai || d.id) === parentDaiId);
  }
  return [];
}

function getFilteredTramList() {
  var tramList = getSafeDataList(['rawTramList', 'tramList', 'tram_vt']);
  var access = getRoleAccess();

  if (access.isSys) return tramList;
  if (access.isDai) return tramList.filter(t => String(t.id_dai || t.dai_id) === access.idDai);
  if (access.isTram) return tramList.filter(t => String(t.id_tram || t.id) === access.idTram);
  return tramList;
}

function getFilteredTuyenList() {
  return getSafeDataList(['rawTuyenList', 'tuyenList', 'tuyen_cap']);
}

function getFilteredDoanList() {
  var doanList = getSafeDataList(['rawDoanList', 'doanCapList', 'doan_cap', 'rawDoanCapList']);
  var access = getRoleAccess();

  if (access.isSys || access.isDai) return doanList;
  if (access.isTram) return doanList.filter(d => String(d.id_tram || d.tram_id) === access.idTram);
  return doanList;
}

function getDaiName(idDai) {
  if (!idDai) return 'Tất cả';
  var list = getSafeDataList(['rawDaiList', 'daiList', 'dai_vt']);
  var found = list.find(d => String(d.id_dai || d.id || d.dai_id) === String(idDai));
  return found ? (found.ten_dai || found.ten || found.name) : `Đài ID: ${idDai}`;
}

function getTramName(idTram) {
  if (!idTram) return 'Tất cả';
  var list = getSafeDataList(['rawTramList', 'tramList', 'tram_vt']);
  var found = list.find(t => String(t.id_tram || t.id || t.tram_id) === String(idTram));
  return found ? (found.ten_tram || found.ten || found.name) : `Trạm ID: ${idTram}`;
}

function getTuyenName(idTuyen) {
  if (!idTuyen) return 'Chưa rõ tuyến';
  var list = getSafeDataList(['rawTuyenList', 'tuyenList', 'tuyen_cap']);
  var found = list.find(t => String(t.id_tuyen_cap || t.id_tuyen || t.id || t.tuyen_id) === String(idTuyen));
  return found ? (found.ten_tuyen || found.ten_tuyencap || found.ten || found.name) : `Tuyến ID: ${idTuyen}`;
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
  var access = getRoleAccess();
  var users = getFilteredUsers();
  
  var addBtn = document.querySelector('#tab-accounts button.btn-success');
  if (addBtn) addBtn.style.display = (access.isSys || access.isDai) ? 'inline-block' : 'none';

  tbody.innerHTML = users.map(u => {
    var accName = u.account || 'Tài khoản';
    return `
      <tr>
        <td><b>${accName}</b></td>
        <td><span style="background:#0ea5e9; color:#fff; padding:2px 6px; border-radius:4px; font-size:11px;">${u.role || 'nhan_vien'}</span></td>
        <td>🏢 ${u.ten_dai || getDaiName(u.id_dai)}</td>
        <td>📡 ${u.ten_tram || getTramName(u.id_tram)}</td>
        <td>${u.can_edit_map ? '✅ Có' : '❌ Không'}</td>
        <td>
          ${(access.isSys || access.isDai) ? `<button class="btn-small btn-success" onclick="chuanBiFormThemThanhVien('${accName}')">✏️ Sửa</button>` : ''}
          ${access.isSys ? `<button class="btn-small del" onclick="deleteAdminRecord('tai_khoan', '${accName}')">🗑️ Xóa</button>` : ''}
        </td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="6" style="text-align:center; padding:15px;">Không có dữ liệu</td></tr>';
}

/** 2. BẢNG ĐÀI VIỄN THÔNG */
function renderMasterDaiTable() {
  var tbody = document.getElementById('masterDaiTableBody');
  if (!tbody) return;
  var access = getRoleAccess();
  var list = getFilteredDaiList();
  
  var addDaiBtn = document.querySelector('#tab-dai button.btn-success');
  if (addDaiBtn) addDaiBtn.style.display = access.isSys ? 'inline-block' : 'none';

  tbody.innerHTML = list.map(item => `
    <tr>
      <td>${item.id_dai || item.id}</td>
      <td><b>${item.ten_dai || item.ten || ''}</b></td>
      <td>
        ${(access.isSys || access.isDai) ? `<button class="btn-small btn-success" onclick="moFormThemDai(${item.id_dai || item.id})">✏️ Sửa</button>` : '<span style="color:#999; font-size:10px;">Chỉ xem</span>'}
        ${access.isSys ? `<button class="btn-small del" onclick="deleteAdminRecord('dai_vt', '${item.id_dai || item.id}')">🗑️ Xóa</button>` : ''}
      </td>
    </tr>
  `).join('') || '<tr><td colspan="3" style="text-align:center; padding:15px;">Không có dữ liệu Đài</td></tr>';
}

/** 3. BẢNG TRẠM VIỄN THÔNG */
function renderMasterTramTable() {
  var tbody = document.getElementById('masterTramTableBody');
  if (!tbody) return;
  var access = getRoleAccess();
  var list = getFilteredTramList();
  
  var addTramBtn = document.querySelector('#tab-tram button.btn-success');
  if (addTramBtn) addTramBtn.style.display = (access.isSys || access.isDai) ? 'inline-block' : 'none';

  tbody.innerHTML = list.map(item => `
    <tr>
      <td>${item.id_tram || item.id}</td>
      <td><b>${item.ten_tram || item.ten || ''}</b></td>
      <td>🏢 ${item.ten_dai || getDaiName(item.id_dai || item.dai_id)}</td>
      <td>
        ${(access.isSys || access.isDai || access.isTram) ? `<button class="btn-small btn-success" onclick="moFormThemTram(${item.id_tram || item.id})">✏️ Sửa</button>` : ''}
        ${(access.isSys || access.isDai) ? `<button class="btn-small del" onclick="deleteAdminRecord('tram_vt', '${item.id_tram || item.id}')">🗑️ Xóa</button>` : ''}
      </td>
    </tr>
  `).join('') || '<tr><td colspan="4" style="text-align:center; padding:15px;">Không có dữ liệu Trạm</td></tr>';
}

/** 4. BẢNG TUYẾN CÁP */
function renderMasterTuyenTable() {
  var tbody = document.getElementById('masterTuyenTableBody');
  if (!tbody) return;
  var access = getRoleAccess();
  var list = getFilteredTuyenList();
  
  var addTuyenBtn = document.querySelector('#tab-tuyen button.btn-success');
  if (addTuyenBtn) addTuyenBtn.style.display = (access.isSys || access.isDai) ? 'inline-block' : 'none';

  tbody.innerHTML = list.map(item => `
    <tr>
      <td>${item.id_tuyen_cap || item.id_tuyen || item.id}</td>
      <td>${item.ma_tuyencap || item.ma_tuyen || ''}</td>
      <td><b>${item.ten_tuyen || item.ten_tuyencap || item.ten || item.name || ''}</b></td>
      <td>
        <button class="btn-small btn-success" onclick="moFormThemTuyen(${item.id_tuyen_cap || item.id_tuyen || item.id})">✏️ Sửa</button>
        ${(access.isSys || access.isDai) ? `<button class="btn-small del" onclick="deleteAdminRecord('tuyen_cap', '${item.id_tuyen_cap || item.id_tuyen || item.id}')">🗑️ Xóa</button>` : ''}
      </td>
    </tr>
  `).join('') || '<tr><td colspan="4" style="text-align:center; padding:15px;">Không có dữ liệu Tuyến cáp</td></tr>';
}

/** 5. BẢNG ĐOẠN TUYẾN CÁP */
function renderMasterDoanTable() {
  var tbody = document.getElementById('masterDoanTableBody');
  if (!tbody) return;
  var list = getFilteredDoanList();
  
  tbody.innerHTML = list.map(item => {
    var idDoan = item.id_doan_cap || item.id;
    return `
      <tr>
        <td>${idDoan}</td>
        <td><b>${item.ma_doancap || item.ma_doan || ''}</b></td>
        <td>🛤️ ${item.ten_tuyen || item.ten_tuyencap || getTuyenName(item.id_tuyen || item.tuyen_id)}</td>
        <td>📡 ${item.ten_tram || getTramName(item.id_tram || item.tram_id)}</td>
        <td>
          <button class="btn-small btn-success" onclick="moFormThemDoan(${idDoan})">✏️ Sửa</button>
          <button class="btn-small del" onclick="deleteAdminRecord('doan_cap', '${idDoan}')">🗑️ Xóa</button>
        </td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="5" style="text-align:center; padding:15px;">Không có dữ liệu Đoạn cáp</td></tr>';
}

// ==========================================================================
// FORM THÊM / SỬA / XÓA (TỐI ƯU CẬP NHẬT TRẠNG THÁI LOCAL & SHOWTOAST)
// ==========================================================================

function chuanBiFormThemThanhVien(accToEdit) {
  var accountInput = document.getElementById('newMemberAccount');
  var passInput = document.getElementById('newMemberPass');
  var roleSelect = document.getElementById('newMemberRole');
  var canEditCheck = document.getElementById('newMemberCanEdit');
  var daiSelect = document.getElementById('newMemberDai');
  var tramSelect = document.getElementById('newMemberTram');

  if (roleSelect) {
    roleSelect.innerHTML = `
      <option value="nhan_vien">Nhân viên</option>
      <option value="admin_tram">Admin Trạm</option>
      <option value="admin_dai">Admin Đài</option>
      <option value="admin_sys">Admin Hệ thống</option>
    `;
  }

  var daiList = getFilteredDaiList();
  if (daiSelect) {
    daiSelect.innerHTML = '<option value="">-- Chọn Đài --</option>';
    daiList.forEach(d => { daiSelect.innerHTML += `<option value="${d.id_dai || d.id}">${d.ten_dai || d.ten}</option>`; });
  }

  var tramList = getFilteredTramList();
  if (tramSelect) {
    tramSelect.innerHTML = '<option value="">-- Chọn Trạm --</option>';
    tramList.forEach(t => { tramSelect.innerHTML += `<option value="${t.id_tram || t.id}">${t.ten_tram || t.ten}</option>`; });
  }

  if (accToEdit && accountInput) {
    accountInput.value = accToEdit; accountInput.disabled = true;
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
    if (accountInput) { accountInput.value = ''; accountInput.disabled = false; }
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
  
  if (!accVal) { 
    if (typeof showToast === 'function') showToast("⚠️ Vui lòng nhập tên tài khoản!", "error");
    return; 
  }

  // Gọi xác thực lớp thứ 2
  let isConfirmed = await showConfirmDialog(`Bạn có chắc chắn muốn lưu thông tin tài khoản <b>${accVal}</b> không?`, 'success');
  if (!isConfirmed) return;

  var payload = {
    account: accVal,
    role: document.getElementById('newMemberRole').value,
    can_edit_map: document.getElementById('newMemberCanEdit').checked,
    id_dai: document.getElementById('newMemberDai').value ? Number(document.getElementById('newMemberDai').value) : null,
    id_tram: document.getElementById('newMemberTram').value ? Number(document.getElementById('newMemberTram').value) : null
  };
  if (password) payload.password = password;

  try {
    showLoading("Đang lưu tài khoản...");
    var { data, error } = await supabaseClient.from('tai_khoan').upsert([payload]).select();
    if (error) throw error;
    
    if (data && data.length > 0) {
      var users = window.rawUserList || [];
      var idx = users.findIndex(u => u.account === accVal);
      if (idx >= 0) users[idx] = data[0]; else users.push(data[0]);
      window.rawUserList = users;
      AppStore.setState({ rawUserList: users });
    }

    if (typeof showToast === 'function') showToast("✅ Đã lưu thông tin tài khoản thành công!", "success");
    document.getElementById('addMemberModal').style.display = 'none';
    renderAllAdminTables();
    hideLoading();
  } catch (err) { 
    hideLoading();
    if (typeof showToast === 'function') showToast("❌ Lỗi không ghi được tài khoản: " + err.message, "error");
  }
}

function moFormThemDai(id) {
  var access = getRoleAccess();
  if (!access.isSys && !id) {
    showToast("❌ Chỉ Admin Hệ thống mới có quyền Thêm Đài Viễn Thông mới!", "error");
    return;
  }

  document.getElementById('auxTableType').value = 'dai_vt';
  document.getElementById('auxRecordId').value = id || '';
  document.getElementById('auxModalTitle').innerText = id ? '✏️ Sửa Đài Viễn Thông' : '➕ Thêm Đài Viễn Thông';
  
  var list = getFilteredDaiList();
  var item = id ? list.find(d => String(d.id_dai || d.id) === String(id)) : {};
  
  document.getElementById('auxFormFields').innerHTML = `
    <div class="form-group"><label>Tên Đài:</label><input type="text" id="auxTenDai" value="${item.ten_dai || item.ten || ''}" placeholder="Nhập tên đài"></div>
  `;
  document.getElementById('genericAuxModal').style.display = 'flex';
}

function moFormThemTram(id) {
  var access = getRoleAccess();
  if (!access.isSys && !access.isDai && !id) {
    showToast("❌ Bạn không có quyền Thêm Trạm mới!", "error"); return;
  }

  document.getElementById('auxTableType').value = 'tram_vt';
  document.getElementById('auxRecordId').value = id || '';
  document.getElementById('auxModalTitle').innerText = id ? '✏️ Sửa Trạm Viễn Thông' : '➕ Thêm Trạm Viễn Thông';
  
  var list = getFilteredTramList();
  var item = id ? list.find(t => String(t.id_tram || t.id) === String(id)) : {};
  
  var daiList = getFilteredDaiList();
  var daiOptions = daiList.map(d => `<option value="${d.id_dai || d.id}" ${String(d.id_dai || d.id) === String(item.id_dai || item.dai_id) ? 'selected' : ''}>${d.ten_dai || d.ten}</option>`).join('');

  document.getElementById('auxFormFields').innerHTML = `
    <div class="form-group"><label>Tên Trạm:</label><input type="text" id="auxTenTram" value="${item.ten_tram || item.ten || ''}" placeholder="Nhập tên trạm"></div>
    <div class="form-group"><label>Thuộc Đài:</label><select id="auxIdDai"><option value="">-- Chọn Đài --</option>${daiOptions}</select></div>
  `;
  document.getElementById('genericAuxModal').style.display = 'flex';
}

function moFormThemTuyen(id) {
  document.getElementById('auxTableType').value = 'tuyen_cap';
  document.getElementById('auxRecordId').value = id || '';
  document.getElementById('auxModalTitle').innerText = id ? '✏️ Sửa Tuyến Cáp' : '➕ Thêm Tuyến Cáp';
  
  var list = getFilteredTuyenList();
  var item = id ? list.find(t => String(t.id_tuyen_cap || t.id) === String(id)) : {};
  
  document.getElementById('auxFormFields').innerHTML = `
    <div class="form-group"><label>Mã tuyến cáp:</label><input type="text" id="auxMaTuyen" value="${item.ma_tuyencap || item.ma_tuyen || ''}" placeholder="VD: T01"></div>
    <div class="form-group"><label>Tên tuyến cáp:</label><input type="text" id="auxTenTuyen" value="${item.ten_tuyen || item.ten_tuyencap || item.ten || ''}" placeholder="Nhập tên tuyến"></div>
  `;
  document.getElementById('genericAuxModal').style.display = 'flex';
}

function moFormThemDoan(id) {
  document.getElementById('auxTableType').value = 'doan_cap';
  document.getElementById('auxRecordId').value = id || '';
  document.getElementById('auxModalTitle').innerText = id ? '✏️ Sửa Đoạn Cáp' : '➕ Thêm Đoạn Cáp';
  
  var list = getFilteredDoanList();
  var item = id ? list.find(d => String(d.id_doan_cap || d.id) === String(id)) : {};
  
  var tuyenList = getFilteredTuyenList();
  var tuyenOptions = tuyenList.map(tu => `<option value="${tu.id_tuyen_cap || tu.id}" ${String(tu.id_tuyen_cap || tu.id) === String(item.id_tuyen || item.tuyen_id) ? 'selected' : ''}>${tu.ten_tuyen || tu.ten_tuyencap || tu.ten || tu.ma_tuyencap}</option>`).join('');

  var tramList = getFilteredTramList();
  var tramOptions = tramList.map(tr => `<option value="${tr.id_tram || tr.id}" ${String(tr.id_tram || tr.id) === String(item.id_tram || item.tram_id) ? 'selected' : ''}>${tr.ten_tram || tr.ten}</option>`).join('');

  document.getElementById('auxFormFields').innerHTML = `
    <div class="form-group"><label>Mã đoạn cáp:</label><input type="text" id="auxMaDoan" value="${item.ma_doancap || item.ma_doan || ''}" placeholder="VD: D01"></div>
    <div class="form-group"><label>Thuộc Tuyến:</label><select id="auxIdTuyen"><option value="">-- Chọn Tuyến --</option>${tuyenOptions}</select></div>
    <div class="form-group"><label>Thuộc Trạm:</label><select id="auxIdTram"><option value="">-- Chọn Trạm --</option>${tramOptions}</select></div>
  `;
  document.getElementById('genericAuxModal').style.display = 'flex';
}

async function saveAuxRecord() {
  var tableType = document.getElementById('auxTableType').value;
  var recordId = document.getElementById('auxRecordId').value;
  var payload = {};
  var pkCol = '';
  var itemName = '';

  if (tableType === 'dai_vt') {
    pkCol = 'id_dai';
    payload.ten_dai = document.getElementById('auxTenDai').value.trim();
    itemName = payload.ten_dai;
    if (!payload.ten_dai) { showToast("⚠️ Vui lòng nhập tên Đài!", "error"); return; }
  } else if (tableType === 'tram_vt') {
    pkCol = 'id_tram';
    payload.ten_tram = document.getElementById('auxTenTram').value.trim();
    payload.id_dai = document.getElementById('auxIdDai').value ? Number(document.getElementById('auxIdDai').value) : null;
    itemName = payload.ten_tram;
    if (!payload.ten_tram) { showToast("⚠️ Vui lòng nhập tên Trạm!", "error"); return; }
  } else if (tableType === 'tuyen_cap') {
    pkCol = 'id_tuyen_cap';
    payload.ma_tuyencap = document.getElementById('auxMaTuyen').value.trim();
    payload.ten_tuyen = document.getElementById('auxTenTuyen').value.trim();
    itemName = payload.ten_tuyen;
    if (!payload.ten_tuyen) { showToast("⚠️ Vui lòng nhập tên Tuyến cáp!", "error"); return; }
  } else if (tableType === 'doan_cap') {
    pkCol = 'id_doan_cap';
    payload.ma_doancap = document.getElementById('auxMaDoan').value.trim();
    payload.id_tuyen = document.getElementById('auxIdTuyen').value ? Number(document.getElementById('auxIdTuyen').value) : null;
    payload.id_tram = document.getElementById('auxIdTram').value ? Number(document.getElementById('auxIdTram').value) : null;
    itemName = payload.ma_doancap;
    if (!payload.ma_doancap) { showToast("⚠️ Vui lòng nhập mã đoạn cáp!", "error"); return; }
  }

  if (recordId && recordId !== '') { payload[pkCol] = Number(recordId); }

  // Gọi xác thực lớp thứ 2
  let isConfirmed = await showConfirmDialog(`Xác nhận lưu thay đổi cho mục: <b>${itemName}</b>?`, 'success');
  if (!isConfirmed) return;

  try {
    showLoading("Đang lưu dữ liệu...");
    var { data, error } = await supabaseClient.from(tableType).upsert([payload]).select();
    if (error) throw error;
    
    if (data && data.length > 0) {
      var savedItem = data[0];
      var idVal = savedItem[pkCol] || savedItem.id;
      
      if (tableType === 'dai_vt') {
        var idx = window.rawDaiList.findIndex(x => (x.id_dai || x.id) == idVal);
        if (idx >= 0) window.rawDaiList[idx] = savedItem; else window.rawDaiList.push(savedItem);
        AppStore.setState({ daiList: window.rawDaiList, rawDaiList: window.rawDaiList });
      } else if (tableType === 'tram_vt') {
        var idxT = window.rawTramList.findIndex(x => (x.id_tram || x.id) == idVal);
        if (idxT >= 0) window.rawTramList[idxT] = savedItem; else window.rawTramList.push(savedItem);
        AppStore.setState({ tramList: window.rawTramList, rawTramList: window.rawTramList });
      } else if (tableType === 'tuyen_cap') {
        var idxTu = window.rawTuyenList.findIndex(x => (x.id_tuyen_cap || x.id) == idVal);
        if (idxTu >= 0) window.rawTuyenList[idxTu] = savedItem; else window.rawTuyenList.push(savedItem);
        AppStore.setState({ tuyenList: window.rawTuyenList, rawTuyenList: window.rawTuyenList });
      } else if (tableType === 'doan_cap') {
        var idxD = window.rawDoanCapList.findIndex(x => (x.id_doan_cap || x.id) == idVal);
        if (idxD >= 0) window.rawDoanCapList[idxD] = savedItem; else window.rawDoanCapList.push(savedItem);
        AppStore.setState({ doanCapList: window.rawDoanCapList, rawDoanList: window.rawDoanCapList });
      }
    }

    if (typeof showToast === 'function') showToast("✅ Lưu dữ liệu danh mục thành công!", "success");
    document.getElementById('genericAuxModal').style.display = 'none';
    
    renderAllAdminTables();
    if (typeof xuLyPhanQuyenDoanTuyenUser === 'function') xuLyPhanQuyenDoanTuyenUser();
    hideLoading();
  } catch (err) {
    hideLoading();
    if (typeof showToast === 'function') showToast("❌ Không thể ghi dữ liệu: " + err.message, "error");
  }
}

async function deleteAdminRecord(tableName, idItem) {
  // Gọi xác thực lớp thứ 2 với cảnh báo mức độ xóa
  let isConfirmed = await showConfirmDialog(`⚠️ CẢNH BÁO:<br>Bạn có chắc chắn muốn xóa vĩnh viễn bản ghi <b>ID: ${idItem}</b> này khỏi cơ sở dữ liệu không?`, 'danger');
  if (!isConfirmed) return;

  var pkCol = '';
  if (tableName === 'tai_khoan') pkCol = 'account';
  else if (tableName === 'dai_vt') pkCol = 'id_dai';
  else if (tableName === 'tram_vt') pkCol = 'id_tram';
  else if (tableName === 'tuyen_cap') pkCol = 'id_tuyen_cap';
  else if (tableName === 'doan_cap') pkCol = 'id_doan_cap';

  try {
    showLoading("Đang xóa dữ liệu...");
    var query = supabaseClient.from(tableName).delete();
    if (tableName === 'tai_khoan') query = query.eq(pkCol, idItem);
    else query = query.eq(pkCol, Number(idItem));
    
    var { error } = await query;
    if (error) throw error;
    
    if (tableName === 'tai_khoan') {
      window.rawUserList = window.rawUserList.filter(x => x.account !== idItem);
      AppStore.setState({ rawUserList: window.rawUserList });
    } else if (tableName === 'dai_vt') {
      window.rawDaiList = window.rawDaiList.filter(x => (x.id_dai || x.id) != idItem);
      AppStore.setState({ daiList: window.rawDaiList, rawDaiList: window.rawDaiList });
    } else if (tableName === 'tram_vt') {
      window.rawTramList = window.rawTramList.filter(x => (x.id_tram || x.id) != idItem);
      AppStore.setState({ tramList: window.rawTramList, rawTramList: window.rawTramList });
    } else if (tableName === 'tuyen_cap') {
      window.rawTuyenList = window.rawTuyenList.filter(x => (x.id_tuyen_cap || x.id) != idItem);
      AppStore.setState({ tuyenList: window.rawTuyenList, rawTuyenList: window.rawTuyenList });
    } else if (tableName === 'doan_cap') {
      window.rawDoanCapList = window.rawDoanCapList.filter(x => (x.id_doan_cap || x.id) != idItem);
      AppStore.setState({ doanCapList: window.rawDoanCapList, rawDoanList: window.rawDoanCapList });
    }
    
    if (typeof showToast === 'function') showToast("🗑️ Đã xóa bản ghi thành công!", "success");
    renderAllAdminTables();
    if (typeof xuLyPhanQuyenDoanTuyenUser === 'function') xuLyPhanQuyenDoanTuyenUser();
    hideLoading();
  } catch (err) {
    hideLoading();
    if (typeof showToast === 'function') showToast("❌ Không thể xóa bản ghi: " + err.message, "error");
  }
}

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
    showToast("⚠️ Vui lòng nhập đầy đủ thông tin mật khẩu!", "error"); return;
  }
  if (newPass !== confirmPass) {
    showToast("❌ Mật khẩu mới và xác nhận mật khẩu không khớp!", "error"); return;
  }

  var user = getCurrentUser();
  var accName = user.account;
  if (!accName) { 
    showToast("⚠️ Không tìm thấy thông tin tài khoản!", "error"); return; 
  }

  try {
    showLoading("Đang đổi mật khẩu...");
    var res = await supabaseClient.from('tai_khoan').update({ password: newPass }).eq('account', accName);
    if (res.error) throw res.error;

    showToast("✅ Đổi mật khẩu thành công!", "success");
    document.getElementById('changePasswordModal').style.display = 'none';
    hideLoading();
  } catch (err) {
    hideLoading();
    showToast("❌ Lỗi đổi mật khẩu: " + err.message, "error");
  }
}
