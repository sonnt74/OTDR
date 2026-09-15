// auth.js - Quản lý tài khoản và đăng nhập
window.onload = function() {
  var savedEmail = localStorage.getItem('tnn_saved_email');
  var savedPass = localStorage.getItem('tnn_saved_pass');
  if (savedEmail && savedPass) {
    document.getElementById('loginEmail').value = savedEmail;
    document.getElementById('loginPass').value = savedPass;
    document.getElementById('chkRememberMe').checked = true;
  }

  var savedSession = localStorage.getItem('tnn_user');
  if (savedSession) {
    currentUser = JSON.parse(savedSession);
    document.getElementById('loginModal').style.display = 'none';
    document.getElementById('sidebar-menu').style.display = 'flex';
    document.getElementById('control-panel').style.display = 'block';
    if (currentUser.role === 'sys_admin' || currentUser.role === 'dai_admin') {
      document.getElementById('adminMenuIcon').style.display = 'flex';
      var adminMob = document.getElementById('adminMobileBtn');
      if (adminMob) adminMob.style.display = 'block';
    }
    khoiTaoBanDoLeaflet();
    taiDuLieuSupabase();
  }
};

function togglePasswordVisibility() {
  var passInput = document.getElementById('loginPass');
  if (passInput.type === 'password') {
    passInput.type = 'text';
  } else {
    passInput.type = 'password';
  }
}

async function handleCustomLogin() {
  var email = document.getElementById('loginEmail').value.trim();
  var pass = document.getElementById('loginPass').value;
  var rememberMe = document.getElementById('chkRememberMe').checked;
  
  if (!email || !pass) { 
    showToast("Vui lòng nhập đầy đủ email và mật khẩu!"); 
    return; 
  }
  
  showLoading("Đang xác thực thông tin...");
  try {
    const { data, error } = await supabaseClient
      .from('tai_khoan')
      .select('*')
      .eq('email', email)
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
      canEditMap: account.can_edit_map === true 
    };
    
    localStorage.setItem('tnn_user', JSON.stringify(currentUser));

    if (rememberMe) {
      localStorage.setItem('tnn_saved_email', email);
      localStorage.setItem('tnn_saved_pass', pass);
    } else {
      localStorage.removeItem('tnn_saved_email');
      localStorage.removeItem('tnn_saved_pass');
    }
    
    document.getElementById('loginModal').style.display = 'none';
    document.getElementById('sidebar-menu').style.display = 'flex';
    document.getElementById('control-panel').style.display = 'block';
    
    if (currentUser.role === 'sys_admin' || currentUser.role === 'dai_admin') {
      document.getElementById('adminMenuIcon').style.display = 'flex';
      var adminMob = document.getElementById('adminMobileBtn');
      if (adminMob) adminMob.style.display = 'block';
    }
    
    khoiTaoBanDoLeaflet();
    await taiDuLieuSupabase();
  } catch (err) { 
    showToast("Lỗi đăng nhập: " + err.message); 
    hideLoading(); 
  }
}

function handleLogout() {
  localStorage.removeItem('tnn_user');
  location.reload();
}
