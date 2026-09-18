// ==========================================================================
// TỆP ADMIN.JS - QUẢN TRỊ, ĐỔI MẬT KHẨU & TẢI DỮ LIỆU AN TOÀN
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
          supabaseClient.from('tai_khoan').select('*'),
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
  if (panel && user && user.username && user.username !== 'guest') {
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
    username: 'guest', role: 'nhan_vien', id_dai: null, id_tram: null
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

function renderAllAdminTables() {
  renderMasterAccountTable();
  renderMasterDaiTable();
  renderMasterTramTable();
  renderMasterTuyenTable();
  renderMasterDoanTable();
}

function renderMasterAccountTable() {
  var tbody = document.getElementById('masterAccountTableBody');
  if (!tbody) return;
  var users = getSafeDataList(['rawUserList', 'userList', 'users', 'taiKhoanList']);
  var html = users.map(u => `
    <tr>
      <td><b>${u.username || u.email || 'Tài khoản'}</b></td>
      <td><span style="background:#0ea5e9; color:#fff; padding:2px 6px; border-radius:4px; font-size:11px;">${u.role || 'nhan_vien'}</span></td>
      <td>${u.id_dai || 'Tất cả'}</td>
      <td>${u.id_tram || 'Tất cả'}</td>
      <td>${u.can_edit_map ? '✅ Có' : '❌ Không'}</td>
      <td>
        <button class="btn-small btn-success" onclick="chuanBiFormThemThanhVien('${u.username || u.email}')">✏️ Sửa</button>
        <button class="btn-small" style="background:#ef4444; color:white;" onclick="deleteAdminRecord('tai_khoan', '${u.username || u.email}')">🗑️ Xóa</button>
      </td>
    </tr>
  `).join('');
  tbody.innerHTML = html || '<tr><td colspan="6" style="text-align:center; padding:15px; color:#64748b;">Chưa có dữ liệu tài khoản</td></tr>';
}

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

function renderMasterTramTable() {
  var tbody = document.getElementById('masterTramTableBody');
  if (!tbody) return;
  var list = getSafeDataList(['rawTramList', 'tramList', 'tram_vt']);
  tbody.innerHTML = list.map(item => `
    <tr>
      <td>${item.id_tram || item.id}</td>
      <td><b>${item.ten_tram || item.ten}</b></td>
      <td>${item.id_dai || ''}</td>
      <td><button class="btn-small btn-success" onclick="moFormThemTram(${item.id_tram || item.id})">✏️ Sửa</button></td>
    </tr>
  `).join('') || '<tr><td colspan="4" style="text-align:center; padding:15px; color:#64748b;">Chưa có dữ liệu Trạm</td></tr>';
}

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

function renderMasterDoanTable() {
  var tbody = document.getElementById('masterDoanTableBody');
  if (!tbody) return;
  var list = getSafeDataList(['rawDoanList', 'doanCapList', 'doan_cap']);
  tbody.innerHTML = list.map(item => `
    <tr>
      <td>${item.id_doan_cap || item.id}</td>
      <td>${item.ma_doancap || item.ma_doan || ''}</td>
      <td>${item.id_tuyen || ''}</td>
      <td>${item.id_tram || ''}</td>
      <td><button class="btn-small btn-success" onclick="moFormThemDoan(${item.id_doan_cap || item.id})">✏️ Sửa</button></td>
    </tr>
  `).join('') || '<tr><td colspan="5" style="text-align:center; padding:15px; color:#64748b;">Chưa có dữ liệu Đoạn cáp</td></tr>';
}

// Mở Form Đổi Mật Khẩu
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
  var username = user.username || user.email;
  if (!username) { alert("⚠️ Không tìm thấy thông tin tài khoản!"); return; }

  try {
    if (navigator.onLine && typeof supabaseClient !== 'undefined') {
      var res = await supabaseClient.from('tai_khoan').update({ password: newPass }).eq('email', username);
      if (res.error) {
        var res2 = await supabaseClient.from('tai_khoan').update({ password: newPass }).eq('username', username);
        if (res2.error) throw res2.error;
      }
      alert("✅ Đổi mật khẩu thành công!");
      document.getElementById('changePasswordModal').style.display = 'none';
    } else {
      alert("⚠️ Yêu cầu kết nối mạng để đổi mật khẩu!");
    }
  } catch (err) {
    alert("❌ Lỗi đổi mật khẩu: " + err.message);
  }
}

function chuanBiFormThemThanhVien() { document.getElementById('addMemberModal').style.display = 'flex'; }
function saveAccountAction() {}
function moFormThemDai() { document.getElementById('genericAuxModal').style.display = 'flex'; }
function moFormThemTram() { document.getElementById('genericAuxModal').style.display = 'flex'; }
function moFormThemTuyen() { document.getElementById('genericAuxModal').style.display = 'flex'; }
function moFormThemDoan() { document.getElementById('genericAuxModal').style.display = 'flex'; }
function saveAuxRecord() {}
function deleteAdminRecord() {}
