// ==========================================================================
// TỆP AUTH.JS - QUẢN LÝ XÁC THỰC VÀ ĐĂNG NHẬP (DÙNG DUY NHẤT BẢNG TAI_KHOAN)
// ==========================================================================

window.onload = function() {
  var savedEmail = localStorage.getItem('tnn_saved_email');
  var savedPass = localStorage.getItem('tnn_saved_pass');
  if (savedEmail && savedPass) {
    var emailEl = document.getElementById('loginEmail');
    var passEl = document.getElementById('loginPass');
    var chkEl = document.getElementById('chkRememberMe');
    if (emailEl) emailEl.value = savedEmail;
    if (passEl) passEl.value = savedPass;
    if (chkEl) chkEl.checked = true;
  }

  var savedSession = localStorage.getItem('tnn_user');
  if (savedSession) {
    try {
      currentUser = JSON.parse(savedSession);
      capNhatGiaoDienSauDangNhap();
      if (typeof khoiTaoBanDoLeaflet === 'function') khoiTaoBanDoLeaflet();
      if (typeof taiDuLieuSupabase === 'function') taiDuLieuSupabase();
    } catch (e) {
      console.error("Lỗi khôi phục phiên đăng nhập:", e);
    }
  }
};

function capNhatGiaoDienSauDangNhap() {
  var loginModal = document.getElementById('loginModal');
  if (loginModal) loginModal.style.display = 'none';

  var controlPanel = document.getElementById('control-panel');
  if (controlPanel) controlPanel.style.display = 'block';

  var sidebar = document.getElementById('sidebar-menu');
  if (sidebar) sidebar.style.display = 'flex';

  var adminMenuIcon = document.getElementById('adminMenuIcon');
  if (adminMenuIcon) {
    adminMenuIcon.style.display = (currentUser && currentUser.role === 'sys_admin') ? 'flex' : 'none';
  }

  var adminMob = document.getElementById('adminMobileBtn');
  if (adminMob) {
    var isAuthorized = currentUser && (currentUser.role === 'sys_admin' || currentUser.role === 'dai_admin' || currentUser.role === 'admin_sys');
    adminMob.style.display = isAuthorized ? 'block' : 'none';
  }
}

function togglePasswordVisibility() {
  var passInput = document.getElementById('loginPass');
  if (passInput) {
    passInput.type = (passInput.type === 'password') ? 'text' : 'password';
  }
}

/**
 * ĐĂNG NHẬP CHUẨN HÓA CSDL (CHỈ TRUY VẤN BẢNG TAI_KHOAN)
 */
async function handleCustomLogin() {
  var emailEl = document.getElementById('loginEmail');
  var passEl = document.getElementById('loginPass');
  var chkEl = document.getElementById('chkRememberMe');
  
  var email = emailEl ? emailEl.value.trim() : '';
  var pass = passEl ? passEl.value : '';
  var rememberMe = chkEl ? chkEl.checked : false;
  
  if (!email || !pass) { 
    showToast("Vui lòng nhập đầy đủ tài khoản và mật khẩu!", "error"); 
    return; 
  }
  
  showLoading("Đang xác thực thông tin...");
  try {
    if (navigator.onLine) {
      // Chỉ truy vấn duy nhất bảng 'tai_khoan'
      const { data, error } = await supabaseClient
        .from('tai_khoan')
        .select('*')
        .or(`email.eq.${email},username.eq.${email}`)
        .eq('password', pass)
        .limit(1);

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Sai thông tin tài khoản hoặc mật khẩu!");
      }

      var account = data[0];
      currentUser = { 
        isLoggedIn: true, 
        role: account.role || 'member', 
        idDai: account.id_dai, 
        idTram: account.id_tram, 
        canEditMap: account.can_edit_map === true,
        email: account.email || account.username
      };

      // Đồng bộ thông tin vào IndexedDB
      if (typeof idbLuuTaiKhoan === 'function') {
        await idbLuuTaiKhoan({
          email: account.email || account.username,
          password: account.password,
          role: account.role || 'member',
          id_dai: account.id_dai,
          id_tram: account.id_tram,
          can_edit_map: account.can_edit_map === true
        });
      }

      showToast("Đăng nhập thành công (Online)!", "success");
    } else {
      if (typeof idbDocTaiKhoan !== 'function') throw new Error("Chưa khởi tạo bộ nhớ đệm Offline!");

      const localAcc = await idbDocTaiKhoan(email);
      if (!localAcc || localAcc.password !== pass) throw new Error("Tài khoản hoặc mật khẩu không đúng (Offline)!");

      currentUser = { 
        isLoggedIn: true, 
        role: localAcc.role || 'member', 
        idDai: localAcc.id_dai, 
        idTram: localAcc.id_tram, 
        canEditMap: localAcc.can_edit_map === true,
        email: localAcc.email
      };

      showToast("⚡ Đã đăng nhập thành công ở Chế độ Offline!", "info");
    }
    
    localStorage.setItem('tnn_user', JSON.stringify(currentUser));

    if (rememberMe) {
      localStorage.setItem('tnn_saved_email', email);
      localStorage.setItem('tnn_saved_pass', pass);
    } else {
      localStorage.removeItem('tnn_saved_email');
      localStorage.removeItem('tnn_saved_pass');
    }
    
    capNhatGiaoDienSauDangNhap();
    if (typeof khoiTaoBanDoLeaflet === 'function') khoiTaoBanDoLeaflet();
    if (typeof taiDuLieuSupabase === 'function') await taiDuLieuSupabase();
  } catch (err) { 
    showToast("Lỗi đăng nhập: " + err.message, "error"); 
  } finally {
    hideLoading();
  }
}

function handleLogout() {
  localStorage.removeItem('tnn_user');
  location.reload();
}
