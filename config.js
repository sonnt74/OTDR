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

// Hàm ghi lại lịch sử thao tác của kỹ sư vào cơ sở dữ liệu
async function ghiNhatKyThaoTac(hanhDong, chiTiet) {
  try {
    var userEmail = currentUser && currentUser.isLoggedIn ? (currentUser.email || "Thành viên hệ thống") : "Khách";
    var userRole = currentUser ? currentUser.role : "member";

    await supabaseClient.from('lich_su_thao_tac').insert([{
      email_nguoi_dung: userEmail,
      vai_tro: userRole,
      hanh_dong: hanhDong,
      chi_tiet: chiTiet
    }]);
  } catch (err) {
    console.error("Không thể ghi nhật ký thao tác:", err.message);
  }
}
