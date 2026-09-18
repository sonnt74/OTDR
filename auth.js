// ==========================================================================
// TỆP AUTH.JS - XÁC THỰC ĐĂNG NHẬP & PHÂN QUYỀN (SỬ DỤNG TRƯỜNG ACCOUNT)
// ==========================================================================

async function handleCustomLogin() {
  // Lấy giá trị từ ô input tài khoản (hỗ trợ cả id loginAccount và loginEmail)
  var accountInput = document.getElementById('loginAccount') || document.getElementById('loginEmail');
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

    // Truy vấn bảng tai_khoan dựa trên trường account
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

    // Kiểm tra mật khẩu
    if (String(data.password || '') !== String(passVal)) {
      alert("❌ Mật khẩu không chính xác!");
      return;
    }

    // Lưu thông tin người dùng vào LocalStorage và Store hệ thống
    var currentUser = {
      account: data.account,
      role: data.role || 'nhan_vien',
      id_dai: data.id_dai || null,
      id_tram: data.id_tram || null,
      can_edit_map: !!data.can_edit_map
    };

    localStorage.setItem('tnn_user', JSON.stringify(currentUser));
    
    if (typeof AppStore !== 'undefined' && AppStore.setState) {
      AppStore.setState({ currentUser: currentUser });
    }

    // Ẩn modal đăng nhập và hiển thị bảng điều khiển
    var loginModal = document.getElementById('loginModal');
    if (loginModal) loginModal.style.display = 'none';

    var controlPanel = document.getElementById('control-panel');
    if (controlPanel) controlPanel.style.display = 'block';

    // Hiển thị thông tin tên tài khoản lên thanh điều khiển nếu có ô hiển thị
    var userInfoDisplay = document.getElementById('userInfoDisplay');
    if (userInfoDisplay) {
      userInfoDisplay.innerText = "👤 " + currentUser.account + " (" + currentUser.role + ")";
    }

    // Hiển thị nút quản trị nếu có quyền admin
    var adminBtn = document.getElementById('adminMobileBtn');
    if (adminBtn) {
      if (currentUser.role === 'admin_sys' || currentUser.role === 'admin_dai' || currentUser.role === 'admin_tram') {
        adminBtn.style.display = 'inline-block';
      } else {
        adminBtn.style.display = 'none';
      }
    }

    alert("✅ Đăng nhập thành công!");

    // Tải dữ liệu bản đồ và danh mục
    if (typeof taiDuLieuSupabase === 'function') {
      taiDuLieuSupabase(true);
    }

  } catch (err) {
    alert("❌ Lỗi xác thực đăng nhập: " + err.message);
  }
}

// Hàm ẩn/hiện mật khẩu trên giao diện đăng nhập
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

// Hàm đăng xuất hệ thống
function handleLogout() {
  localStorage.removeItem('tnn_user');
  location.reload();
}
