// ==========================================================================
// TỆP ADMIN.JS - QUẢN TRỊ 5 TAB, BẢO MẬT 2 LỚP & SỬA LỖI DATABASE CONSTRAINT
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

function getRoleAccess() {
  var user = getCurrentUser();
  var r = (user.role || '').toLowerCase().trim();
  
  var isSys = r.includes('sys') || r === 'admin_sys';
  var isDai = r.includes('dai') || r === 'admin_dai';
  var isTram = r.includes('tram') || r === 'admin_tram';
  // Hỗ trợ cả hai tên gọi 'nhan_vien' và 'member' là cấp bậc nhân viên trạm
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

// Lọc danh sách tài khoản theo phân quyền nghiêm ngặt
function getFilteredUsers() {
  // Lấy dữ liệu thô từ Store hoặc biến toàn cục
  var users = getSafeDataList(['rawUserList', 'userList', 'users', 'taiKhoanList']);
  var access = getRoleAccess();

  // 1. Admin hệ thống thấy tất cả
  if (access.isSys) {
    return users;
  }

  // 2. Admin đài thấy user trong đài hoặc các trạm thuộc đài đó
  if (access.isDai) {
    var tramIdsInDai = getFilteredTramList().map(t => String(t.id_tram || t.id));
    return users.filter(u => String(u.id_dai) === access.idDai || tramIdsInDai.includes(String(u.id_tram)));
  }

  // 3. Admin trạm chỉ thấy user thuộc đúng trạm của mình
  if (access.isTram) {
    return users.filter(u => String(u.id_tram) === access.idTram);
  }

  // 4. Nhân viên (member hoặc nhan_vien): Chỉ được phép thấy chính mình hoặc đồng nghiệp cùng trạm
  if (access.isMember) {
    return users.filter(u => {
      // Nếu có chung id_tram và id_tram không trống thì cho thấy, hoặc ít nhất phải là chính account đó
      if (access.idTram && u.id_tram && String(u.id_tram) === String(access.idTram)) {
        return true;
      }
      return u.account === access.account;
    });
  }

  // Mặc định an toàn tuyệt đối: trả về mảng rỗng nếu không khớp quyền nào
  return [];
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
// BỘ LỌC PHÂN QUYỀN
// ==========================================================================
// 1. Lọc danh sách Tài khoản theo phân cấp
function getFilteredUsers() {
  var users = getSafeDataList(['rawUserList', 'userList', 'users', 'taiKhoanList']);
  var access = getRoleAccess();

  if (access.isSys) return users;
  if (access.isDai) {
    // Admin đài thấy user thuộc đài mình hoặc thuộc các trạm nằm trong đài mình
    var tramIdsInDai = getFilteredTramList().map(t => String(t.id_tram || t.id));
    return users.filter(u => String(u.id_dai) === access.idDai || tramIdsInDai.includes(String(u.id_tram)));
  }
  if (access.isTram) {
    return users.filter(u => String(u.id_tram) === access.idTram);
  }
  return users.filter(u => u.account === access.account);
}

// 2. Lọc danh sách Đài theo phân cấp
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

// 3. Lọc danh sách Trạm theo phân cấp
function getFilteredTramList() {
  var tramList = getSafeDataList(['rawTramList', 'tramList', 'tram_vt']);
  var access = getRoleAccess();

  if (access.isSys) return tramList;
  if (access.isDai) return tramList.filter(t => String(t.id_dai || t.dai_id) === access.idDai);
  if (access.isTram) return tramList.filter(t => String(t.id_tram || t.id) === access.idTram);
  return tramList;
}

// 4. Lọc danh sách Tuyến cáp theo phân cấp (Admin đài/trạm chỉ thấy tuyến qua đoạn tuyến thuộc quản lý)
function getFilteredTuyenList() {
  var tuyenList = getSafeDataList(['rawTuyenList', 'tuyenList', 'tuyen_cap']);
  var access = getRoleAccess();

  if (access.isSys) return tuyenList;
  
  var validDoanList = getFilteredDoanList();
  var validTuyenIds = validDoanList.map(d => String(d.id_tuyen || d.tuyen_id || d.id_tuyen_cap));
  
  return tuyenList.filter(t => validTuyenIds.includes(String(t.id_tuyen_cap || t.id_tuyen || t.id)));
}

// 5. Lọc danh sách Đoạn tuyến theo phân cấp
function getFilteredTramList() {
  var tramList = getSafeDataList(['rawTramList', 'tramList', 'tram_vt']);
  var access = getRoleAccess();

  if (access.isSys) return tramList;
  if (access.isDai) return tramList.filter(t => String(t.id_dai || t.dai_id) === access.idDai);
  if (access.isTram || access.isMember) {
    // Nhân viên chỉ thấy trạm của chính mình
    return tramList.filter(t => String(t.id_tram || t.id) === access.idTram);
  }
  return [];
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

/** 1. RENDER BẢNG TÀI KHOẢN (Cho phép admin_tram quản lý user trong trạm) */
function renderMasterAccountTable() {
  var tbody = document.getElementById('masterAccountTableBody');
  if (!tbody) return;
  var access = getRoleAccess();
  var users = getFilteredUsers();
  
  var addBtn = document.querySelector('#tab-accounts button.btn-success');
  if (addBtn) {
    // Nhân viên không được thấy nút thêm tài khoản
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

/** HÀM LƯU TÀI KHOẢN (THÊM HOẶC CẬP NHẬT) */
// ==========================================================================
// HÀM LƯU TÀI KHOẢN (THÊM / SỬA) CHUẨN XÁC VỚI KHÓA CHÍNH ACCOUNT
// ==========================================================================
async function saveAccountAction() {
  var accountInput = document.getElementById('newMemberAccount');
  var accVal = accountInput ? accountInput.value.trim() : '';
  var password = document.getElementById('newMemberPass').value.trim();
  var access = getRoleAccess();
  
  if (!accVal) { 
    if (typeof showToast === 'function') showToast("⚠️ Vui lòng nhập tên tài khoản!", "error");
    return; 
  }

  var users = getSafeDataList(['rawUserList', 'userList', 'users', 'taiKhoanList']);
  var existingUser = users.find(u => u.account === accVal);
  var isEditing = accountInput.readOnly;

  // Kiểm tra chống trùng lặp khi tạo mới
  if (!isEditing && existingUser) {
    if (typeof showToast === 'function') showToast(`❌ Tên tài khoản "${accVal}" đã tồn tại! Vui lòng chọn tên khác.`, "error");
    return;
  }

  let actionTitle = isEditing ? `Cập nhật thông tin tài khoản <b>${accVal}</b>` : `Thêm mới tài khoản <b>${accVal}</b>`;
  let isConfirmed = await showConfirmDialog(`Bạn có chắc chắn muốn ${actionTitle} không?`, 'success');
  if (!isConfirmed) return;

  var selectedRole = document.getElementById('newMemberRole').value;
  var selectedDai = document.getElementById('newMemberDai').value;
  var selectedTram = document.getElementById('newMemberTram').value;

  var payload = {
    account: accVal,
    role: selectedRole,
    can_edit_map: document.getElementById('newMemberCanEdit').checked,
    id_dai: (access.isDai && !access.isSys) ? Number(access.idDai) : (selectedDai ? Number(selectedDai) : null),
    id_tram: (access.isTram && !access.isSys && !access.isDai) ? Number(access.idTram) : (selectedTram ? Number(selectedTram) : null)
  };

  // Giữ nguyên mật khẩu cũ nếu không nhập mật khẩu mới khi sửa
  if (password) {
    payload.password = password;
  } else if (existingUser && existingUser.password) {
    payload.password = existingUser.password;
  }

  try {
    showLoading("Đang lưu tài khoản...");
    
    // Sử dụng upsert: vì account đã là Khóa chính, nếu trùng account nó sẽ tự động Sửa, nếu chưa có sẽ tự động Thêm
    var { data, error } = await supabaseClient.from('tai_khoan').upsert([payload]).select();
    if (error) throw error;
    
    if (data && data.length > 0) {
      var idx = users.findIndex(u => u.account === accVal);
      if (idx >= 0) users[idx] = data[0]; else users.push(data[0]);
      window.rawUserList = users;
      AppStore.setState({ rawUserList: users });
    }

    if (typeof showToast === 'function') showToast("✅ Lưu tài khoản thành công!", "success");
    document.getElementById('addMemberModal').style.display = 'none';
    renderAllAdminTables();
    hideLoading();
  } catch (err) { 
    hideLoading();
    if (typeof showToast === 'function') showToast("❌ Lỗi không ghi được tài khoản: " + err.message, "error");
  }
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
// CÁC FORM THÊM/SỬA (ĐÃ BỔ SUNG CỘT TÊN ĐOẠN CÁP TRÁNH LỖI NOT-NULL)
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

  var daiList = getFilteredDaiList();
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

  var tramList = getFilteredTramList();
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

  if (accToEdit && accountInput) {
    accountInput.value = accToEdit; 
    accountInput.readOnly = true; 
    accountInput.style.backgroundColor = "#e2e8f0";
    if (passInput) passInput.value = '';

    var users = getSafeDataList(['rawUserList', 'userList', 'users', 'taiKhoanList']);
    var uObj = users.find(u => u.account === accToEdit);
    
    if (uObj) {
      if (tenAccountInput) tenAccountInput.value = uObj.ten_account || '';
      if (soDtInput) soDtInput.value = uObj.so_dt || '';
      if (roleSelect) roleSelect.value = uObj.role || 'nhan_vien';
      if (canEditCheck) canEditCheck.checked = !!uObj.can_edit_map;
      if (daiSelect) daiSelect.value = uObj.id_dai || (access.isDai ? access.idDai : '');
      if (tramSelect) tramSelect.value = uObj.id_tram || (access.isTram ? access.idTram : '');
    }
  } else {
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

  // SỬA LỖI: Bổ sung trường nhập Tên Đoạn Cáp
  document.getElementById('auxFormFields').innerHTML = `
    <div class="form-group"><label>Mã đoạn cáp:</label><input type="text" id="auxMaDoan" value="${item.ma_doancap || item.ma_doan || ''}" placeholder="VD: D01"></div>
    <div class="form-group"><label>Tên đoạn cáp:</label><input type="text" id="auxTenDoan" value="${item.ten_doan_cap || item.ten_doancap || item.ten || ''}" placeholder="VD: Đoạn từ TNN - Cột 1"></div>
    <div class="form-group"><label>Thuộc Tuyến:</label><select id="auxIdTuyen"><option value="">-- Chọn Tuyến --</option>${tuyenOptions}</select></div>
    <div class="form-group"><label>Thuộc Trạm:</label><select id="auxIdTram"><option value="">-- Chọn Trạm --</option>${tramOptions}</select></div>
  `;
  document.getElementById('genericAuxModal').style.display = 'flex';
}

// ==========================================================================
// CÁC HÀM GHI/XÓA CÓ XÁC THỰC 2 LỚP BẰNG CUSTOM CONFIRM DIALOG
// ==========================================================================
async function saveAccountAction() {
  var accountInput = document.getElementById('newMemberAccount');
  var accVal = accountInput ? accountInput.value.trim() : '';
  var tenAccVal = document.getElementById('newMemberTenAccount').value.trim();
  var soDtVal = document.getElementById('newMemberSoDT').value.trim();
  var password = document.getElementById('newMemberPass').value.trim();
  var access = getRoleAccess();
  
  if (!accVal) { 
    if (typeof showToast === 'function') showToast("⚠️ Vui lòng nhập tên tài khoản!", "error");
    return; 
  }

  var users = getSafeDataList(['rawUserList', 'userList', 'users', 'taiKhoanList']);
  var existingUser = users.find(u => u.account === accVal);
  var isEditing = accountInput.readOnly;

  if (!isEditing && existingUser) {
    if (typeof showToast === 'function') showToast(`❌ Tên tài khoản "${accVal}" đã tồn tại! Vui lòng chọn tên khác.`, "error");
    return;
  }

  let actionTitle = isEditing ? `Cập nhật thông tin tài khoản <b>${accVal}</b>` : `Thêm mới tài khoản <b>${accVal}</b>`;
  let isConfirmed = await showConfirmDialog(`Bạn có chắc chắn muốn ${actionTitle} không?`, 'success');
  if (!isConfirmed) return;

  var selectedRole = document.getElementById('newMemberRole').value;
  var selectedDai = document.getElementById('newMemberDai').value;
  var selectedTram = document.getElementById('newMemberTram').value;

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
      AppStore.setState({ rawUserList: users });
    }

    if (typeof showToast === 'function') showToast("✅ Lưu tài khoản thành công!", "success");
    document.getElementById('addMemberModal').style.display = 'none';
    renderAllAdminTables();
    hideLoading();
  } catch (err) { 
    hideLoading();
    if (typeof showToast === 'function') showToast("❌ Lỗi không ghi được tài khoản: " + err.message, "error");
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
    // SỬA LỖI: Thu thập tên đoạn cáp để gửi lên Database
    pkCol = 'id_doan_cap';
    payload.ma_doancap = document.getElementById('auxMaDoan').value.trim();
    payload.ten_doan_cap = document.getElementById('auxTenDoan').value.trim();
    payload.id_tuyen = document.getElementById('auxIdTuyen').value ? Number(document.getElementById('auxIdTuyen').value) : null;
    payload.id_tram = document.getElementById('auxIdTram').value ? Number(document.getElementById('auxIdTram').value) : null;
    itemName = payload.ten_doan_cap;
    if (!payload.ma_doancap || !payload.ten_doan_cap) { showToast("⚠️ Vui lòng nhập đủ mã và tên đoạn cáp!", "error"); return; }
  }

  if (recordId && recordId !== '') { payload[pkCol] = Number(recordId); }

  // XÁC THỰC 2 LỚP TRƯỚC KHI GHI
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
  // XÁC THỰC 2 LỚP TRƯỚC KHI XÓA (Cảnh báo màu đỏ)
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
// HÀM CUNG CẤP DỮ LIỆU ĐÃ LỌC CHUẨN XÁC CHO BẢNG ĐIỀU KHIỂN VÀ BẢN ĐỒ
// ==========================================================================
function getAuthorizedDataForMap() {
  var access = getRoleAccess();
  
  // Lấy dữ liệu đã được lọc chặt chẽ theo phân quyền cấp bậc
  var authorizedTramList = getFilteredTramList();
  var authorizedDoanList = getFilteredDoanList();
  var authorizedTuyenList = getFilteredTuyenList();

  console.log("🗺️ [Phân quyền Bản đồ] Cấp bậc:", access.isSys ? "SYS" : access.isDai ? "ĐẠI" : access.isTram ? "TRẠM" : "NHÂN VIÊN", 
              "| Số trạm được xem:", authorizedTramList.length, 
              "| Số đoạn tuyến được xem:", authorizedDoanList.length);

  return {
    trams: authorizedTramList,
    doans: authorizedDoanList,
    tuyens: authorizedTuyenList
  };
}
