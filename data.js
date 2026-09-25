// ==========================================================================
// TỆP DATA.JS - QUẢN LÝ LUỒNG DỮ LIỆU (TÍCH HỢP VIEW SUPABASE & OFFLINE)
// ==========================================================================

var autoClearMarkerTimer = null; 
var rawDaiList = [], rawTramList = [], rawTuyenList = [], rawDoanCapList = [], rawLoaiDiemList = [], rawUserList = [], rawHuongList = [];

// SỬA LỖI: Thêm cờ kiểm soát luồng khởi tạo để chống load bản đồ nhiều lần
var isSyncingMaster = false; 

/**
 * 1. HÀM TIỆN ÍCH TRUY VẤN VÀ CHUẨN HÓA KHÓA ID AN TOÀN
 */
async function fetchAllRowsSafe(tableName) {
  let size = 1000, from = 0, allData = [], keep = true;
  while (keep) {
    let { data, error } = await supabaseClient.from(tableName).select('*').range(from, from + size - 1);
    if (error) throw error;
    if (data && data.length > 0) { allData = allData.concat(data); if (data.length < size) keep = false; else from += size; } else keep = false;
  }
  return allData;
}

function getSafeStrId(item, keys) {
  if (!item) return '';
  for (let k of keys) {
    if (item[k] !== undefined && item[k] !== null && item[k] !== '') {
      return String(item[k]).trim();
    }
  }
  return '';
}

/**
 * 2. TẢI VÀ ĐỒNG BỘ DANH MỤC MASTER
 */
async function taiDuLieuSupabase(forceRefresh = false) {
  isSyncingMaster = true; // KHÓA CỔNG: Ngăn chặn nạp điểm bản đồ trong lúc đang dựng Combobox
  let localMaster = null;

  try {
    if (typeof idbDocMaster === 'function' && !forceRefresh) {
      localMaster = await idbDocMaster();
      if (localMaster) {
        rawDaiList = localMaster.rawDaiList || [];
        rawTramList = localMaster.rawTramList || [];
        rawTuyenList = localMaster.rawTuyenList || [];
        rawDoanCapList = localMaster.rawDoanCapList || [];
        rawLoaiDiemList = localMaster.rawLoaiDiemList || [];
        rawUserList = localMaster.rawUserList || [];

        AppStore.setState({
          daiList: rawDaiList,
          tramList: rawTramList,
          tuyenList: rawTuyenList,
          doanCapList: rawDoanCapList,
          rawDaiList: rawDaiList,
          rawTramList: rawTramList,
          rawTuyenList: rawTuyenList,
          rawDoanList: rawDoanCapList,
          rawUserList: rawUserList
        });

        xuLyPhanQuyenDoanTuyenUser();
        if (typeof renderAllAdminTables === 'function') renderAllAdminTables();
      }
    }

    if (navigator.onLine && typeof supabaseClient !== 'undefined') {
      if (!localMaster || forceRefresh) showLoading("Đang nạp danh mục máy chủ...");

      let [daiRes, tramRes, tuyenRes, doanRes, loaiRes, userRes, huongRes] = await Promise.all([
        supabaseClient.from('dai_vt').select('*'),
        supabaseClient.from('tram_vt').select('*'),
        supabaseClient.from('tuyen_cap').select('*'),
        supabaseClient.from('v_doan_cap_full').select('*'), 
        supabaseClient.from('loai_diem').select('*'),
        supabaseClient.from('tai_khoan').select('*'),
        // Bẫy lỗi an toàn: Nếu bảng 'huong' chưa tồn tại, tự động trả về mảng rỗng thay vì báo lỗi sập toàn hệ thống
        supabaseClient.from('huong').select('*').then(res => res).catch(err => ({ data: [], error: err }))
      ]);

      rawDaiList = daiRes.data || rawDaiList;
      rawTramList = tramRes.data || rawTramList;
      rawTuyenList = tuyenRes.data || rawTuyenList;
      rawDoanCapList = doanRes.data || rawDoanCapList;
      rawLoaiDiemList = loaiRes.data || rawLoaiDiemList;
      rawUserList = userRes.data || rawUserList;
      rawHuongList = huongRes.data || rawHuongList;

      if (typeof idbLuuMaster === 'function') {
        await idbLuuMaster({ rawDaiList, rawTramList, rawTuyenList, rawDoanCapList, rawLoaiDiemList, rawUserList, rawHuongList });
      }

      AppStore.setState({
        daiList: rawDaiList,
        tramList: rawTramList,
        tuyenList: rawTuyenList,
        doanCapList: rawDoanCapList,
        rawDaiList: rawDaiList,
        rawTramList: rawTramList,
        rawTuyenList: rawTuyenList,
        rawDoanList: rawDoanCapList,
        rawUserList: rawUserList
      });

      xuLyPhanQuyenDoanTuyenUser();
      if (typeof renderAllAdminTables === 'function') renderAllAdminTables();
      if (forceRefresh) showToast("Đã đồng bộ danh mục mới nhất!", "success");
    }
  } catch (err) {
    console.warn("Đang sử dụng dữ liệu danh mục Offline:", err.message);
  } finally {
    isSyncingMaster = false; // MỞ CỔNG: Quá trình dựng danh mục đã hoàn tất
    hideLoading();
    if (typeof map !== 'undefined' && map) map.invalidateSize();
    
    // MỆNH LỆNH NẠP ĐIỂM DUY NHẤT 1 LẦN:
    var selectTuyen = document.getElementById('selectTuyen');
    var initTuyenVal = selectTuyen ? (String(selectTuyen.value).trim() || 'ALL') : 'ALL';
    await taiDiemTheoTuyen(initTuyenVal);
  }
}

