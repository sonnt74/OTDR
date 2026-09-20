// ==========================================================================
// TỆP AUTH.JS - XÁC THỰC ĐĂNG NHẬP, PHÂN QUYỀN & QUẢN LÝ PHIÊN
// ==========================================================================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    khoiPhucPhiênDangNhap();
  });
} else {
  khoiPhucPhiênDangNhap();
}

function khoiPhucPhiênDangNhap() {
  var savedUser = localStorage.getItem('tnn_user');
  if (savedUser) {
    try {
      var data = JSON.parse(savedUser);
      if (data && data.account) {
        currentUser = {
          isLoggedIn: true,
          account: data.account,
          role: data.role || 'nhan_vien',
          id_dai: data.id_dai || null,
          id_tram: data.id_tram || null,
          idDai: data.id_dai || null,
          idTram: data.id_tram || null,
          can_edit_map: !!data.can_edit_map,
          canEditMap: !!data.can_edit_map
        };

        if (typeof AppStore !== 'undefined' && AppStore.setState) {
          AppStore.setState({ currentUser: currentUser });
        }

        var loginModal = document.getElementById('loginModal');
        if (loginModal) loginModal.style.display = 'none';

        var controlPanel = document.getElementById('control-panel');
        if (controlPanel) controlPanel.style.display = 'block';

        var userInfoDisplay = document.getElementById('userInfoDisplay');
        if (userInfoDisplay) {
          userInfoDisplay.innerText = "👤 " + currentUser.account + " (" + currentUser.role + ")";
        }

        var adminBtn = document.getElementById('adminMobileBtn');
        if (adminBtn) {
          var roleLower = (currentUser.role || '').toLowerCase();
          if (roleLower.includes('admin') || roleLower.includes('sys')) {
            adminBtn.style.display = 'block';
          } else {
            adminBtn.style.display = 'none';
          }
        }

        if (typeof khoiTaoBanDoLeaflet === 'function') {
          khoiTaoBanDoLeaflet();
        }

        if (typeof taiDuLieuSupabase === 'function') {
          taiDuLieuSupabase(false);
        }
      }
    } catch (e) {
      console.error("Lỗi khôi phục phiên đăng nhập:", e);
      localStorage.removeItem('tnn_user');
    }
  }
}

async function handleCustomLogin() {
  var accountInput = document.getElementById('loginAccount');
  var passInput = document.getElementById('loginPass');

  var accountVal = accountInput ? accountInput.value.trim() : '';
  var passVal = passInput ? passInput.value.trim() : '';

  if (!accountVal || !passVal) {
    if (typeof showToast === 'function') {
      showToast("⚠️ Vui lòng nhập đầy đủ tài khoản và mật khẩu!", "error");
    } else {
      alert("⚠️ Vui lòng nhập đầy đủ tài khoản và mật khẩu!");
    }
    return;
  }

  try {
    if (typeof supabaseClient === 'undefined') {
      if (typeof showToast === 'function') {
        showToast("❌ Chưa kết nối được với cơ sở dữ liệu Supabase!", "error");
      } else {
        alert("❌ Chưa kết nối được với cơ sở dữ liệu Supabase!");
      }
      return;
    }

    var { data, error } = await supabaseClient
      .from('tai_khoan')
      .select('*')
      .eq('account', accountVal)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      if (typeof showToast === 'function') {
        showToast("❌ Tài khoản không tồn tại trong hệ thống!", "error");
      } else {
        alert("❌ Tài khoản không tồn tại trong hệ thống!");
      }
      return;
    }

    if (String(data.password || '') !== String(passVal)) {
      if (typeof showToast === 'function') {
        showToast("❌ Mật khẩu không chính xác!", "error");
      } else {
        alert("❌ Mật khẩu không chính xác!");
      }
      return;
    }

    currentUser = {
      isLoggedIn: true,
      account: data.account,
      role: data.role || 'nhan_vien',
      id_dai: data.id_dai || null,
      id_tram: data.id_tram || null,
      idDai: data.id_dai || null,       
      idTram: data.id_tram || null,     
      can_edit_map: !!data.can_edit_map,
      canEditMap: !!data.can_edit_map   
    };

    localStorage.setItem('tnn_user', JSON.stringify(currentUser));
    
    if (typeof AppStore !== 'undefined' && AppStore.setState) {
      AppStore.setState({ currentUser: currentUser });
    }

    var loginModal = document.getElementById('loginModal');
    if (loginModal) loginModal.style.display = 'none';

    var controlPanel = document.getElementById('control-panel');
    if (controlPanel) controlPanel.style.display = 'block';

    var userInfoDisplay = document.getElementById('userInfoDisplay');
    if (userInfoDisplay) {
      userInfoDisplay.innerText = "👤 " + currentUser.account + " (" + currentUser.role + ")";
    }

    var adminBtn = document.getElementById('adminMobileBtn');
    if (adminBtn) {
      var roleLower = (currentUser.role || '').toLowerCase();
      if (roleLower.includes('admin') || roleLower.includes('sys')) {
        adminBtn.style.display = 'block';
      } else {
        adminBtn.style.display = 'none';
      }
    }

    if (typeof khoiTaoBanDoLeaflet === 'function') {
      khoiTaoBanDoLeaflet();
    }

    if (typeof taiDuLieuSupabase === 'function') {
      taiDuLieuSupabase(true);
    }

  } catch (err) {
    if (typeof showToast === 'function') {
      showToast("❌ Lỗi xác thực đăng nhập: " + err.message, "error");
    } else {
      alert("❌ Lỗi xác thực đăng nhập: " + err.message);
    }
  }
}

function handleLoginExit() {
  var accountInput = document.getElementById('loginAccount');
  var passInput = document.getElementById('loginPass');
  if (accountInput) accountInput.value = '';
  if (passInput) passInput.value = '';
  if (typeof showToast === 'function') {
    showToast("Đã làm sạch thông tin đăng nhập.", "info");
  }
}

function togglePasswordVisibility() {
  var passInput = document.getElementById('loginPass');
  if (passInput) {
    if (passInput.type === 'password') {
      passInput.type = 'text';
    } else {
      passInput.type = 'password';
    }
  }
}

function handleLogout() {
  localStorage.removeItem('tnn_user');
  location.reload();
}
