// ==========================================================================
// TỆP ADMIN.JS - QUẢN TRỊ, ĐỔI MẬT KHẨU (HIỂN THỊ TÊN & DÙNG TOAST)
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
        window.rawUserList = uRes.data || window.rawUserList || [];
        window.rawDaiList = dRes.data || window.rawDaiList || [];
        window.rawTramList = tRes.data || window.rawTramList || [];
        window.rawTuyenList = tuRes.data || window.rawTuyenList || [];
        window.rawDoanCapList = doRes.data || window.rawDoanCapList || [];
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
    if (state[k] && state[k].length > 0) return state[k];
    if (window[k] && window[k].length > 0) return window[k];
  }
  if (keyNames.includes('rawUserList') && window.rawUserList) return window.rawUserList;
  if (keyNames.includes('rawDaiList') && window.rawDaiList) return window.rawDaiList;
  if (keyNames.includes('rawTramList') && window.rawTramList) return window.rawTramList;
  if (keyNames.includes('rawTuyenList') && window.rawTuyenList) return window.rawTuyenList;
  if (keyNames.includes('rawDoanList') && window.rawDoanCapList) return window.rawDoanCapList;
  return [];
}

// Các hàm hỗ trợ tra cứu tên từ ID để hiển thị trực quan thay vì chỉ hiện số ID
function getDaiName(idDai) {
  if (!idDai) return 'Tất cả';
  var list = getSafeDataList(['rawDaiList', 'daiList', 'dai_vt']);
  var found = list.find(d => String(d.id_dai || d.id) === String(idDai));
  return found ? (found.ten_dai || found.ten) : `Đài ID: ${idDai}`;
}

function getTramName(idTram) {
  if (!idTram) return 'Tất cả';
  var list = getSafeDataList(['rawTramList', 'tramList', 'tram_vt']);
  var found = list.find(t => String(t.id_tram || t.id) === String(idTram));
  return found ? (found.ten_tram || found.ten) : `Trạm ID: ${idTram}`;
}

function getTuyenName(idTuyen) {
  if (!idTuyen) return 'Tất cả';
  var list = getSafeDataList(['rawTuyenList', 'tuyenList', 'tuyen_cap']);
  var found = list.find(t => String(t.id_tuyen_cap || t.id_tuyen || t.id) === String(idTuyen));
  return found ? (found.ten_tuyen || found.ten || found.ma_tuyencap) : `Tuyến ID: ${idTuyen}`;
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
  var users = getSafeDataList(['rawUserList', 'userList', 'users', 'taiKhoanList']);
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
  tbody.innerHTML = html || '<tr><td colspan="6" style="text-align:center; padding:15px; color:#64748b;">Chưa có dữ liệu tài khoản</td></tr>';
}

/** 2. BẢNG ĐÀI VIỄN THÔNG */
function renderMasterDaiTable() {
  var tbody = document.getElementById('masterDaiTableBody');
  if (!tbody) return;
  var list = getSafeDataList(['rawDaiList', 'daiList', 'dai_vt']);
  tbody.innerHTML = list.map(item => `
    <tr>
      <td>${item.id_dai || item.id}</td>
      <td><b>${item.ten_dai || item.ten}</b></td>
      <td><button class="btn-small btn-success" onclick="moFormThemDai(${item.id_dai || item.id})">✏️ Sửa</button></td>
    </tr>
  `).join('') || '<tr><td colspan="3" style="text-align:center; padding:15px; color:#64748b;">Chưa có dữ liệu Đài</td></tr>';
}