/**
 * 3. TẢI ĐIỂM HẠ TẦNG THEO VÙNG XEM MÀN HÌNH (SỬ DỤNG VIEW)
 */
async function taiDiemTheoVungXem() {
  if (isSyncingMaster) return; // CHẶN LẠI: Không nạp vùng xem nếu đang đồng bộ khởi tạo
  if (typeof map === 'undefined' || !map) return;
  var selectTuyen = document.getElementById('selectTuyen');
  if (selectTuyen && selectTuyen.value !== 'ALL') return;

  var bounds = map.getBounds();
  var minLat = bounds.getSouth(), maxLat = bounds.getNorth();
  var minLng = bounds.getWest(), maxLng = bounds.getEast();

  try {
    if (navigator.onLine && typeof supabaseClient !== 'undefined') {
      const { data: pts, error: errPts } = await supabaseClient
        .from('v_diem_ha_tang_full')
        .select('*')
        .gte('lat', minLat).lte('lat', maxLat)
        .gte('lng', minLng).lte('lng', maxLng);

      if (errPts) throw errPts;
      if (!pts || pts.length === 0) {
        globalDataPoints = [];
        return;
      }

      globalDataPoints = (pts || []).map(pt => {
        return {
          id: String(pt.id),
          ten: pt.ten || '',
          lat: parseFloat(pt.lat),
          lng: parseFloat(pt.lng),
          ghiChu: pt.ghi_chu || '',
          idTuyen: String(pt.id_tuyen),
          idDoanCap: String(pt.id_doan_cap),
          idTram: String(pt.id_tram),
          idLoaiDiem: pt.id_loaidiem || 1,
          loai: pt.loai || 'Điểm',
          lyTrinh: pt.ly_trinh || '',
          duTru: pt.du_tru ? parseFloat(pt.du_tru) : 0,
          idHuong: pt.id_huong !== null && pt.id_huong !== undefined ? Number(pt.id_huong) : '',
          ngayPs: pt.ngay_ps || '',
          ghichu_an: pt.ghichu_an || '',
          // Lấy đúng STT từ DB, nếu không có mặc định là 1 (Không ép măng xông thành 9999 nữa)
          stt: pt.stt !== undefined && pt.stt !== null ? Number(pt.stt) : 1
        };
      });

      if (typeof idbLuuDanhSachDiem === 'function') await idbLuuDanhSachDiem(globalDataPoints);
    } else {
      throw new Error("Offline Mode");
    }
  } catch (err) {
    if (typeof idbDocDiemTheoVungXem === 'function') {
      globalDataPoints = await idbDocDiemTheoVungXem(minLat, maxLat, minLng, maxLng);
    }
  } finally {
    AppStore.setState({ dataPoints: globalDataPoints });
    if (typeof veLaiTuyenAB === 'function') veLaiTuyenAB();
  }
}

/**
 * 4. TẢI ĐIỂM HẠ TẦNG THEO TUYẾN CÁP (SỬ DỤNG VIEW)
 */
async function taiDiemTheoTuyen(idTuyen) {
  if (!idTuyen || idTuyen === 'ALL' || idTuyen === 'undefined') {
    await taiDiemTheoVungXem();
    return;
  }
  showLoading("Đang nạp dữ liệu tuyến cáp...");

  try {
    if (navigator.onLine && typeof supabaseClient !== 'undefined') {
      const { data: pts, error: errPts } = await supabaseClient
        .from('v_diem_ha_tang_full')
        .select('*')
        .eq('id_tuyen', idTuyen);

      if (errPts) throw errPts;
      if (!pts || pts.length === 0) {
        globalDataPoints = [];
        AppStore.setState({ dataPoints: [] });
        showToast("Tuyến cáp này chưa có điểm hạ tầng!", "info");
        if (typeof veLaiTuyenAB === 'function') veLaiTuyenAB();
        return;
      }

      globalDataPoints = (pts || []).map(pt => {
        return {
          id: String(pt.id),
          ten: pt.ten || '',
          lat: parseFloat(pt.lat),
          lng: parseFloat(pt.lng),
          ghiChu: pt.ghi_chu || '',
          idTuyen: String(pt.id_tuyen),
          idDoanCap: String(pt.id_doan_cap),
          idTram: String(pt.id_tram),
          idLoaiDiem: pt.id_loaidiem || 1,
          loai: pt.loai || 'Điểm',
          lyTrinh: pt.ly_trinh || '',
          idHuong: pt.id_huong || null, // Bổ sung Hướng
          ngayPs: pt.ngay_ps || '',     // Bổ sung Ngày PS
          duTru: pt.du_tru ? parseFloat(pt.du_tru) : 0,
          // Lấy đúng STT từ DB, nếu không có mặc định là 1 (Không ép măng xông thành 9999 nữa)
          stt: pt.stt !== undefined && pt.stt !== null ? Number(pt.stt) : 1
        };
      });

      if (typeof idbLuuDanhSachDiem === 'function') await idbLuuDanhSachDiem(globalDataPoints);
      showToast(`Đã nạp ${globalDataPoints.length} điểm thuộc tuyến!`, "success");
    } else {
      throw new Error("Offline Mode");
    }
  } catch (err) {
    console.warn("Lỗi kết nối mạng, chuyển sang lấy từ IndexedDB:", err.message);
    if (typeof idbDocDiemTheoTuyen === 'function') {
      globalDataPoints = await idbDocDiemTheoTuyen(idTuyen);
      if (globalDataPoints.length > 0) {
        showToast(`⚡ Đã nạp ${globalDataPoints.length} điểm từ bộ nhớ Offline (IndexedDB)`, "info");
      }
    }
  } finally {
    AppStore.setState({ dataPoints: globalDataPoints });
    capNhatComboDiemA();
    hideLoading();
    if (typeof veLaiTuyenAB === 'function') veLaiTuyenAB();
  }
}

