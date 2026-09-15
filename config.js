// config.js - Cấu hình kết nối, biến toàn cục và hàm tiện ích chung
const SUPABASE_URL = 'https://clddwitzwuewwxawuorv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_U3tMbsj5oQ9Wub1UAJO5Cw_NXt6Px8E';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

var currentUser = { isLoggedIn: false, role: 'member', idDai: null, idTram: null, canEditMap: false };
var map = null;

var markersLayer = L.markerClusterGroup({ maxClusterRadius: 40 });
var mxLayer = L.layerGroup();
var polylinesLayer = L.layerGroup();
var userLocationLayer = L.layerGroup();
var measureLayer = L.layerGroup();
var foundMarkerLayer = null;

var isMeasuring = false;
var measurePoints = [];

var rawDaiList = [];
var rawTramList = [];
var rawTuyenList = [];
var rawDoanCapList = [];
var rawLoaiDiemList = [];
var globalDataPoints = [];

// Các hàm tiện ích giao diện chung cho mọi module
function showLoading(msg) {
  var el = document.getElementById('loading-overlay-text');
  if (el) el.innerText = msg;
  var overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.style.display = 'flex';
}

function hideLoading() {
  var overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.style.display = 'none';
}

function showToast(message, type = 'info') {
  var container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  var toast = document.createElement('div');
  toast.className = `toast-msg ${type}`;
  toast.innerText = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s ease';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function closeModals() {
  document.querySelectorAll('.app-modal').forEach(modal => {
    if (modal.id !== 'loginModal' || !currentUser.isLoggedIn) modal.style.display = 'none';
  });
}

function openModal(id, tabId = null) {
  closeModals();
  var modal = document.getElementById(id);
  if (modal) modal.style.display = 'flex';
  if (id === 'adminMasterModal' && typeof switchAdminTab === 'function') {
    if (tabId) switchAdminTab(tabId);
    if (typeof loadAdminMasterData === 'function') loadAdminMasterData();
  }
}
```[cite: 1, 2]

#### 2. Cập nhật lại tệp `auth.js`
Đảm bảo tệp `auth.js` thực hiện đúng quy trình xác thực và gọi chuyển tiếp sang tải dữ liệu[cite: 1]:

```javascript
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
