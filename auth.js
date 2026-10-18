// ==========================================================================
// TỆP AUTH.JS - XÁC THỰC ĐĂNG NHẬP, PHÂN QUYỀN & QUẢN LÝ PHIÊN (CHUẨN OK8)
// ==========================================================================

document.addEventListener('DOMContentLoaded', function() {
  khoiPhucPhiênDangNhap();
});

async function khoiPhucPhiênDangNhap() {
  var savedUser = localStorage.getItem('tnn_user');
  if (savedUser) {
    try {
      var data = JSON.parse(savedUser);
      if (data && data.account) {
        window.currentUser = {
          isLoggedIn: true,
          account: data.account,
          role: data.role || 'nhan_vien',
          id_dai: data.id_dai || null,
          id_tram: data.id_tram || null,
          idDai: data.id_dai || null,
          idTram: data.id_tram || null,
          can_edit_map: !!data.can_edit_map,
          canEditMap: !!data.can_edit_map,  
          xem_ghichu_an: data.xem_ghichu_an
        };

        if (typeof AppStore !== 'undefined' && AppStore.setState) {
          AppStore.setState({ currentUser: window.currentUser });
        }

        var loginModal = document.getElementById('loginModal');
        if (loginModal) loginModal.style.display = 'none';

        var controlPanel = document.getElementById('control-panel');
        if (controlPanel) controlPanel.style.display = 'block';

        var userInfoDisplay = document.getElementById('userInfoDisplay');
        if (userInfoDisplay) {
          userInfoDisplay.innerText = "👤 " + window.currentUser.account + " (" + window.currentUser.role + ")";
        }

        var adminBtn = document.getElementById('adminMobileBtn');
        if (adminBtn) {
          var roleLower = (window.currentUser.role || '').toLowerCase();
          if (roleLower.includes('admin') || roleLower.includes('sys')) {
            adminBtn.style.display = 'block';
          } else {
            adminBtn.style.display = 'none';
          }
        }

        if (typeof khoiTaoBanDoLeaflet === 'function') {
          khoiTaoBanDoLeaflet();
        }

        if (typeof taiDuLieuLocal === 'function') {
          await taiDuLieuLocal();
        }

        var selectTuyen = document.getElementById('selectTuyen');
        var initTuyenVal = selectTuyen ? (String(selectTuyen.value).trim() || 'ALL') : 'ALL';
        if (typeof taiDiemTheoTuyen === 'function') {
            await taiDiemTheoTuyen(initTuyenVal, false);
        }
      }
    } catch (e) {
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
    showToast("⚠️ Vui lòng nhập đầy đủ tài khoản và mật khẩu!", "error");
    return;
  }

  try {
    showLoading("Đang xác thực...");
    var data = null;

    if (typeof supabaseClient === 'undefined') {
      throw new Error("Chưa kết nối được với cơ sở dữ liệu Supabase!");
    }

    try {
      // 1. Thử gọi trực tiếp từ Supabase
      var res = await supabaseClient
        .from('tai_khoan')
        .select('*')
        .eq('account', accountVal)
        .maybeSingle();

      if (res.error) throw res.error;
      data = res.data;
    } catch (netErr) {
      // 2. Nếu gặp lỗi kết nối (Failed to fetch) hoặc mất mạng -> Tự động fallback đọc từ cache local
      if (!navigator.onLine || netErr.message.includes('fetch') || netErr.message.includes('network') || netErr.message.includes('Failed')) {
        console.warn("Mất kết nối mạng, chuyển sang xác thực offline từ bộ nhớ đệm...");
        var cachedUsers = (typeof getSafeDataList === 'function') ? getSafeDataList(['rawUserList', 'userList', 'users', 'taiKhoanList']) : (window.rawUserList || []);
        data = cachedUsers.find(u => String(u.account).trim() === accountVal);
      } else {
        throw netErr;
      }
    }

    if (!data) {
      hideLoading();
      showToast("❌ Tài khoản không tồn tại trong hệ thống (hoặc mất kết nối mạng)!", "error");
      return;
    }

    if (String(data.password || '') !== String(passVal)) {
      hideLoading();
      showToast("❌ Mật khẩu không chính xác!", "error");
      return;
    }

    window.currentUser = {
      isLoggedIn: true,
      account: data.account,
      role: data.role || 'nhan_vien',
      id_dai: data.id_dai || null,
      id_tram: data.id_tram || null,
      idDai: data.id_dai || null,       
      idTram: data.id_tram || null,     
      can_edit_map: !!data.can_edit_map,
      canEditMap: !!data.can_edit_map,  
      xem_ghichu_an: data.xem_ghichu_an   
    };

    localStorage.setItem('tnn_user', JSON.stringify(window.currentUser));
    
    if (typeof AppStore !== 'undefined' && AppStore.setState) {
      AppStore.setState({ currentUser: window.currentUser });
    }

    var loginModal = document.getElementById('loginModal');
    if (loginModal) loginModal.style.display = 'none';

    var controlPanel = document.getElementById('control-panel');
    if (controlPanel) controlPanel.style.display = 'block';

    var userInfoDisplay = document.getElementById('userInfoDisplay');
    if (userInfoDisplay) {
      userInfoDisplay.innerText = "👤 " + window.currentUser.account + " (" + window.currentUser.role + ")";
    }

    var adminBtn = document.getElementById('adminMobileBtn');
    if (adminBtn) {
      var roleLower = (window.currentUser.role || '').toLowerCase();
      if (roleLower.includes('admin') || roleLower.includes('sys')) {
        adminBtn.style.display = 'block';
      } else {
        adminBtn.style.display = 'none';
      }
    }

    hideLoading();
    showToast("✅ Đăng nhập thành công!", "success");

    if (typeof khoiTaoBanDoLeaflet === 'function') khoiTaoBanDoLeaflet();
    if (typeof taiDuLieuSupabase === 'function') taiDuLieuSupabase(true);

  } catch (err) {
    hideLoading();
    showToast("❌ Lỗi xác thực đăng nhập: " + err.message, "error");
  }
}

// Chỉnh nút Thoát form đăng nhập thành đóng trang web / tab
function handleLoginExit() {
  try {
    window.close();
  } catch (e) {
    // Trường hợp trình duyệt chặn lệnh đóng tab trực tiếp, điều hướng về trang trắng
    window.location.href = 'about:blank';
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
