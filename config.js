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

// ==========================================================================
// HỘP THOẠI NHẬP LIỆU TÙY CHỈNH (CUSTOM PROMPT DIALOG CHUYÊN NGHIỆP)
// ==========================================================================
function showPromptDialog(title, defaultValue = '') {
  return new Promise((resolve) => {
    let overlay = document.getElementById('custom-prompt-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'custom-prompt-overlay';
      overlay.innerHTML = `
        <div class="confirm-box" style="width: 90%; max-width: 380px; text-align: left;">
          <div class="confirm-msg" id="custom-prompt-title" style="margin-bottom: 10px; font-size: 13px; color: #1e293b;"></div>
          <input type="text" id="custom-prompt-input" style="width: 100%; padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; margin-bottom: 16px; box-sizing: border-box; outline: none;" autocomplete="off">
          <div class="confirm-actions" style="display: flex; gap: 8px;">
            <button class="btn-confirm-no" id="custom-prompt-no" style="flex: 1; padding: 8px; border-radius: 6px;">Hủy bỏ</button>
            <button class="btn-confirm-yes" id="custom-prompt-yes" style="flex: 1; padding: 8px; border-radius: 6px; background: #0d6efd;">Xác nhận</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
    }
    
    document.getElementById('custom-prompt-titleinnerHTML = title;
    let inputEl = document.getElementById('custom-prompt-input');
    inputEl.value = defaultValue || '';
    
    overlay.style.display = 'flex';
    setTimeout(() => { inputEl.focus(); inputEl.select(); }, 100);

    let btnYes = document.getElementById('custom-prompt-yes');
    let btnNo = document.getElementById('custom-prompt-no');

    // Xử lý sự kiện nút Xác nhận
    btnYes.onclick = function() {
      let val = inputEl.value.trim();
      overlay.style.display = 'none';
      resolve(val);
    };

    // Xử lý sự kiện nút Hủy bỏ
    btnNo.onclick = function() {
      overlay.style.display = 'none';
      resolve(null);
    };

    // Hỗ trợ ấn phím Enter để xác nhận nhanh
    inputEl.onkeydown = function(e) {
      if (e.key === 'Enter') {
        btnYes.click();
      } else if (e.key === 'Escape') {
        btnNo.click();
      }
    };
  });
}
```[cite: 9]

---

#### Bước 2: Cập nhật tệp `map.js`
Bạn hãy mở tệp **`map.js`**, tìm đến phần hàm `window.moFormCrud` và `window.suaGhiChu`[cite: 5] mà chúng ta đã làm ở bước trước, sau đó thay thế bằng phiên bản sử dụng `showPromptDialog` dưới đây:

```javascript
// ==========================================================================
// CÁC HÀM XỬ LÝ SỰ KIỆN NÚT BẤM TRÊN POPUP BẢN ĐỒ (SỬ DỤNG CUSTOM PROMPT)
// ==========================================================================

// 1. Hàm xử lý Sửa tên và Xóa đối tượng hạ tầng
window.moFormCrud = async function(action, id, ten, lat, lng) {
  if (action === 'DELETE') {
    let isConfirmed = await showConfirmDialog(`⚠️ CẢNH BÁO:<br>Bạn có chắc chắn muốn xóa vĩnh viễn điểm <b>${ten}</b> khỏi tuyến không?`, 'danger');
    
    if (isConfirmed) {
      showLoading("Đang xóa điểm hạ tầng...");
      try {
        const { error } = await supabaseClient.from('diem_ha_tang').delete().eq('id_diem', id);
        if (error) throw error;
        
        globalDataPoints = globalDataPoints.filter(p => String(p.id) !== String(id));
        if (typeof AppStore !== 'undefined') AppStore.setState({ dataPoints: globalDataPoints });
        
        if (typeof ghiNhatKyThaoTac === 'function') await ghiNhatKyThaoTac("XOA_DIEM", `Kỹ sư đã xóa điểm [${ten}] ID: ${id}`);
        showToast("✅ Đã xóa điểm hạ tầng thành công!", "success");
        
        veLaiTuyenAB();
        map.setView([lat, lng], 19, { animate: true });
      } catch (err) {
        showToast("❌ Lỗi xóa điểm: " + err.message, "error");
      }
      hideLoading();
    }
  } 
  else if (action === 'EDIT') {
    // Sử dụng hộp thoại nhập liệu tùy chỉnh chuyên nghiệp thay vì prompt()
    let newTen = await showPromptDialog(`Nhập tên mới cho điểm hạ tầng:`, ten);
    
    if (newTen !== null && newTen !== '' && newTen !== ten) {
      let isConfirmed = await showConfirmDialog(`Xác nhận đổi tên điểm thành:<br><b style="color:#0d6efd;">${newTen}</b>?`, 'success');
      if (!isConfirmed) return;

      showLoading("Đang cập nhật tên...");
      try {
        const { error } = await supabaseClient.from('diem_ha_tang').update({ ten: newTen }).eq('id_diem', id);
        if (error) throw error;
        
        let localPt = globalDataPoints.find(p => String(p.id) === String(id));
        if (localPt) localPt.ten = newTen;
        
        if (typeof ghiNhatKyThaoTac === 'function') await ghiNhatKyThaoTac("SUA_TEN_DIEM", `Kỹ sư đổi tên điểm từ [${ten}] thành [${newTen}]`);
        showToast("✅ Cập nhật tên điểm thành công!", "success");
        
        veLaiTuyenAB();
        map.setView([lat, lng], 19, { animate: true });
      } catch (err) {
        showToast("❌ Lỗi cập nhật tên: " + err.message, "error");
      }
      hideLoading();
    }
  }
  else if (action === 'ADD') {
    showToast("Tính năng thêm điểm mới trên bản đồ đang được hoàn thiện.", "info");
  }
};

// 2. Hàm xử lý Ghi chú riêng cho Măng xông
window.suaGhiChu = async function(id, oldNote, lat, lng) {
  let currentNote = (oldNote === 'undefined' || oldNote === 'null') ? '' : oldNote;
  
  // Sử dụng hộp thoại nhập liệu tùy chỉnh chuyên nghiệp thay vì prompt()
  let newNote = await showPromptDialog(`Nhập ghi chú hoặc thông tin suy hao cho Măng xông:`, currentNote);
  
  if (newNote !== null && newNote !== currentNote) { 
    let isConfirmed = await showConfirmDialog(`Bạn muốn lưu nội dung ghi chú mới này chứ?`, 'success');
    if (!isConfirmed) return;

    showLoading("Đang lưu ghi chú...");
    try {
      const { error } = await supabaseClient.from('diem_ha_tang').update({ ghi_chu: newNote }).eq('id_diem', id);
      if (error) throw error;
      
      let localPt = globalDataPoints.find(p => String(p.id) === String(id));
      if (localPt) localPt.ghiChu = newNote;
      
      if (typeof ghiNhatKyThaoTac === 'function') await ghiNhatKyThaoTac("SUA_GHI_CHU", `Cập nhật ghi chú cho MX ID: ${id}`);
      showToast("✅ Lưu thông tin ghi chú thành công!", "success");
      
      veLaiTuyenAB();
      map.setView([lat, lng], 19, { animate: true });
    } catch (err) {
      showToast("❌ Lỗi lưu ghi chú: " + err.message, "error");
    }
    hideLoading();
  }
};
```[cite: 5]
