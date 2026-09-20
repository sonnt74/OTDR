// ==========================================================================
// TỆP AUTH.JS - XÁC THỰC ĐĂNG NHẬP & PHÂN QUYỀN (HOÀN CHỈNH)
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

    // Cập nhật biến toàn cục currentUser (tương thích ngược an toàn với map.js và data.js)[cite: 3, 6, 7, 8]
    currentUser = {
      isLoggedIn: true,
      account: data.account,
      role: data.role || 'nhan_vien',
      id_dai: data.id_dai || null,
      id_tram: data.id_tram || null,
      idDai: data.id_dai || null,       // Tương thích cho data.js[cite: 6]
      idTram: data.id_tram || null,     // Tương thích cho data.js[cite: 6]
      can_edit_map: !!data.can_edit_map,
      canEditMap: !!data.can_edit_map   // Tương thích cho map.js[cite: 3]
    };

    localStorage.setItem('tnn_user', JSON.stringify(currentUser));
    
    if (typeof AppStore !== 'undefined' && AppStore.setState) {
      AppStore.setState({ currentUser: currentUser });
    }

    // Ẩn modal đăng nhập và hiện bảng điều khiển
    var loginModal = document.getElementById('loginModal');
    if (loginModal) loginModal.style.display = 'none';

    var controlPanel = document.getElementById('control-panel');
    if (controlPanel) controlPanel.style.display = 'block';

    // Hiển thị tên tài khoản lên giao diện
    var userInfoDisplay = document.getElementById('userInfoDisplay');
    if (userInfoDisplay) {
      userInfoDisplay.innerText = "👤 " + currentUser.account + " (" + currentUser.role + ")";
    }

    // Hiển thị nút quản trị nếu đúng phân quyền[cite: 4]
    var adminBtn = document.getElementById('adminMobileBtn');
    if (adminBtn) {
      var roleLower = (currentUser.role || '').toLowerCase();
      if (roleLower.includes('admin') || roleLower.includes('sys')) {
        adminBtn.style.display = 'block';
      } else {
        adminBtn.style.display = 'none';
      }
    }

    alert("✅ Đăng nhập thành công!");

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

// Hàm ẩn/hiện mật khẩu
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

// Hàm đăng xuất
function handleLogout() {
  localStorage.removeItem('tnn_user');
  location.reload();
}
```[cite: 3, 6, 7, 8]

---

### 📋 Hướng dẫn triển khai nhanh:
1. Copy toàn bộ đoạn mã trên dán đè vào tệp **`auth.js`**[cite: 8].
2. Nhấn **`Ctrl + F5`** (Hard Reload) trên trình duyệt để làm mới bộ nhớ đệm.
3. Nhập tài khoản (`account`) và mật khẩu để đăng nhập. Hệ thống sẽ xác thực thành công, hiển thị nút quản trị đầy đủ, khởi tạo bản đồ Leaflet và tải tuyến cáp mượt mà!