/**
 * 5. PHÂN QUYỀN GIAO DIỆN THEO VAI TRÒ CURRENTUSER
 */
/**
 * 5. PHÂN QUYỀN GIAO DIỆN THEO VAI TRÒ CURRENTUSER
 * Đã chuẩn hóa: Đồng bộ sử dụng bộ lọc quyền từ tệp admin.js
 */
function xuLyPhanQuyenDoanTuyenUser() {
  var selectDai = document.getElementById('selectDai');
  var groupDai = selectDai ? selectDai.closest('.form-group') : null;
  var selectTram = document.getElementById('selectTram');
  var groupTram = selectTram ? selectTram.closest('.form-group') : null;

  // 1. Dùng chung một nguồn phân quyền duy nhất từ admin.js
  var access = (typeof getRoleAccess === 'function') ? getRoleAccess() : { isSys: true };
  
  // 2. Lấy danh sách đã được TỰ ĐỘNG CẮT GỌT theo đúng quyền user
  var filteredDai = (typeof getFilteredDaiList === 'function') ? getFilteredDaiList() : rawDaiList;
  var filteredTram = (typeof getFilteredTramList === 'function') ? getFilteredTramList() : rawTramList;

  // 3. Đổ dữ liệu vào Combobox (Chỉ đổ những dữ liệu user được phép thấy)
  if (selectDai) {
    selectDai.innerHTML = '<option value="ALL">-- Tất cả Đài --</option>';
    filteredDai.forEach(d => {
      selectDai.innerHTML += `<option value="${d.id_dai || d.id}">${d.ten_dai || d.ten}</option>`;
    });
  }

  if (selectTram) {
    selectTram.innerHTML = '<option value="ALL">-- Tất cả Trạm --</option>';
    filteredTram.forEach(t => {
      selectTram.innerHTML += `<option value="${t.id_tram || t.id}">${t.ten_tram || t.ten}</option>`;
    });
  }

  var selectedDaiVal = 'ALL';
  var selectedTramVal = 'ALL';

  // 4. Điều khiển hiển thị Ẩn/Hiện Form điều khiển dựa trên chuẩn của admin.js
  if (access.isMember || access.isTram) {
    // Nhân viên và Admin Trạm: Ẩn thanh chọn Đài/Trạm vì họ chỉ có 1 Trạm duy nhất
    if (groupDai) groupDai.style.display = 'none';
    if (groupTram) groupTram.style.display = 'none';
    
    selectedDaiVal = access.idDai || 'ALL';
    selectedTramVal = access.idTram || 'ALL';
    
    if (selectDai) selectDai.value = selectedDaiVal;
    if (selectTram) selectTram.value = selectedTramVal;
    
  } else if (access.isDai) {
    // Admin Đài: Nhìn thấy Form, Khóa cứng Đài, cho phép chọn Trạm
    if (groupDai) groupDai.style.display = 'block';
    if (groupTram) groupTram.style.display = 'block';
    
    selectedDaiVal = access.idDai || 'ALL';
    
    if (selectDai) { selectDai.value = selectedDaiVal; selectDai.disabled = true; }
    if (selectTram) selectTram.disabled = false;
    
  } else {
    // Sys Admin: Thấy hết, mở hết
    if (groupDai) { groupDai.style.display = 'block'; if (selectDai) selectDai.disabled = false; }
    if (groupTram) { groupTram.style.display = 'block'; if (selectTram) selectTram.disabled = false; }
  }

  // Cập nhật State và chuyển tiếp logic xuống hàm xử lý Tuyến
  AppStore.setState({ selectedDai: selectedDaiVal, selectedTram: selectedTramVal });
  updateTuyenOptions();
}

function onDaiChange() {
  var selectDai = document.getElementById('selectDai');
  var daiVal = selectDai ? selectDai.value : 'ALL';
  var selectTram = document.getElementById('selectTram');

  AppStore.setState({ selectedDai: String(daiVal), selectedTram: 'ALL' });

  // Dùng danh sách trạm đã lọc thay vì rawTramList
  var filteredTram = (typeof getFilteredTramList === 'function') ? getFilteredTramList() : rawTramList;

  if (selectTram) {
    selectTram.innerHTML = '<option value="ALL">-- Tất cả Trạm --</option>';
    filteredTram.filter(t => daiVal === 'ALL' || getSafeStrId(t, ['id_dai', 'dai_id']) === String(daiVal))
                .forEach(t => {
                  var tId = getSafeStrId(t, ['id_tram', 'id']);
                  selectTram.innerHTML += `<option value="${tId}">${t.ten_tram || t.ten}</option>`;
                });
    selectTram.value = 'ALL';
  }

  onTramChange();
}

