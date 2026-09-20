// ==========================================================================
// TỆP AUTH.JS - XÁC THỰC ĐĂNG NHẬP, PHÂN QUYỀN & LƯU PHIÊN (HOÀN CHỈNH)
// ==========================================================================

// Tự động khôi phục phiên đăng nhập khi tải lại trang
document.addEventListener('DOMContentLoaded', function() {
  khoiPhucPhiênDangNhap();
});

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
    alert("⚠️ Vui lòng nhập đầy đủ tài khoản và mật khẩu!");
    return;
  }

  try {
    if (typeof supabaseClient === 'undefined') {
      alert("❌ Chưa kết nối được với cơ sở dữ liệu Supabase!");
      return;
    }

    // Truy vấn bảng tai_khoan sử dụng duy nhất trường account[cite: 8]
    var { data, error } = await supabaseClient
      .from('tai_khoan')
      .select('*')
      .eq('account', accountVal)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      alert("❌ Tài khoản không tồn tại trong hệ thống!");
      return;
    }

    if (String(data.password || '') !== String(passVal)) {
      alert("❌ Mật khẩu không chính xác!");
      return;
    }

    // Cập nhật biến toàn cục currentUser[cite: 7, 8]
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

    // Hiển thị nút quản trị linh hoạt theo mọi biến thể quyền[cite: 4]
    var adminBtn = document.getElementById('adminMobileBtn');
    if (adminBtn) {
      var roleLower = (currentUser.role || '').toLowerCase();
      if (roleLower.includes('admin') || roleLower.includes('sys')) {
        adminBtn.style.display = 'block';
      } else {
        adminBtn.style.display = 'none';
      }
    }

    // Đã loại bỏ thông báo đăng nhập thành công theo yêu cầu

    // Khởi tạo bản đồ Leaflet[cite: 3]
    if (typeof khoiTaoBanDoLeaflet === 'function') {
      khoiTaoBanDoLeaflet();
    }

    // Nạp dữ liệu hệ thống và vẽ tuyến cáp[cite: 6]
    if (typeof taiDuLieuSupabase === 'function') {
      taiDuLieuSupabase(true);
    }

  } catch (err) {
    alert("❌ Lỗi xác thực đăng nhập: " + err.message);
  }
}

function togglePasswordVisibility() {
  var passInput = document.getElementById('loginPass');
  if (passInput) {
    if (passInput.style.webkitTextSecurity === 'none') {
      passInput.style.webkitTextSecurity = 'disc';
    } else {
      passInput.style.webkitTextSecurity = 'none';
    }
  }
}

function handleLogout() {
  localStorage.removeItem('tnn_user');
  location.reload();
}