/** 3. BẢNG TRẠM VIỄN THÔNG (HIỂN THỊ TÊN ĐÀI THAY VÌ ID) */
function renderMasterTramTable() {
  var tbody = document.getElementById('masterTramTableBody');
  if (!tbody) return;
  var list = getSafeDataList(['rawTramList', 'tramList', 'tram_vt']);
  tbody.innerHTML = list.map(item => {
    var tenDai = item.ten_dai || getDaiName(item.id_dai);
    return `
      <tr>
        <td>${item.id_tram || item.id}</td>
        <td><b>${item.ten_tram || item.ten}</b></td>
        <td>🏢 ${tenDai}</td>
        <td><button class="btn-small btn-success" onclick="moFormThemTram(${item.id_tram || item.id})">✏️ Sửa</button></td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="4" style="text-align:center; padding:15px; color:#64748b;">Chưa có dữ liệu Trạm</td></tr>';
}

/** 4. BẢNG TUYẾN CÁP */
function renderMasterTuyenTable() {
  var tbody = document.getElementById('masterTuyenTableBody');
  if (!tbody) return;
  var list = getSafeDataList(['rawTuyenList', 'tuyenList', 'tuyen_cap']);
  tbody.innerHTML = list.map(item => `
    <tr>
      <td>${item.id_tuyen_cap || item.id}</td>
      <td>${item.ma_tuyencap || item.ma_tuyen || ''}</td>
      <td><b>${item.ten_tuyen || item.ten}</b></td>
      <td><button class="btn-small btn-success" onclick="moFormThemTuyen(${item.id_tuyen_cap || item.id})">✏️ Sửa</button></td>
    </tr>
  `).join('') || '<tr><td colspan="4" style="text-align:center; padding:15px; color:#64748b;">Chưa có dữ liệu Tuyến cáp</td></tr>';
}

/** 5. BẢNG ĐOẠN TUYẾN CÁP (HIỂN THỊ TÊN TUYẾN VÀ TÊN TRẠM THAY VÌ ID) */
function renderMasterDoanTable() {
  var tbody = document.getElementById('masterDoanTableBody');
  if (!tbody) return;
  var list = getSafeDataList(['rawDoanList', 'doanCapList', 'doan_cap']);
  tbody.innerHTML = list.map(item => {
    var tenTuyen = item.ten_tuyen || getTuyenName(item.id_tuyen);
    var tenTram = item.ten_tram || getTramName(item.id_tram);
    return `
      <tr>
        <td>${item.id_doan_cap || item.id}</td>
        <td><b>${item.ma_doancap || item.ma_doan || ''}</b></td>
        <td>🛤️ ${tenTuyen}</td>
        <td>📡 ${tenTram}</td>
        <td><button class="btn-small btn-success" onclick="moFormThemDoan(${item.id_doan_cap || item.id})">✏️ Sửa</button></td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="5" style="text-align:center; padding:15px; color:#64748b;">Chưa có dữ liệu Đoạn cáp</td></tr>';
}

/** LƯU TÀI KHOẢN */
async function saveAccountAction() {
  var accountInput = document.getElementById('newMemberAccount') || document.getElementById('loginAccount');
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

function chuanBiFormThemThanhVien(accToEdit) {
  var accountInput = document.getElementById('newMemberAccount') || document.getElementById('loginAccount');
  if (accToEdit && accountInput) {
    accountInput.value = accToEdit;
  } else if (accountInput) {
    accountInput.value = '';
  }
  document.getElementById('addMemberModal').style.display = 'flex';
}

function moFormThemDai() { document.getElementById('genericAuxModal').style.display = 'flex'; }
function moFormThemTram() { document.getElementById('genericAuxModal').style.display = 'flex'; }
function moFormThemTuyen() { document.getElementById('genericAuxModal').style.display = 'flex'; }
function moFormThemDoan() { document.getElementById('genericAuxModal').style.display = 'flex'; }
function saveAuxRecord() {}
function deleteAdminRecord(tableName, idItem) {
  if (tableName === 'tai_khoan') {
    console.log("Xóa tài khoản có account:", idItem);
  }
}
```[cite: 9]

---

### 📋 Hướng dẫn triển khai:
1. Sao chép toàn bộ đoạn mã trên và dán đè vào tệp **`admin.js`**[cite: 9].
2. Nhấn tổ hợp phím **`Ctrl + F5`** (Hard Reload) trên trình duyệt để tải lại ứng dụng.
3. Mở bảng quản trị: các bảng Đài VT, Trạm VT, Tuyến cáp và Đoạn tuyến cáp sẽ tự động tra cứu và hiển thị tên đầy đủ, rõ ràng thay vì các con số ID đơn thuần.