function updateTuyenOptions() {
  onTramChange();
}

function onDoanCapChange() { 
  var selectDoanCap = document.getElementById('selectDoanCap');
  var doanVal = selectDoanCap ? String(selectDoanCap.value).trim() : 'ALL';
  AppStore.setState({ selectedDoanCap: doanVal });
  
  if (typeof veLaiTuyenAB === 'function') {
    veLaiTuyenAB(); 
  }
}

function onDiemAChange() { 
  if (typeof veLaiTuyenAB === 'function') veLaiTuyenAB(); 
}

function capNhatComboDiemA() {
  var selectTuyen = document.getElementById('selectTuyen');
  var tuyenVal = selectTuyen ? selectTuyen.value : 'ALL';
  var combo = document.getElementById('comboDiemA');
  if (!combo) return;
  combo.innerHTML = '<option value="DEFAULT">📍 Trạm VT A </option>';
  globalDataPoints.filter(pt => isMangXong(pt) && (tuyenVal === 'ALL' || String(pt.idTuyen) === String(tuyenVal))).forEach(mx => {
    combo.innerHTML += `<option value="${mx.ten}">🔀 ${mx.ten}</option>`;
  });
}

/**
 * 6. XỬ LÝ PHÂN TÍCH SỰ CỐ OTDR VÀ TÌM LÝ TRÌNH
 */
function datLichTuXoaMarkerTimKiem() {
  if (autoClearMarkerTimer) {
    clearTimeout(autoClearMarkerTimer);
  }

  autoClearMarkerTimer = setTimeout(function() {
    if (typeof foundMarkerLayer !== 'undefined' && foundMarkerLayer && map) {
      map.removeLayer(foundMarkerLayer);
      foundMarkerLayer = null;
      showToast("⏱️ Đã tự động xóa mốc tìm kiếm (Sau 60s)", "info");
    }
  }, 60000);
}

function chiaSeSuCo(lat, lng, khoangCachKm, lyTrinhText, prevMXInfo, nextMXInfo, shareType) {
  var message = `[NET1] THÔNG BÁO SỰ CỐ CÁP QUANG\n` +
                `- Tọa độ: ${lat}, ${lng}\n` +
                `- Cự ly đo OTDR: ${khoangCachKm} km\n` +
                `- Lý trình QL: ${lyTrinhText}\n` +
                `- MX trước: ${prevMXInfo}\n` +
                `- MX sau: ${nextMXInfo}\n` +
                `- Bản đồ: https://maps.google.com/?q=${lat},${lng}`;
  
  if (shareType === 'copy') { 
    navigator.clipboard.writeText(message); 
    showToast("📋 Đã sao chép nội dung sự cố!", "success"); 
  } else if (shareType === 'zalo') {
    navigator.clipboard.writeText(message);
    showToast("📋 Đã sao chép! Đang mở ứng dụng Zalo...", "success");
    setTimeout(function() { window.location.href = 'zalo://'; }, 500);
  } else if (shareType === 'viber') {
    var encoded = encodeURIComponent(message);
    window.open(`viber://forward?text=${encoded}`, '_blank');
  }
}

// =========================================================
// CHÈN VÀO DATA.JS (PHẦN 6: OTDR VÀ TÌM LÝ TRÌNH)
// =========================================================

// HÀM TIỆN ÍCH: Nhận diện bối cảnh thông minh (Context-Aware)
function chonDoanCapPhanTich(callback) {
  var doanVal = document.getElementById('selectDoanCap').value;
  // Trạng thái 1: Kỹ sư đang chọn 1 đoạn cụ thể -> Tính toán ngay
  if (doanVal !== 'ALL') { 
    callback(doanVal); 
    return; 
  }

  // Trạng thái 2: Bản đồ đang vẽ Toàn cảnh -> Bật Form hỏi
  var tuyenVal = document.getElementById('selectTuyen').value;
  var tramVal = document.getElementById('selectTram') ? document.getElementById('selectTram').value : 'ALL';
  var doanCapList = (typeof AppStore !== 'undefined' && AppStore.getState().doanCapList) ? AppStore.getState().doanCapList : (window.rawDoanCapList || []);
  
  var matchedDoan = doanCapList.filter(d => {
    var isTuyenMatch = (tuyenVal === 'ALL') ? true : (String(d.id_tuyen || d.tuyen_id || d.id_tuyen_cap) === String(tuyenVal));
    var isTramMatch = (tramVal === 'ALL') ? true : (String(d.id_tram || d.tram_id) === String(tramVal));
    return isTuyenMatch && isTramMatch;
  });

  if (matchedDoan.length === 0) { showToast("Không có đoạn cáp nào!", "error"); return; }
  if (matchedDoan.length === 1) { callback(matchedDoan[0].id_doan_cap || matchedDoan[0].id); return; }

  let overlay = document.getElementById('custom-segment-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'custom-segment-overlay';
    overlay.style.cssText = "display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(15, 23, 42, 0.7); z-index: 9999999; justify-content: center; align-items: center; backdrop-filter: blur(3px);";
    document.body.appendChild(overlay);
  }

  let optsHtml = matchedDoan.map(d => `<option value="${d.id_doan_cap || d.id}">${d.ten_doan_cap || d.ma_doancap}</option>`).join('');
  overlay.innerHTML = `
    <div class="confirm-box" style="width: 90%; max-width: 380px; text-align: left; background: #ffffff; padding: 20px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.3);">
      <div style="margin-bottom: 12px; font-size: 14px; font-weight: bold; color: #0d6efd;">🔀 Chọn Đoạn Cáp Phân Tích</div>
      <div style="font-size: 13px; color: #64748b; margin-bottom: 12px;">Bản đồ đang hiển thị toàn cảnh. Vui lòng chọn nhánh cáp muốn phân tích:</div>
      <select id="modalSelectDoan" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; margin-bottom: 16px;">${optsHtml}</select>
      <div style="display: flex; gap: 8px;">
        <button id="btnCancelSeg" style="flex: 1; padding: 8px; border-radius: 6px; background: #64748b; color: white; border: none; font-weight: bold; cursor: pointer;">Hủy bỏ</button>
        <button id="btnConfirmSeg" style="flex: 1; padding: 8px; border-radius: 6px; background: #198754; color: white; border: none; font-weight: bold; cursor: pointer;">Phân tích</button>
      </div>
    </div>`;
  overlay.style.display = 'flex';
  document.getElementById('btnCancelSeg').onclick = () => overlay.style.display = 'none';
  document.getElementById('btnConfirmSeg').onclick = () => { overlay.style.display = 'none'; callback(document.getElementById('modalSelectDoan').value); };
}

