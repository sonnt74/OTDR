// ==========================================================================
// TỆP ADMIN.JS - QUẢN TRỊ 5 TAB, BẢO MẬT 2 LỚP & CHUẨN HÓA PHÂN QUYỀN TRẠM
// ==========================================================================

function openModal(modalId, tabId) {
  closeModals();
  var targetModal = document.getElementById(modalId);
  if (targetModal) targetModal.style.display = 'flex';

  var panel = document.getElementById('control-panel');
  if (panel) panel.style.display = 'none';

  if (modalId === 'adminMasterModal') {
    renderAllAdminTables();
    
    // THÊM: Kiểm tra quyền để bật/tắt nút Tab Excel
    var access = getRoleAccess();
    var excelTabBtn = document.getElementById('tab-btn-excel');
    if (excelTabBtn) {
       excelTabBtn.style.display = access.isSys ? 'inline-block' : 'none';
    }
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

function getRoleAccess() {
  var user = getCurrentUser();
  var r = (user.role || '').toLowerCase().trim();
  
  var isSys = r.includes('sys') || r === 'admin_sys';
  var isDai = r.includes('dai') || r === 'admin_dai';
  var isTram = r.includes('tram') || r === 'admin_tram';
  var isMember = r === 'nhan_vien' || r === 'member' || (!isSys && !isDai && !isTram);

  return {
    isSys: isSys,
    isDai: isDai,
    isTram: isTram,
    isMember: isMember,
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
// BỘ LỌC PHÂN QUYỀN CHUẨN HÓA (DÙNG CHUNG CHO BẢNG QUẢN TRỊ VÀ BẢN ĐỒ)
// ==========================================================================

function getFilteredUsers() {
  var users = getSafeDataList(['rawUserList', 'userList', 'users', 'taiKhoanList']);
  var access = getRoleAccess();

  if (access.isSys) return users;
  if (access.isDai) {
    var tramIdsInDai = getFilteredTramList().map(t => String(t.id_tram || t.id));
    return users.filter(u => String(u.id_dai) === access.idDai || tramIdsInDai.includes(String(u.id_tram)));
  }
  if (access.isTram) {
    return users.filter(u => String(u.id_tram) === access.idTram);
  }
  if (access.isMember) {
    return users.filter(u => {
      if (access.idTram && u.id_tram && String(u.id_tram) === String(access.idTram)) return true;
      return String(u.account).toLowerCase() === String(access.account).toLowerCase();
    });
  }
  return [];
}

function getFilteredDaiList() {
  var daiList = getSafeDataList(['rawDaiList', 'daiList', 'dai_vt']);
  var access = getRoleAccess();

  if (access.isSys) return daiList;
  if (access.isDai) return daiList.filter(d => String(d.id_dai || d.id) === access.idDai);
  if (access.isTram || access.isMember) {
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
  if (access.isTram || access.isMember) return tramList.filter(t => String(t.id_tram || t.id) === access.idTram);
  return [];
}

function getFilteredDoanList() {
  var doanList = getSafeDataList(['rawDoanList', 'doanCapList', 'doan_cap', 'rawDoanCapList']);
  var access = getRoleAccess();

  if (access.isSys) return doanList;
  if (access.isDai) {
    var tramIdsInDai = getFilteredTramList().map(t => String(t.id_tram || t.id));
    return doanList.filter(d => tramIdsInDai.includes(String(d.id_tram || d.tram_id)));
  }
  if (access.isTram || access.isMember) {
    return doanList.filter(d => String(d.id_tram || d.tram_id) === access.idTram);
  }
  return [];
}

function getFilteredTuyenList() {
  var tuyenList = getSafeDataList(['rawTuyenList', 'tuyenList', 'tuyen_cap']);
  var access = getRoleAccess();

  if (access.isSys) return tuyenList;
  
  var validDoanList = getFilteredDoanList();
  var validTuyenIds = validDoanList.map(d => String(d.id_tuyen || d.tuyen_id || d.id_tuyen_cap));
  
  return tuyenList.filter(t => validTuyenIds.includes(String(t.id_tuyen_cap || t.id_tuyen || t.id)));
}

// Cầu nối dữ liệu sạch cho Bản đồ / Bảng điều khiển chính
function getMapDataFiltered() {
  return {
    tramList: getFilteredTramList(),
    doanList: getFilteredDoanList(),
    tuyenList: getFilteredTuyenList()
  };
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

/** 1. RENDER BẢNG TÀI KHOẢN */
function renderMasterAccountTable() {
  var tbody = document.getElementById('masterAccountTableBody');
  if (!tbody) return;
  var access = getRoleAccess();
  var users = getFilteredUsers();
  
  var addBtn = document.querySelector('#tab-accounts button.btn-success');
  if (addBtn) {
    addBtn.style.display = access.isMember ? 'none' : 'inline-block';
  }

  tbody.innerHTML = users.map(u => {
    var accName = u.account || 'Tài khoản';
    var tenAcc = u.ten_account ? u.ten_account : '<span style="color:#999; font-style:italic;">Chưa cập nhật</span>';
    var soDt = u.so_dt ? u.so_dt : '<span style="color:#999; font-style:italic;">Chưa có</span>';
    var roleVal = u.role || 'nhan_vien';
    
    var canModify = access.isSys || 
                    (access.isDai && String(u.id_dai) === access.idDai) || 
                    (access.isTram && String(u.id_tram) === access.idTram);

    return `
      <tr>
        <td><b>${accName}</b></td>
        <td>👤 ${tenAcc}</td>
        <td>📞 ${soDt}</td>
        <td><span style="background:#0ea5e9; color:#fff; padding:2px 6px; border-radius:4px; font-size:11px;">${roleVal}</span></td>
        <td>🏢 ${u.ten_dai || getDaiName(u.id_dai)}</td>
        <td>📡 ${u.ten_tram || getTramName(u.id_tram)}</td>
        <td>
          ${canModify ? `<button class="btn-small btn-success" onclick="chuanBiFormThemThanhVien('${accName}')">✏️ Sửa</button>` : ''}
          ${(access.isSys || (access.isDai && canModify)) ? `<button class="btn-small del" onclick="deleteAdminRecord('tai_khoan', '${accName}')">🗑️ Xóa</button>` : ''}
        </td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="7" style="text-align:center; padding:15px;">Không có dữ liệu tài khoản</td></tr>';
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
// CÁC FORM THÊM / SỬA VÀ THỰC THI DỮ LIỆU
// ==========================================================================
function chuanBiFormThemThanhVien(accToEdit) {
  var accountInput = document.getElementById('newMemberAccount');
  var tenAccountInput = document.getElementById('newMemberTenAccount');
  var soDtInput = document.getElementById('newMemberSoDT');
  var passInput = document.getElementById('newMemberPass');
  var roleSelect = document.getElementById('newMemberRole');
  var canEditCheck = document.getElementById('newMemberCanEdit');
  var daiSelect = document.getElementById('newMemberDai');
  var tramSelect = document.getElementById('newMemberTram');

  var access = getRoleAccess();

  // Load danh sách vai trò theo quyền
  if (roleSelect) {
    let roleHtml = `<option value="nhan_vien">Nhân viên</option>`;
    if (access.isSys) {
      roleHtml += `
        <option value="admin_tram">Admin Trạm</option>
        <option value="admin_dai">Admin Đài</option>
        <option value="admin_sys">Admin Hệ thống</option>
      `;
    } else if (access.isDai) {
      roleHtml += `<option value="admin_tram">Admin Trạm</option>`;
    }
    roleSelect.innerHTML = roleHtml;
  }

  // Load danh sách Đài
  var daiList = (typeof getFilteredDaiList === 'function') ? getFilteredDaiList() : rawDaiList;
  if (daiSelect) {
    daiSelect.innerHTML = '<option value="">-- Chọn Đài --</option>';
    daiList.forEach(d => { 
      daiSelect.innerHTML += `<option value="${d.id_dai || d.id}">${d.ten_dai || d.ten}</option>`; 
    });
    if (access.isDai && !access.isSys) {
      daiSelect.value = access.idDai;
      daiSelect.disabled = true; 
    } else {
      daiSelect.disabled = false;
    }
  }

  // Load danh sách Trạm
  var tramList = (typeof getFilteredTramList === 'function') ? getFilteredTramList() : rawTramList;
  if (tramSelect) {
    tramSelect.innerHTML = '<option value="">-- Chọn Trạm --</option>';
    tramList.forEach(t => { 
      tramSelect.innerHTML += `<option value="${t.id_tram || t.id}">${t.ten_tram || t.ten}</option>`; 
    });
    if (access.isTram && !access.isSys && !access.isDai) {
      tramSelect.value = access.idTram;
      tramSelect.disabled = true; 
    } else {
      tramSelect.disabled = false;
    }
  }

  // KIỂM TRA: NẾU LÀ CHẾ ĐỘ SỬA -> LOAD DỮ LIỆU LÊN FORM
  if (accToEdit && accountInput) {
    accountInput.value = accToEdit; 
    accountInput.readOnly = true; // Khóa tên tài khoản không cho sửa
    accountInput.style.backgroundColor = "#e2e8f0";
    if (passInput) passInput.value = ''; // Để trống mật khẩu, nếu không nhập gì thì giữ mk cũ

    var users = getSafeDataList(['rawUserList', 'userList', 'users', 'taiKhoanList']);
    var uObj = users.find(u => u.account === accToEdit);
    
    // Nạp chính xác dữ liệu của user vào Form
    if (uObj) {
      if (tenAccountInput) tenAccountInput.value = uObj.ten_account || '';
      if (soDtInput) soDtInput.value = uObj.so_dt || '';
      if (roleSelect) roleSelect.value = uObj.role || 'nhan_vien';
      if (canEditCheck) canEditCheck.checked = !!uObj.can_edit_map;
      if (daiSelect) daiSelect.value = uObj.id_dai || (access.isDai ? access.idDai : '');
      if (tramSelect) tramSelect.value = uObj.id_tram || (access.isTram ? access.idTram : '');
    }
  } else {
    // KIỂM TRA: NẾU LÀ THÊM MỚI -> LÀM TRỐNG FORM
    if (accountInput) { 
      accountInput.value = ''; 
      accountInput.readOnly = false; 
      accountInput.style.backgroundColor = "#ffffff";
    }
    if (tenAccountInput) tenAccountInput.value = '';
    if (soDtInput) soDtInput.value = '';
    if (passInput) passInput.value = '';
    if (roleSelect) roleSelect.value = 'nhan_vien';
    if (canEditCheck) canEditCheck.checked = false;
    if (daiSelect) daiSelect.value = access.isDai ? access.idDai : '';
    if (tramSelect) tramSelect.value = access.isTram ? access.idTram : '';
  }

  var modal = document.getElementById('addMemberModal');
  if (modal) modal.style.display = 'flex';
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
    <div class="form-group"><label>Tên đoạn cáp:</label><input type="text" id="auxTenDoan" value="${item.ten_doan_cap || item.ten_doancap || item.ten || ''}" placeholder="VD: Đoạn từ Trạm - Cột 1"></div>
    <div class="form-group"><label>Thuộc Tuyến:</label><select id="auxIdTuyen"><option value="">-- Chọn Tuyến --</option>${tuyenOptions}</select></div>
    <div class="form-group"><label>Thuộc Trạm:</label><select id="auxIdTram"><option value="">-- Chọn Trạm --</option>${tramOptions}</select></div>
  `;
  document.getElementById('genericAuxModal').style.display = 'flex';
}

async function saveAccountAction() {
  var accountInput = document.getElementById('newMemberAccount');
  var isEditing = accountInput ? accountInput.readOnly : false;
  
  // Thu thập dữ liệu từ Form
  var accVal = accountInput ? accountInput.value.trim() : '';
  var tenAccVal = document.getElementById('newMemberTenAccount').value.trim();
  var soDtVal = document.getElementById('newMemberSoDT').value.trim();
  var password = document.getElementById('newMemberPass').value.trim();
  var selectedRole = document.getElementById('newMemberRole').value;
  var selectedDai = document.getElementById('newMemberDai').value;
  var selectedTram = document.getElementById('newMemberTram').value;
  var access = getRoleAccess();
  
  // KHỐNG CHẾ NHẬP LIỆU: Bật cảnh báo và dừng lưu nếu thiếu bất kỳ trường nào
  if (!accVal) { showToast("⚠️ Vui lòng nhập Tên tài khoản!", "error"); return; }
  if (!tenAccVal) { showToast("⚠️ Vui lòng nhập Họ và tên!", "error"); return; }
  if (!soDtVal) { showToast("⚠️ Vui lòng nhập Số điện thoại!", "error"); return; }
  
  // Mật khẩu bắt buộc nhập khi thêm mới. Khi sửa, nếu để trống thì giữ nguyên mật khẩu cũ
  if (!isEditing && !password) { 
    showToast("⚠️ Vui lòng khởi tạo Mật khẩu cho tài khoản mới!", "error"); return; 
  }
  
  // Khống chế Đài/Trạm (Trừ tài khoản admin hệ thống tối cao)
  if (selectedRole !== 'admin_sys') {
    if (!selectedDai && !access.isDai) { showToast("⚠️ Vui lòng chọn Đài viễn thông!", "error"); return; }
    if (!selectedTram && !access.isTram) { showToast("⚠️ Vui lòng chọn Trạm viễn thông!", "error"); return; }
  }

  // Xử lý kiểm tra trùng lặp tài khoản khi Thêm mới
  var users = getSafeDataList(['rawUserList', 'userList', 'users', 'taiKhoanList']);
  var existingUser = users.find(u => u.account === accVal);

  if (!isEditing && existingUser) {
    showToast(`❌ Tên tài khoản "${accVal}" đã tồn tại! Vui lòng chọn tên khác.`, "error");
    return;
  }

  let actionTitle = isEditing ? `Cập nhật thông tin tài khoản <b>${accVal}</b>` : `Thêm mới tài khoản <b>${accVal}</b>`;
  let isConfirmed = await showConfirmDialog(`Bạn có chắc chắn muốn ${actionTitle} không?`, 'success');
  if (!isConfirmed) return;

  var payload = {
    account: accVal,
    ten_account: tenAccVal,
    so_dt: soDtVal,
    role: selectedRole,
    can_edit_map: document.getElementById('newMemberCanEdit').checked,
    id_dai: (access.isDai && !access.isSys) ? Number(access.idDai) : (selectedDai ? Number(selectedDai) : null),
    id_tram: (access.isTram && !access.isSys && !access.isDai) ? Number(access.idTram) : (selectedTram ? Number(selectedTram) : null)
  };

  if (password) {
    payload.password = password;
  } else if (existingUser && existingUser.password) {
    payload.password = existingUser.password;
  }

  try {
    showLoading("Đang lưu tài khoản...");
    var { data, error } = await supabaseClient.from('tai_khoan').upsert([payload]).select();
    if (error) throw error;
    
    if (data && data.length > 0) {
      var idx = users.findIndex(u => u.account === accVal);
      if (idx >= 0) users[idx] = data[0]; else users.push(data[0]);
      window.rawUserList = users;
      if (typeof AppStore !== 'undefined') AppStore.setState({ rawUserList: users });
    }

    showToast("✅ Lưu tài khoản thành công!", "success");
    document.getElementById('addMemberModal').style.display = 'none';
    renderAllAdminTables();
    hideLoading();
  } catch (err) { 
    hideLoading();
    showToast("❌ Lỗi không ghi được tài khoản: " + err.message, "error");
  }
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
    payload.ten_doan_cap = document.getElementById('auxTenDoan').value.trim();
    payload.id_tuyen = document.getElementById('auxIdTuyen').value ? Number(document.getElementById('auxIdTuyen').value) : null;
    payload.id_tram = document.getElementById('auxIdTram').value ? Number(document.getElementById('auxIdTram').value) : null;
    itemName = payload.ten_doan_cap;
    if (!payload.ma_doancap || !payload.ten_doan_cap) { showToast("⚠️ Vui lòng nhập đủ mã và tên đoạn cáp!", "error"); return; }
  }

  if (recordId && recordId !== '') { payload[pkCol] = Number(recordId); }

  let isConfirmed = await showConfirmDialog(`Xác nhận lưu thay đổi cho mục:<br><b>${itemName}</b>?`, 'success');
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

    showToast("✅ Lưu dữ liệu danh mục thành công!", "success");
    document.getElementById('genericAuxModal').style.display = 'none';
    
    renderAllAdminTables();
    if (typeof xuLyPhanQuyenDoanTuyenUser === 'function') xuLyPhanQuyenDoanTuyenUser();
    hideLoading();
  } catch (err) {
    hideLoading();
    showToast("❌ Không thể ghi dữ liệu: " + err.message, "error");
  }
}

async function deleteAdminRecord(tableName, idItem) {
  let isConfirmed = await showConfirmDialog(`⚠️ CẢNH BÁO:<br>Bạn có chắc chắn muốn xóa vĩnh viễn bản ghi <b>ID: ${idItem}</b> này khỏi hệ thống không?`, 'danger');
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
    
    showToast("🗑️ Đã xóa bản ghi thành công!", "success");
    renderAllAdminTables();
    if (typeof xuLyPhanQuyenDoanTuyenUser === 'function') xuLyPhanQuyenDoanTuyenUser();
    hideLoading();
  } catch (err) {
    hideLoading();
    showToast("❌ Không thể xóa bản ghi: " + err.message, "error");
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

// ==========================================================================
// MODULE QUẢN LÝ DỮ LIỆU EXCEL (IMPORT/EXPORT MULTI-SHEET) CHO ADMIN SYS
// ==========================================================================
document.addEventListener('DOMContentLoaded', function() {
  var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (mutation.target.id === 'adminMasterModal' && mutation.target.style.display === 'flex') loadExcelComboboxes();
    });
  });
  var adminModal = document.getElementById('adminMasterModal');
  if (adminModal) observer.observe(adminModal, { attributes: true, attributeFilter: ['style'] });
});

function loadExcelComboboxes() {
  var tuyenList = (typeof getFilteredTuyenList === 'function') ? getFilteredTuyenList() : (window.rawTuyenList || []);
  var selTuyen = document.getElementById('excelSelectTuyen');
  if (selTuyen) {
    selTuyen.innerHTML = '<option value="">-- Chọn Tuyến Cáp --</option>';
    tuyenList.forEach(t => { selTuyen.innerHTML += `<option value="${t.id_tuyen_cap || t.id}">${t.ten_tuyen || t.ten_tuyencap}</option>`; });
  }
  updateExcelDoanOptions();
}

function updateExcelDoanOptions() {
  var selTuyen = document.getElementById('excelSelectTuyen');
  var selDoan = document.getElementById('excelSelectDoan');
  if (!selTuyen || !selDoan) return;
  var doanList = (typeof getFilteredDoanList === 'function') ? getFilteredDoanList() : (window.rawDoanCapList || []);
  selDoan.innerHTML = '<option value="">-- Chọn Đoạn Cáp --</option>';
  if (selTuyen.value) {
    doanList.filter(d => String(d.id_tuyen || d.tuyen_id) === String(selTuyen.value)).forEach(d => {
      selDoan.innerHTML += `<option value="${d.id_doan_cap || d.id}">${d.ten_doan_cap || d.ma_doancap}</option>`;
    });
  }
}

function xuatDuLieuExcelAdmin() {
  if (typeof globalDataPoints === 'undefined' || globalDataPoints.length === 0) { showToast("⚠️ Bản đồ trống!", "error"); return; }
  showLoading("Đang xuất báo cáo...");
  try {
    let data = globalDataPoints.map((pt, i) => ({
      "STT": i + 1, "ID Điểm": pt.id, "Tên Điểm": pt.ten || "", "Loại Điểm": pt.loai || "",
      "Vĩ độ": pt.lat, "Kinh độ": pt.lng, "Lý Trình": pt.lyTrinh || "", "Dự Trữ": pt.duTru || 0,
      "Tuyến": typeof getTuyenName === 'function' ? getTuyenName(pt.idTuyen) : pt.idTuyen,
      "Ghi Chú": pt.ghiChu || "", "Ghi Chú Mật": pt.ghichu_an || ""
    }));
    let wb = XLSX.utils.book_new(), ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 5 }, { wch: 10 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 20 }, { wch: 20 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws, "Diem_Ban_Do");
    XLSX.writeFile(wb, `BaoCao_DiemHaTang_${new Date().getTime()}.xlsx`);
    showToast("✅ Xuất thành công!", "success");
  } catch (e) { showToast("❌ Lỗi xuất file!", "error"); } finally { hideLoading(); }
}

async function taiFileMauHoacDuLieuCu() {
  var idDoan = document.getElementById('excelSelectDoan').value;
  if (!idDoan) { showToast("⚠️ Vui lòng chọn Đoạn Cáp!", "error"); return; }
  
  showLoading("Đang chuẩn bị file Multi-Sheet...");
  try {
    let { data: pts } = await supabaseClient.from('doan_cap_diem').select('thu_tu, diem_ha_tang(*)').eq('id_doan_cap', Number(idDoan)).order('thu_tu', { ascending: true });
    
    let mainData = pts && pts.length > 0 ? pts.map(p => {
      let d = p.diem_ha_tang;
      return {
        "STT": p.thu_tu, "ID Điểm": d.id_diem, "Tên Điểm": d.ten_diem, "ID Loại Điểm": d.id_loaidiem,
        "Vĩ độ": d.lat, "Kinh độ": d.long, "Lý Trình": d.ly_trinh || "", "Dự Trữ": d.du_tru || 0,
        "Tuyến Đường": d.duong || "", "ID Hướng": d.id_huong || "", "Cách Trạm": d.do_cach_tram || "", "ID Trạm": d.id_tram || "",
        "Ngày PS": d.ngay_ps || "", "Ghi Chú": d.ghi_chu || "", "Ghi Chú Mật": d.ghichu_an || ""
      };
    }) : [{
        "STT": 1, "ID Điểm": "", "Tên Điểm": "Cột 01A", "ID Loại Điểm": 1, "Vĩ độ": 21.5942, "Kinh độ": 105.8481,
        "Lý Trình": "1+200", "Dự Trữ": 15, "Tuyến Đường": "", "ID Hướng": "", "Cách Trạm": "", "ID Trạm": "", "Ngày PS": "", "Ghi Chú": "", "Ghi Chú Mật": ""
    }];

    let wb = XLSX.utils.book_new();
    
    // Sheet 1: Data Import
    let wsMain = XLSX.utils.json_to_sheet(mainData);
    XLSX.utils.book_append_sheet(wb, wsMain, "Data_Import");

    // Sheet 2: Hướng Dẫn
    let wsHD = XLSX.utils.json_to_sheet([{ 
      "Quy Tắc": "1. ID Điểm để trống sẽ tạo điểm mới. 2. Nếu điền ID cũ, hệ thống sẽ dùng chung điểm đó. 3. Các cột ID phải xem bên các Sheet phụ." 
    }]);
    XLSX.utils.book_append_sheet(wb, wsHD, "Huong_Dan");

    // Sheets Phụ trợ từ RAM
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((window.rawLoaiDiemList||[]).map(x=>({ "ID Loại": x.id_loaidiem || x.id, "Tên": x.ten_loaidiem || x.ten }))), "Loai_Diem");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((window.rawHuongList||[]).map(x=>({ "ID Hướng": x.id_huong || x.id, "Tên": x.ten_huong || x.ten }))), "Huong");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((window.rawTramList||[]).map(x=>({ "ID Trạm": x.id_tram || x.id, "Tên": x.ten_tram || x.ten }))), "Tram_VT");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((window.rawDoanCapList||[]).map(x=>({ "ID Đoạn": x.id_doan_cap || x.id, "Mã": x.ma_doancap, "Tên": x.ten_doan_cap }))), "Doan_Cap");

    XLSX.writeFile(wb, `DuLieu_Doan_${idDoan}.xlsx`);
    showToast(pts && pts.length > 0 ? `📥 Tải ${pts.length} điểm thành công!` : `📥 Đã tạo file mẫu.`, "success");
  } catch (err) { showToast("❌ Lỗi tải file: " + err.message, "error"); } finally { hideLoading(); }
}

