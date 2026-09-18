// ==========================================================================
// TỆP AUTH.JS - XÁC THỰC ĐĂNG NHẬP & PHÂN QUYỀN (CHỈ DÙNG TRƯỜNG ACCOUNT)
// ==========================================================================

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

    // Lưu duy nhất trường account trong phiên làm việc để tránh xung đột
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
      if (currentUser.role === 'admin_sys' || currentUser.role === 'admin_dai' || currentUser.role === 'admin_tram') {
        adminBtn.style.display = 'inline-block';
      } else {
        adminBtn.style.display = 'none';
      }
    }

    alert("✅ Đăng nhập thành công!");

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