// =========================================================
// 1. CÁC HÀM HỖ TRỢ CHECKLIST (ĐA TUYẾN/ĐOẠN)
// =========================================================
function toggleAllCheckboxes(containerId, isChecked) {
  var container = document.getElementById(containerId);
  if(!container) return;
  var checkboxes = container.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach(cb => cb.checked = isChecked);
}

function checkSelectAll(containerId, chkAllId) {
  var container = document.getElementById(containerId);
  var chkAll = document.getElementById(chkAllId);
  if(!container || !chkAll) return;
  var allCbs = container.querySelectorAll('input[type="checkbox"]:not(#'+chkAllId+')');
  var allChecked = Array.from(allCbs).every(cb => cb.checked);
  chkAll.checked = allChecked;
}

function getCheckedValues(containerId) {
  var container = document.getElementById(containerId);
  if(!container) return [];
  var checkboxes = container.querySelectorAll('input[type="checkbox"]:not([id^="chkAll"])');
  var vals = [];
  checkboxes.forEach(cb => { if(cb.checked) vals.push(cb.value); });
  return vals;
}

// =========================================================
// 2. NẠP DỮ LIỆU CASCADING VÀO CHECKLIST
// =========================================================
function onTramChange() {
  var selectTram = document.getElementById('selectTram');
  var tramVal = selectTram ? String(selectTram.value).trim() : 'ALL';
  
  AppStore.setState({ selectedTram: tramVal, selectedDai: document.getElementById('selectDai') ? document.getElementById('selectDai').value : 'ALL' });

  var tuyenList = (typeof AppStore !== 'undefined' && AppStore.getState().tuyenList) ? AppStore.getState().tuyenList : (window.rawTuyenList || []);
  var doanCapList = (typeof AppStore !== 'undefined' && AppStore.getState().doanCapList) ? AppStore.getState().doanCapList : (window.rawDoanCapList || []);

  // Lọc tuyến theo Trạm thông qua các đoạn cáp thuộc trạm đó hoặc thuộc tính trạm của tuyến
  var filteredTuyen = [];
  if (tramVal === 'ALL') {
    filteredTuyen = tuyenList;
  } else {
    var matchedTuyenIds = doanCapList
      .filter(d => getSafeStrId(d, ['id_tram', 'tram_id', 'id_tram_vt', 'tram_ql']) === tramVal)
      .map(d => getSafeStrId(d, ['id_tuyen', 'tuyen_cap_id', 'id_tuyen_cap']));
    
    filteredTuyen = tuyenList.filter(t => {
      var tId = getSafeStrId(t, ['id_tuyen_cap', 'id_tuyen', 'id']);
      return matchedTuyenIds.includes(tId) || getSafeStrId(t, ['id_tram', 'tram_id']) === tramVal;
    });
  }

  var khayTuyen = document.getElementById('khayChonTuyen');
  if (khayTuyen) {
    if (filteredTuyen.length === 0) {
      khayTuyen.innerHTML = '<div style="color: #94a3b8; font-style: italic;">Không có tuyến cáp nào</div>';
    } else {
      let html = `<label class="checklist-item" style="font-weight:bold; color:#0d6efd;"><input type="checkbox" id="chkAllTuyen" onchange="toggleAllCheckboxes('khayChonTuyen', this.checked); onTuyenChange();"> ☑️ Chọn tất cả Tuyến</label>`;
      filteredTuyen.forEach(t => {
         var tId = getSafeStrId(t, ['id_tuyen_cap', 'id_tuyen', 'id']);
         var tName = t.ten_tuyen || t.ten_tuyencap || t.ten || ("Tuyến " + tId);
         html += `<label class="checklist-item"><input type="checkbox" value="${tId}" onchange="checkSelectAll('khayChonTuyen', 'chkAllTuyen'); onTuyenChange();"> ${tName}</label>`;
      });
      khayTuyen.innerHTML = html;
    }
  }
  onTuyenChange(); 
}