async function kiemDuyetVaImportExcel() {
  if (!navigator.onLine) { showToast("⚠️ Hệ thống Offline. Vui lòng kết nối mạng để Import!", "error"); return; }
  
  var idDoan = document.getElementById('excelSelectDoan').value;
  var fileInput = document.getElementById('fileExcelUpload');
  var stBox = document.getElementById('excelImportStatus'), stText = document.getElementById('excelStatusText'), pBar = document.getElementById('excelProgressBar');

  if (!idDoan || !fileInput.files.length) { showToast("⚠️ Chọn Đoạn cáp và File Excel!", "error"); return; }

  let file = fileInput.files[0];
  let reader = new FileReader();

  reader.onload = async function(e) {
    try {
      let data = new Uint8Array(e.target.result);
      let workbook = XLSX.read(data, { type: 'array' });
      // Chỉ đọc sheet đầu tiên (Data_Import)
      let rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]); 

      if (rows.length === 0) { showToast("⚠️ File trống!", "error"); return; }

      // Validate Local
      for (let i = 0; i < rows.length; i++) {
        let r = rows[i];
        if (!r["Tên Điểm"]) throw new Error(`Dòng ${i+2}: Thiếu Tên Điểm`);
        if (isNaN(r["Vĩ độ"]) || isNaN(r["Kinh độ"])) throw new Error(`Dòng ${i+2}: Tọa độ sai`);
        if (!r["ID Loại Điểm"]) throw new Error(`Dòng ${i+2}: Thiếu ID Loại Điểm`);
      }

      if (!await showConfirmDialog(`File hợp lệ! Phát hiện <b>${rows.length}</b> bản ghi.<br>Xác nhận đồng bộ vào Đoạn ID: ${idDoan}?`, 'success')) return;

      stBox.style.display = 'block'; pBar.style.width = '0%';
      let successCount = 0;

      // Xử lý Chunking & Upsert
      for (let i = 0; i < rows.length; i++) {
        let r = rows[i];
        stText.innerText = `Đang xử lý: ${i+1} / ${rows.length}...`;
        
        let payload = {
          ten_diem: r["Tên Điểm"], lat: parseFloat(r["Vĩ độ"]), long: parseFloat(r["Kinh độ"]),
          id_loaidiem: parseInt(r["ID Loại Điểm"]), ly_trinh: r["Lý Trình"] || null, du_tru: parseFloat(r["Dự Trữ"]) || 0,
          duong: r["Tuyến Đường"] || null, id_huong: r["ID Hướng"] ? parseInt(r["ID Hướng"]) : null,
          do_cach_tram: r["Cách Trạm"] || null, id_tram: r["ID Trạm"] ? parseInt(r["ID Trạm"]) : null,
          ngay_ps: r["Ngày PS"] || null, ghi_chu: r["Ghi Chú"] || null, ghichu_an: r["Ghi Chú Mật"] || null
        };

        let currentId = r["ID Điểm"], targetId = null;

        if (currentId && !isNaN(currentId)) {
          payload.id_diem = Number(currentId);
          let { error: errUp } = await supabaseClient.from('diem_ha_tang').update(payload).eq('id_diem', payload.id_diem);
          if (errUp) throw new Error(`Lỗi cập nhật ID ${payload.id_diem}`);
          targetId = payload.id_diem;
        } else {
          let { data: newPt, error: errIns } = await supabaseClient.from('diem_ha_tang').insert([payload]).select();
          if (errIns) throw new Error(`Lỗi thêm mới dòng ${i+2}`);
          targetId = newPt[0].id_diem;
        }

        let { error: errLink } = await supabaseClient.from('doan_cap_diem').upsert(
          { id_doan_cap: Number(idDoan), id_diem: targetId, thu_tu: r["STT"] ? parseInt(r["STT"]) : (i+1) },
          { onConflict: 'id_doan_cap, id_diem' }
        );
        if (errLink) throw new Error(`Lỗi link Đoạn Cáp dòng ${i+2}`);

        successCount++; pBar.style.width = Math.round((successCount / rows.length) * 100) + '%';
      }

      stText.innerText = `✅ Hoàn tất! Đã đồng bộ ${successCount} điểm.`;
      showToast(`✅ Import thành công ${successCount} bản ghi!`, "success");
      
      if (typeof ghiNhatKyThaoTac === 'function') ghiNhatKyThaoTac("IMPORT_EXCEL", `Admin Import ${successCount} điểm vào Đoạn ID: ${idDoan}`);
      if (typeof taiDuLieuSupabase === 'function') setTimeout(() => taiDuLieuSupabase(true), 1500);

    } catch (err) {
      stText.innerHTML = `<span style="color: red;">❌ Lỗi: ${err.message}</span>`;
      showToast(err.message, "error");
    }
  };
  reader.readAsArrayBuffer(file);
}
