// ==========================================================================
// TỆP AUTH.JS - XÁC THỰC ĐĂNG NHẬP, PHÂN QUYỀN VÀ QUẢN LÝ PHIÊN
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
      khoiTaoBanDecLeaflet();
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
```[cite: 3, 6, 7, 8]

---

### 2. Cập nhật phần Modal Đăng nhập trong tệp `index.html`

Để nút ẩn/hiện mật khẩu hoạt động hoàn hảo, hãy đảm bảo phần tử nhập mật khẩu trong tệp **`index.html`**[cite: 4] sử dụng đúng định dạng sau:

```html
<div id="loginModal" class="app-modal" style="display: flex;">
  <div class="modal-content" style="max-width: 360px;">
    <div class="modal-header"><span>👤 Đăng nhập Hệ Thống</span></div>
    <div class="modal-body">
      <div class="form-group"><label>Tài khoản:</label><input type="text" id="loginAccount" placeholder="Nhập tên tài khoản" autocomplete="off"></div>
      <div class="form-group">
        <label>Mật khẩu:</label>
        <div style="position: relative;">
          <input type="password" id="loginPass" placeholder="••••••••" style="padding-right: 35px;" autocomplete="off">
          <span onclick="togglePasswordVisibility()" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); cursor: pointer; font-size: 14px;">👁️</span>
        </div>
      </div>
      <div class="checkbox-group" style="margin: 10px 0;">
        <input type="checkbox" id="chkRememberMe">
        <label style="margin:0; cursor:pointer; font-size: 12px;" for="chkRememberMe">Nhớ mật khẩu hệ thống</label>
      </div>
      <div style="display: flex; gap: 8px; margin-top: 6px;">
        <button type="button" class="btn-action" style="flex: 2; margin-top:0;" onclick="handleCustomLogin()">ĐĂNG NHẬP</button>
        <button type="button" class="btn-action" style="flex: 1; background: #64748b; margin-top:0;" onclick="handleLoginExit()">Thoát</button>
      </div>
    </div>
  </div>
</div>
```[cite: 4]