function onTuyenChange() {
  var checkedTuyen = getCheckedValues('khayChonTuyen');
  var doanList = (typeof AppStore !== 'undefined' && AppStore.getState().doanCapList) ? AppStore.getState().doanCapList : (window.rawDoanCapList || []);
  
  var filteredDoan = [];
  if (checkedTuyen.length > 0) {
    filteredDoan = doanList.filter(d => checkedTuyen.includes(String(d.id_tuyen || d.tuyen_id || d.id_tuyen_cap)));
  }

  var khayDoan = document.getElementById('khayChonDoanCap');
  if (khayDoan) {
    if (filteredDoan.length === 0) {
      khayDoan.innerHTML = '<div style="color: #94a3b8;">Vui lòng chọn Tuyến cáp...</div>';
    } else {
      let html = `<label class="checklist-item" style="font-weight:bold; color:#198754;"><input type="checkbox" id="chkAllDoan" onchange="toggleAllCheckboxes('khayChonDoanCap', this.checked); veLaiTuyenAB();"> ☑️ Chọn tất cả Đoạn cáp</label>`;
      filteredDoan.forEach(d => {
         html += `<label class="checklist-item"><input type="checkbox" value="${d.id_doan_cap || d.id}" onchange="checkSelectAll('khayChonDoanCap', 'chkAllDoan'); veLaiTuyenAB();"> ${d.ten_doan_cap || d.ma_doancap}</label>`;
      });
      khayDoan.innerHTML = html;
    }
  }
  veLaiTuyenAB();
}

// =========================================================
// 3. XỬ LÝ OTDR & LÝ TRÌNH THÔNG MINH (CONTEXT-AWARE)
// =========================================================
function chonDoanCapPhanTich(callback) {
  var checkedDoan = getCheckedValues('khayChonDoanCap');
  if (checkedDoan.length === 0) { showToast("Vui lòng tích chọn ít nhất 1 đoạn cáp!", "error"); return; }
  
  // Trạng thái 1: Kỹ sư chỉ tích chọn 1 đoạn cụ thể -> Tính toán ngay
  if (checkedDoan.length === 1) { callback(checkedDoan[0]); return; }

  // Trạng thái 2: Đang tích chọn >= 2 đoạn -> Bật Modal Form hỏi
  var doanList = window.rawDoanCapList || [];
  var matchedDoan = doanList.filter(d => checkedDoan.includes(String(d.id_doan_cap || d.id)));

  let overlay = document.getElementById('custom-segment-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'custom-segment-overlay';
    overlay.style.cssText = "display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(15, 23, 42, 0.7); z-index: 9999999; justify-content: center; align-items: center; backdrop-filter: blur(3px);";
    document.body.appendChild(overlay);
  }

  let optsHtml = matchedDoan.map(d => `<option value="${d.id_doan_cap || d.id}">${d.ten_doan_cap || d.ma_doancap}</option>`).join('');
  overlay.innerHTML = `
    <div class="confirm-box" style="width: 90%; max-width: 380px; text-align: left; background: #ffffff; padding: 20px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.3);">
      <div style="margin-bottom: 12px; font-size: 14px; font-weight: bold; color: #0d6efd;">🔀 Chọn Đoạn Cáp Phân Tích</div>
      <div style="font-size: 13px; color: #64748b; margin-bottom: 12px;">Bản đồ đang hiển thị nhiều đoạn cáp. Vui lòng chọn nhánh cáp làm trục chính:</div>
      <select id="modalSelectDoan" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; margin-bottom: 16px;">${optsHtml}</select>
      <div style="display: flex; gap: 8px;">
        <button id="btnCancelSeg" style="flex: 1; padding: 8px; border-radius: 6px; background: #64748b; color: white; border: none; font-weight: bold; cursor: pointer;">Hủy bỏ</button>
        <button id="btnConfirmSeg" style="flex: 1; padding: 8px; border-radius: 6px; background: #198754; color: white; border: none; font-weight: bold; cursor: pointer;">Phân tích OTDR</button>
      </div>
    </div>`;
  overlay.style.display = 'flex';
  document.getElementById('btnCancelSeg').onclick = () => overlay.style.display = 'none';
  document.getElementById('btnConfirmSeg').onclick = () => { overlay.style.display = 'none'; callback(document.getElementById('modalSelectDoan').value); };
}

