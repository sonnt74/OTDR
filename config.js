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

// Hàm hiển thị/ẩn xoay tròn chờ dữ liệu[cite: 9]
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

// Hàm hiển thị thông báo Toast góc màn hình duy nhất[cite: 9]
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

// Hàm hiển thị hộp thoại xác nhận tùy chỉnh thay thế confirm() của trình duyệt[cite: 9]
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

// ==========================================================================
// HỘP THOẠI NHẬP LIỆU TÙY CHỈNH (CUSTOM PROMPT DIALOG CHUYÊN NGHIỆP)[cite: 9]
// ==========================================================================
function showPromptDialog(title, defaultValue = '') {
  return new Promise((resolve) => {
    let overlay = document.getElementById('custom-prompt-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'custom-prompt-overlay';
      overlay.style.cssText = "display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(15, 23, 42, 0.7); z-index: 9999999; justify-content: center; align-items: center; backdrop-filter: blur(3px);";
      overlay.innerHTML = `
        <div class="confirm-box" style="width: 90%; max-width: 380px; text-align: left; background: #ffffff; padding: 20px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); border: 1px solid #e2e8f0;">
          <div class="confirm-msg" id="custom-prompt-title" style="margin-bottom: 10px; font-size: 13px; color: #1e293b; font-weight: 600;"></div>
          <input type="text" id="custom-prompt-input" style="width: 100%; padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; margin-bottom: 16px; box-sizing: border-box; outline: none;" autocomplete="off">
          <div class="confirm-actions" style="display: flex; gap: 8px;">
            <button class="btn-confirm-no" id="custom-prompt-no" style="flex: 1; padding: 8px; border-radius: 6px; background: #64748b; color: white; border: none; font-weight: bold; cursor: pointer;">Hủy bỏ</button>
            <button class="btn-confirm-yes" id="custom-prompt-yes" style="flex: 1; padding: 8px; border-radius: 6px; background: #0d6efd; color: white; border: none; font-weight: bold; cursor: pointer;">Xác nhận</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
    }
    
    // Đã khắc phục lỗi thiếu dấu chấm ở đây:
    document.getElementById('custom-prompt-title').innerHTML = title;
    let inputEl = document.getElementById('custom-prompt-input');
    inputEl.value = defaultValue || '';
    
    overlay.style.display = 'flex';
    setTimeout(() => { inputEl.focus(); inputEl.select(); }, 100);

    let btnYes = document.getElementById('custom-prompt-yes');
    let btnNo = document.getElementById('custom-prompt-no');

    btnYes.onclick = function() {
      let val = inputEl.value.trim();
      overlay.style.display = 'none';
      resolve(val);
    };

    btnNo.onclick = function() {
      overlay.style.display = 'none';
      resolve(null);
    };

    inputEl.onkeydown = function(e) {
      if (e.key === 'Enter') {
        btnYes.click();
      } else if (e.key === 'Escape') {
        btnNo.click();
      }
    };
  });
}

// Hàm ghi nhật ký thao tác người dùng (Sử dụng trường account)[cite: 9]
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
// ==========================================================================
// HỘP THOẠI NHẬP LIỆU GHI CHÚ NHIỀU DÒNG (CUSTOM TEXTAREA DIALOG)
// ==========================================================================
function showTextareaDialog(title, defaultValue = '') {
  return new Promise((resolve) => {
    let overlay = document.getElementById('custom-textarea-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'custom-textarea-overlay';
      overlay.style.cssText = "display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(15, 23, 42, 0.7); z-index: 9999999; justify-content: center; align-items: center; backdrop-filter: blur(3px);";
      overlay.innerHTML = `
        <div class="confirm-box" style="width: 90%; max-width: 420px; text-align: left; background: #ffffff; padding: 20px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); border: 1px solid #e2e8f0;">
          <div class="confirm-msg" id="custom-textarea-title" style="margin-bottom: 10px; font-size: 13px; color: #1e293b; font-weight: 600;"></div>
          <textarea id="custom-textarea-input" rows="4" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; margin-bottom: 16px; box-sizing: border-box; outline: none; resize: vertical; font-family: Arial, sans-serif;" placeholder="Nhập ghi chú chi tiết, thông tin suy hao..."></textarea>
          <div class="confirm-actions" style="display: flex; gap: 8px;">
            <button class="btn-confirm-no" id="custom-textarea-no" style="flex: 1; padding: 8px; border-radius: 6px; background: #64748b; color: white; border: none; font-weight: bold; cursor: pointer;">Hủy bỏ</button>
            <button class="btn-confirm-yes" id="custom-textarea-yes" style="flex: 1; padding: 8px; border-radius: 6px; background: #198754; color: white; border: none; font-weight: bold; cursor: pointer;">Lưu ghi chú</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
    }
    
    document.getElementById('custom-textarea-title').innerHTML = title;
    let textareaEl = document.getElementById('custom-textarea-input');
    textareaEl.value = defaultValue || '';
    
    overlay.style.display = 'flex';
    setTimeout(() => { textareaEl.focus(); textareaEl.select(); }, 100);

    let btnYes = document.getElementById('custom-textarea-yes');
    let btnNo = document.getElementById('custom-textarea-no');

    btnYes.onclick = function() {
      let val = textareaEl.value.trim();
      overlay.style.display = 'none';
      resolve(val);
    };

    btnNo.onclick = function() {
      overlay.style.display = 'none';
      resolve(null);
    };
  });
}
function showSingleInputDialog(title, defaultValue = '') {
  return new Promise((resolve) => {
    let overlay = document.getElementById('custom-single-input-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'custom-single-input-overlay';
      overlay.style.cssText = "display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(15, 23, 42, 0.7); z-index: 9999999; justify-content: center; align-items: center; backdrop-filter: blur(3px);";
      overlay.innerHTML = `
        <div class="confirm-box" style="width: 90%; max-width: 380px; text-align: left; background: #ffffff; padding: 20px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); border: 1px solid #e2e8f0;">
          <div class="confirm-msg" id="custom-single-input-title" style="margin-bottom: 10px; font-size: 13px; color: #1e293b; font-weight: 600;"></div>
          <input type="text" id="custom-single-text-input" style="width: 100%; padding: 9px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; margin-bottom: 16px; box-sizing: border-box; outline: none; font-family: Arial, sans-serif;" autocomplete="off" placeholder="Nhập tên mới...">
          <div class="confirm-actions" style="display: flex; gap: 8px;">
            <button class="btn-confirm-no" id="custom-single-input-no" style="flex: 1; padding: 8px; border-radius: 6px; background: #64748b; color: white; border: none; font-weight: bold; cursor: pointer;">Hủy bỏ</button>
            <button class="btn-confirm-yes" id="custom-single-input-yes" style="flex: 1; padding: 8px; border-radius: 6px; background: #0d6efd; color: white; border: none; font-weight: bold; cursor: pointer;">Cập nhật tên</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
    }
    
    document.getElementById('custom-single-input-title').innerHTML = title;
    let inputEl = document.getElementById('custom-single-text-input');
    inputEl.value = defaultValue || '';
    
    overlay.style.display = 'flex';
    setTimeout(() => { inputEl.focus(); inputEl.select(); }, 100);

    let btnYes = document.getElementById('custom-single-input-yes');
    let btnNo = document.getElementById('custom-single-input-no');

    btnYes.onclick = function() {
      let val = inputEl.value.trim();
      overlay.style.display = 'none';
      resolve(val);
    };

    btnNo.onclick = function() {
      overlay.style.display = 'none';
      resolve(null);
    };

    inputEl.onkeydown = function(e) {
      if (e.key === 'Enter') {
        btnYes.click();
      } else if (e.key === 'Escape') {
        btnNo.click();
      }
    };
  });
}
