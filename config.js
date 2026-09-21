// ==========================================================================
// TỆP CONFIG.JS - CẤU HÌNH SUPABASE & TIỆN ÍCH DÙNG CHUNG
// ==========================================================================

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

// Hàm hiển thị/ẩn xoay tròn chờ dữ liệu
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

// Hàm hiển thị thông báo Toast góc màn hình duy nhất
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
// Hàm hiển thị hộp thoại xác nhận tùy chỉnh thay thế confirm() của trình duyệt
function showConfirmDialog(message, type = 'danger') {
  return new Promise((resolve) => {
    let overlay = document.getElementById('custom-confirm-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'custom-confirm-overlay';
      overlay.innerHTML = `
        <div class="confirm-box">
          <div class="confirm-msg" id="custom-confirm-msg"></div>
          <div class="confirm-actions">
            <button class="btn-confirm-no" id="custom-confirm-no">Hủy bỏ</button>
            <button class="btn-confirm-yes" id="custom-confirm-yes">Xác nhận</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
    }
    
    document.getElementById('custom-confirm-msg').innerHTML = message;
    
    // Đổi màu nút dựa trên hành động (Lưu: Xanh, Xóa: Đỏ)
    let btnYes = document.getElementById('custom-confirm-yes');
    if (type === 'success') {
      btnYes.style.background = '#198754';
    } else {
      btnYes.style.background = '#dc3545';
    }

    overlay.style.display = 'flex';

    btnYes.onclick = function() {
      overlay.style.display = 'none';
      resolve(true);
    };
    document.getElementById('custom-confirm-no').onclick = function() {
      overlay.style.display = 'none';
      resolve(false);
    };
  });
}
// Hàm ghi nhật ký thao tác người dùng (Sử dụng trường account)
async function ghiNhatKyThaoTac(hanhDong, chiTiet) {
  try {
    var storedUser = JSON.parse(localStorage.getItem('tnn_user')) || {};
    var userAccount = storedUser.account ? storedUser.account : "Khách";
    var userRole = storedUser.role ? storedUser.role : "member";

    await supabaseClient.from('lich_su_thao_tac').insert([{
      account_nguoi_dung: userAccount,
      vai_tro: userRole,
      hanh_dong: hanhDong,
      chi_tiet: chiTiet
    }]);
  } catch (err) {
    console.error("Không thể ghi nhật ký thao tác:", err.message);
  }
}