// Bọc hàm timViTriDut cũ bằng logic chọn đoạn thông minh
function timViTriDut() {
  var kcOtdrKm = parseFloat(document.getElementById('txtKcOtdr').value), kcOtdrMeters = kcOtdrKm * 1000; 
  if (isNaN(kcOtdrMeters) || kcOtdrMeters <= 0) { showToast("Nhập cự ly đo hợp lệ!", "error"); return; }
  
  chonDoanCapPhanTich(function(targetDoanVal) {
    // Gọi hàm getMasterRouteBackbone với targetDoanVal đã chốt. (Truyền ALL cho Trạm/Tuyến vì Đoạn đã là ID duy nhất)
    var backbone = getMasterRouteBackbone('ALL', 'ALL', targetDoanVal);
    precalculateRouteDataForPoints(backbone, backbone);
    if (backbone.length < 2) { showToast("Tuyến cáp chưa đủ dữ liệu!", "error"); return; }

    var routeStops = backbone.map(p => ({ pt: p, dist: p.distanceFromAMeters, duTru: p.duTru || 0, isMX: isMangXong(p) })).sort((a, b) => a.dist - b.dist);
    var targetLat = backbone[backbone.length - 1].lat, targetLng = backbone[backbone.length - 1].lng;
    var prevMXName = "Chưa xác định", nextMXName = "Chưa xác định", prevMXDistText = "", nextMXDistText = "", interpolatedLyTrinhText = "Đang xác định...";

    for (var i = 0; i < routeStops.length - 1; i++) {
      var segStartDist = routeStops[i].dist, segEndDist = routeStops[i+1].dist;
      if (kcOtdrMeters <= segEndDist) {
        var ratio = (segEndDist - segStartDist > 0) ? ((kcOtdrMeters - segStartDist) / (segEndDist - segStartDist)) : 0;
        targetLat = routeStops[i].pt.lat + ratio * (routeStops[i+1].pt.lat - routeStops[i].pt.lat);
        targetLng = routeStops[i].pt.lng + ratio * (routeStops[i+1].pt.lng - routeStops[i].pt.lng);
        
        var lt1 = routeStops[i].pt.calculatedLyTrinhMeters, lt2 = routeStops[i+1].pt.calculatedLyTrinhMeters;
        if (lt1 !== undefined && lt2 !== undefined) {
          var interMeters = Math.round(lt1 + ratio * (lt2 - lt1));
          interpolatedLyTrinhText = `${Math.floor(interMeters / 1000)}+${(interMeters % 1000) < 10 ? '0' + (interMeters % 1000) : (interMeters % 1000)}`;
        }
        for (var j = i; j >= 0; j--) { if (routeStops[j].isMX) { prevMXName = routeStops[j].pt.ten; var dp = Math.round(kcOtdrMeters - routeStops[j].dist); prevMXDistText = (dp >= 1000) ? (dp/1000).toFixed(2)+" km" : dp+" m"; break; } }
        for (var k = i + 1; k < routeStops.length; k++) { if (routeStops[k].isMX) { nextMXName = routeStops[k].pt.ten; var dn = Math.round(routeStops[k].dist - kcOtdrMeters); nextMXDistText = (dn >= 1000) ? (dn/1000).toFixed(2)+" km" : dn+" m"; break; } }
        break;
      }
    }

    if (typeof foundMarkerLayer !== 'undefined' && foundMarkerLayer) map.removeLayer(foundMarkerLayer);
    map.setView([targetLat, targetLng], 19, { animate: true });
    
    var faultIcon = L.divIcon({ html: '<div style="background:red; color:white; width:28px; height:28px; border-radius:50%; text-align:center; line-height:28px; border:2px solid #fff; box-shadow:0 0 10px red;">⚡</div>', iconSize: [28, 28] });
    foundMarkerLayer = L.marker([targetLat, targetLng], { icon: faultIcon }).addTo(map);

    var prevMXFullInfo = prevMXName + (prevMXDistText ? ` (cách ${prevMXDistText})` : '');
    var nextMXFullInfo = nextMXName + (nextMXDistText ? ` (cách ${nextMXDistText})` : '');
    var popupHtml = `<b>⚡ VỊ TRÍ SỰ CỐ OTDR</b><br>Cự đoạn đo: <b>${kcOtdrKm.toFixed(2)} km</b><br>📍 Lý trình QL: <b>${interpolatedLyTrinhText}</b><br>🔀 MX trước: <b>${prevMXFullInfo}</b><br>🔀 MX sau: <b>${nextMXFullInfo}</b><br><a href='https://maps.google.com/?q=${targetLat},${targetLng}' target='_blank' class='btn-info' style='background:#0d6efd; color:white;'>🗺️ Dẫn đường GMaps</a>`;
    foundMarkerLayer.bindPopup(popupHtml).openPopup();
    
    var panel = document.getElementById('control-panel'); if (panel) panel.style.display = 'none';
    if (typeof datLichTuXoaMarkerTimKiem === 'function') datLichTuXoaMarkerTimKiem();
  });
}

// HÀM TÌM LÝ TRÌNH TRÊN BẢN ĐỒ HOÀN CHỈNH (Đã tích hợp Context-Aware)
function timLyTrinhBanDo() {
  var txt = document.getElementById('txtTimLyTrinh').value.trim();
  var parsedTarget = parseLyTrinhWithSuffix(txt);
  var targetMeters = parsedTarget ? parsedTarget.meters : null;
  
  if (targetMeters === null || isNaN(targetMeters)) {
    showToast("Sai định dạng lý trình! Vui lòng nhập theo mẫu: 54+100", "error");
    return;
  }
  
  // BỌC TRONG HÀM NHẬN DIỆN BỐI CẢNH (ĐA TUYẾN/ĐƠN TUYẾN)
  chonDoanCapPhanTich(function(targetDoanVal) {
    
    // Đã xác định được Đoạn cáp ID duy nhất, truyền ALL cho Tuyến/Trạm
    var backbone = getMasterRouteBackbone('ALL', 'ALL', targetDoanVal);
    var nonMxPts = backbone.filter(pt => !isMangXong(pt) && pt.idLoaiDiem !== 0);
    var basePt = backbone.find(p => p.id === 'TNN_BASE' || Math.abs(p.lat - 21.593365) < 0.0001);
    if (basePt && !nonMxPts.includes(basePt)) nonMxPts.unshift(basePt);
    var pts = precalculateRouteDataForPoints(nonMxPts, backbone);
    
    if (pts.length < 2) {
      showToast("Đoạn cáp này chưa đủ điểm để tìm lý trình!", "error");
      return;
    }

    // XỬ LÝ LÝ TRÌNH NGHỊCH HƯỚNG (Logic gốc của bạn - Giữ nguyên 100%)
    var isNghichHuong = (pts.length >= 2 && pts[1].calculatedLyTrinhMeters < pts[0].calculatedLyTrinhMeters);
    var sortedPts = [...pts].sort((a, b) => isNghichHuong ? b.calculatedLyTrinhMeters - a.calculatedLyTrinhMeters : a.calculatedLyTrinhMeters - b.calculatedLyTrinhMeters);

    var targetSeg = null;
    var foundLat = null, foundLng = null, bestDescription = "";

    // NỘI SUY TỌA ĐỘ VÀ KIỂM TRA HAVERSINE (Logic gốc của bạn)
    for (var i = 0; i < sortedPts.length - 1; i++) {
      var p1 = sortedPts[i];
      var p2 = sortedPts[i+1];
      var startLt = p1.calculatedLyTrinhMeters;
      var endLt = p2.calculatedLyTrinhMeters;
      
      var minLt = Math.min(startLt, endLt);
      var maxLt = Math.max(startLt, endLt);
      
      if (targetMeters >= minLt && targetMeters <= maxLt) {
        var span = endLt - startLt;
        var ratio = (span !== 0) ? (targetMeters - startLt) / span : 0;
        
        var testLat = p1.lat + ratio * (p2.lat - p1.lat);
        var testLng = p1.lng + ratio * (p2.lng - p1.lng);
        
        var distToP1 = calculateHaversine(testLat, testLng, p1.lat, p1.lng);
        var distToP2 = calculateHaversine(testLat, testLng, p2.lat, p2.lng);
        var segmentRealLen = calculateHaversine(p1.lat, p1.lng, p2.lat, p2.lng);

        if (distToP1 <= segmentRealLen + 100 && distToP2 <= segmentRealLen + 100) {
          targetSeg = { p1: p1, p2: p2 };
          foundLat = testLat;
          foundLng = testLng;
          bestDescription = `Nằm giữa [${p1.ten}] và [${p2.ten}]`;
          break;
        }
      }
    }

    // XỬ LÝ TÌM ĐIỂM GẦN NHẤT NẾU KHÔNG CÓ TRONG ĐOẠN NỘI SUY (Logic gốc)
    if (!targetSeg) {
      var closest = sortedPts.reduce((prev, curr) => Math.abs(curr.calculatedLyTrinhMeters - targetMeters) < Math.abs(prev.calculatedLyTrinhMeters - targetMeters) ? curr : prev);
      var deviationMeters = Math.abs(closest.calculatedLyTrinhMeters - targetMeters);
      if (deviationMeters > 100) {
        showToast(`Không tìm thấy lý trình (Sai số quá ${Math.round(deviationMeters)}m).`, "error");
        return;
      }
      foundLat = closest.lat;
      foundLng = closest.lng;
      bestDescription = `Gần điểm mốc: ${closest.ten}`;
    }

    var distToA = getDistanceAlongRoute({lat: foundLat, lng: foundLng}, backbone);
    var distStr = (distToA >= 1000) ? (distToA / 1000).toFixed(2) + " km" : Math.round(distToA) + " m";

    // VẼ MARKER VÀ GIAO DIỆN (Giữ nguyên)
    if (typeof foundMarkerLayer !== 'undefined' && foundMarkerLayer) map.removeLayer(foundMarkerLayer);
    map.setView([foundLat, foundLng], 19, { animate: true });
    
    var markerHtml = '<div style="background:#fd7e14; color:white; width:28px; height:28px; border-radius:50%; text-align:center; line-height:28px; border:2px solid #fff; box-shadow:0 0 10px #fd7e14; font-size:14px;">📍</div>';
    foundMarkerLayer = L.marker([foundLat, foundLng], { icon: L.divIcon({ html: markerHtml, className: '', iconSize: [28, 28], iconAnchor: [14, 14] }) }).addTo(map);
    
    var popupContent = `<b>🔍 KẾT QUẢ TÌM LÝ TRÌNH: ${txt}</b><br>` +
                       `- Vị trí: <b>${bestDescription}</b><br>` +
                       `- Cự ly cáp tới Trạm VT A: <b>${distStr}</b><br>` ;
                       
    foundMarkerLayer.bindPopup(popupContent).openPopup();
    
    if (typeof datLichTuXoaMarkerTimKiem === 'function') datLichTuXoaMarkerTimKiem();
    var panel = document.getElementById('control-panel');
    if (panel) panel.style.display = 'none';
  });
}

function xoaTatCaDoiTuongMap() {
  if (typeof polylinesLayer !== 'undefined' && polylinesLayer) polylinesLayer.clearLayers();
  if (typeof markersLayer !== 'undefined' && markersLayer) markersLayer.clearLayers();
  if (typeof mxLayer !== 'undefined' && mxLayer) mxLayer.clearLayers();
  
  if (typeof foundMarkerLayer !== 'undefined' && foundMarkerLayer && map) {
    map.removeLayer(foundMarkerLayer);
    foundMarkerLayer = null;
  }

  if (autoClearMarkerTimer) {
    clearTimeout(autoClearMarkerTimer);
    autoClearMarkerTimer = null;
  }

  showToast("🧹 Đã xóa sạch tất cả đối tượng trên bản đồ!", "info");
}

function toggleGISPanel() {
  var panel = document.getElementById('control-panel');
  if (panel) {
    panel.classList.toggle('collapsed');
  }
}
