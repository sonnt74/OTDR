// ==========================================================================
// TỆP DATA.JS - QUẢN LÝ LUỒNG DỮ LIỆU (TÍCH HỢP VIEW SUPABASE & OFFLINE)
// ==========================================================================

var autoClearMarkerTimer = null; 
var rawDaiList = [], rawTramList = [], rawTuyenList = [], rawDoanCapList = [], rawLoaiDiemList = [], rawUserList = [];

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

      let [daiRes, tramRes, tuyenRes, doanRes, loaiRes, userRes] = await Promise.all([
        supabaseClient.from('dai_vt').select('*'),
        supabaseClient.from('tram_vt').select('*'),
        supabaseClient.from('tuyen_cap').select('*'),
        supabaseClient.from('v_doan_cap_full').select('*'), 
        supabaseClient.from('loai_diem').select('*'),
        supabaseClient.from('tai_khoan').select('*')
      ]);

      rawDaiList = daiRes.data || rawDaiList;
      rawTramList = tramRes.data || rawTramList;
      rawTuyenList = tuyenRes.data || rawTuyenList;
      rawDoanCapList = doanRes.data || rawDoanCapList;
      rawLoaiDiemList = loaiRes.data || rawLoaiDiemList;
      rawUserList = userRes.data || rawUserList;

      if (typeof idbLuuMaster === 'function') {
        await idbLuuMaster({ rawDaiList, rawTramList, rawTuyenList, rawDoanCapList, rawLoaiDiemList, rawUserList });
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

function onTramChange() {
  var selectTram = document.getElementById('selectTram');
  var tramVal = selectTram ? String(selectTram.value).trim() : 'ALL';

  AppStore.setState({ selectedTram: tramVal });
  updateTuyenOptions();
}

function updateTuyenOptions() {
  var selectTuyen = document.getElementById('selectTuyen');
  var selectTram = document.getElementById('selectTram');
  if (!selectTuyen) return;

  var tramVal = selectTram ? String(selectTram.value).trim() : 'ALL';
  var state = AppStore.getState();
  
  var doanCapList = state.doanCapList || rawDoanCapList || [];
  var tuyenList = state.tuyenList || rawTuyenList || [];

  var filteredTuyenList = [];

  if (tramVal === 'ALL') {
    filteredTuyenList = tuyenList;
  } else {
    var matchedTuyenIds = doanCapList
      .filter(d => {
        var dTramId = getSafeStrId(d, ['id_tram', 'tram_id', 'id_tram_vt', 'tram_ql']);
        return dTramId === tramVal;
      })
      .map(d => getSafeStrId(d, ['id_tuyen', 'tuyen_cap_id', 'id_tuyen_cap']));
    
    filteredTuyenList = tuyenList.filter(t => {
      var tId = getSafeStrId(t, ['id_tuyen_cap', 'id_tuyen', 'id']);
      return matchedTuyenIds.includes(tId);
    });
  }

  selectTuyen.innerHTML = '<option value="ALL">-- Chọn tuyến cáp --</option>';
  filteredTuyenList.forEach(t => {
    var tuyenId = getSafeStrId(t, ['id_tuyen_cap', 'id_tuyen', 'id']);
    var tuyenMa = t.ma_tuyencap || t.ten_tuyen || t.ten || ("Tuyến " + tuyenId);
    selectTuyen.innerHTML += `<option value="${tuyenId}">${tuyenMa}</option>`;
  });

  if (selectTuyen.options.length > 1) {
    selectTuyen.selectedIndex = 1;
  }

  onTuyenChange();
}

async function onTuyenChange() {
  var selectTuyen = document.getElementById('selectTuyen');
  var selectTram = document.getElementById('selectTram'); 
  
  var tuyenVal = selectTuyen ? String(selectTuyen.value).trim() : 'ALL';
  var tramVal = selectTram ? String(selectTram.value).trim() : 'ALL';
  
  var selectDoanCap = document.getElementById('selectDoanCap');
  AppStore.setState({ selectedTuyen: tuyenVal });

  var state = AppStore.getState();
  var doanCapList = state.doanCapList || rawDoanCapList;

  if (selectDoanCap) {
    selectDoanCap.innerHTML = '<option value="ALL">-- Tất cả đoạn cáp --</option>';
    if (tuyenVal !== 'ALL') {
      var matchedDoan = doanCapList.filter(d => {
        var isTuyenMatch = getSafeStrId(d, ['id_tuyen', 'tuyen_cap_id', 'id_tuyen_cap']) === tuyenVal;
        var isTramMatch = (tramVal === 'ALL') ? true : (getSafeStrId(d, ['id_tram', 'tram_id', 'id_tram_vt', 'tram_ql']) === tramVal);
        return isTuyenMatch && isTramMatch;
      });

      matchedDoan.forEach(d => {
        var dId = getSafeStrId(d, ['id_doan_cap', 'id']);
        var dName = d.ma_doancap || d.ten_doancap;
        selectDoanCap.innerHTML += `<option value="${dId}">${dName}</option>`;
      });

      if (selectDoanCap.options.length > 1) {
        selectDoanCap.selectedIndex = 1;
      }
    }
  }

  var selectDoanCapEl = document.getElementById('selectDoanCap');
  var doanVal = selectDoanCapEl ? String(selectDoanCapEl.value).trim() : 'ALL';
  AppStore.setState({ selectedDoanCap: doanVal });

  // CHẶN LẠI: Nếu hệ thống đang khởi tạo (Syncing), không tải điểm bản đồ ở bước này
  if (!isSyncingMaster) {
    await taiDiemTheoTuyen(tuyenVal);
  }
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
  combo.innerHTML = '<option value="DEFAULT">📍 Trạm Gốc (TNN)</option>';
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
      showToast("⏱️ Đã tự động xóa mốc tìm kiếm (Sau 30s)", "info");
    }
  }, 30000);
}

function chiaSeSuCo(lat, lng, khoangCachKm, lyTrinhText, prevMXInfo, nextMXInfo, shareType) {
  var message = `[TNN NET1] THÔNG BÁO SỰ CỐ CÁP QUANG\n` +
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

function timViTriDut() {
  
  var kcOtdrKm = parseFloat(document.getElementById('txtKcOtdr').value), kcOtdrMeters = kcOtdrKm * 1000; 
  if (isNaN(kcOtdrMeters) || kcOtdrMeters <= 0) { showToast("Nhập cự ly đo hợp lệ!", "error"); return; }
  
  var tuyenVal = document.getElementById('selectTuyen').value;
  var tramVal = document.getElementById('selectTram') ? document.getElementById('selectTram').value : 'ALL';
  var doanVal = document.getElementById('selectDoanCap').value;
  
  var backbone = getMasterRouteBackbone(tuyenVal, tramVal, doanVal);
  precalculateRouteDataForPoints(backbone, backbone);

  if (backbone.length < 2) { showToast("Tuyến cáp chưa đủ dữ liệu!", "error"); return; }

  var routeStops = [];
  backbone.forEach(p => routeStops.push({ pt: p, dist: p.distanceFromAMeters, duTru: p.duTru || 0, isMX: isMangXong(p) }));
  routeStops.sort((a, b) => a.dist - b.dist);

  var targetLat = backbone[backbone.length - 1].lat, targetLng = backbone[backbone.length - 1].lng;
  var prevMXName = "Chưa xác định", nextMXName = "Chưa xác định";
  var prevMXDistText = "", nextMXDistText = "";
  var interpolatedLyTrinhText = "Đang xác định...";

  for (var i = 0; i < routeStops.length - 1; i++) {
    var segStartDist = routeStops[i].dist;
    var segEndDist = routeStops[i+1].dist;
    
    if (kcOtdrMeters <= segEndDist) {
      var segOptDist = segEndDist - segStartDist;
      var ratio = (segOptDist > 0) ? ((kcOtdrMeters - segStartDist) / segOptDist) : 0;
      
      targetLat = routeStops[i].pt.lat + ratio * (routeStops[i+1].pt.lat - routeStops[i].pt.lat);
      targetLng = routeStops[i].pt.lng + ratio * (routeStops[i+1].pt.lng - routeStops[i].pt.lng);
      
      var lt1 = routeStops[i].pt.calculatedLyTrinhMeters;
      var lt2 = routeStops[i+1].pt.calculatedLyTrinhMeters;
      if (lt1 !== undefined && lt2 !== undefined) {
        var interMeters = Math.round(lt1 + ratio * (lt2 - lt1));
        var km = Math.floor(interMeters / 1000);
        var m = interMeters % 1000;
        interpolatedLyTrinhText = `${km}+${m < 10 ? '0' + m : m}`;
      }

      for (var j = i; j >= 0; j--) {
        if (routeStops[j].isMX) {
          prevMXName = routeStops[j].pt.ten;
          var distPrev = Math.round(kcOtdrMeters - routeStops[j].dist);
          prevMXDistText = (distPrev >= 1000) ? (distPrev / 1000).toFixed(2) + " km" : distPrev + " m";
          break;
        }
      }

      for (var k = i + 1; k < routeStops.length; k++) { 
        if (routeStops[k].isMX) { 
          nextMXName = routeStops[k].pt.ten;
          var distNext = Math.round(routeStops[k].dist - kcOtdrMeters);
          nextMXDistText = (distNext >= 1000) ? (distNext / 1000).toFixed(2) + " km" : distNext + " m";
          break; 
        } 
      }
      break;
    }
  }

  if (foundMarkerLayer) map.removeLayer(foundMarkerLayer);
  map.setView([targetLat, targetLng], 19, { animate: true });
  
  var faultIcon = L.divIcon({ html: '<div style="background:red; color:white; width:28px; height:28px; border-radius:50%; text-align:center; line-height:28px; border:2px solid #fff; box-shadow:0 0 10px red;">⚡</div>', iconSize: [28, 28] });
  var faultMarker = L.marker([targetLat, targetLng], { icon: faultIcon }).addTo(map);
  foundMarkerLayer = faultMarker;

  var prevMXFullInfo = prevMXName + (prevMXDistText ? ` (cách ${prevMXDistText})` : '');
  var nextMXFullInfo = nextMXName + (nextMXDistText ? ` (cách ${nextMXDistText})` : '');

  var shareButtonsHtml = `
    <div style="margin-top: 8px; border-top: 1px dashed #ccc; padding-top: 6px;">
      <b>Chia sẻ sự cố nhanh:</b><br>
      <button class="btn-info" onclick="chiaSeSuCo(${targetLat.toFixed(6)}, ${targetLng.toFixed(6)}, ${kcOtdrKm.toFixed(2)}, '${interpolatedLyTrinhText}', '${prevMXFullInfo}', '${nextMXFullInfo}', 'copy')">📋 Copy</button>
      <button class="btn-info" onclick="chiaSeSuCo(${targetLat.toFixed(6)}, ${targetLng.toFixed(6)}, ${kcOtdrKm.toFixed(2)}, '${interpolatedLyTrinhText}', '${prevMXFullInfo}', '${nextMXFullInfo}', 'zalo')" style="background:#0068ff; color:white;">💬 Zalo App</button>
      <button class="btn-info" onclick="chiaSeSuCo(${targetLat.toFixed(6)}, ${targetLng.toFixed(6)}, ${kcOtdrKm.toFixed(2)}, '${interpolatedLyTrinhText}', '${prevMXFullInfo}', '${nextMXFullInfo}', 'viber')" style="background:#6f42c1; color:white;">📱 Viber</button>
    </div>`;
  
  var popupHtml = `<b>⚡ VỊ TRÍ SỰ CỐ OTDR</b><br>` +
                  `Cự đoạn đo: <b>${kcOtdrKm.toFixed(2)} km</b><br>` +
                  `📍 Lý trình QL: <b>${interpolatedLyTrinhText}</b><br>` +
                  `🔀 MX trước: <b>${prevMXFullInfo}</b><br>` +
                  `🔀 MX sau: <b>${nextMXFullInfo}</b><br>` +
                  `<a href='https://maps.google.com/?q=${targetLat},${targetLng}' target='_blank' class='btn-info' style='background:#0d6efd; color:white;'>🗺️ Dẫn đường GMaps</a>` +
                  shareButtonsHtml;
  
  faultMarker.bindPopup(popupHtml).openPopup();
  var panel = document.getElementById('control-panel');
  if (panel) panel.style.display = 'none';
  datLichTuXoaMarkerTimKiem();
}

function timLyTrinhBanDo() {
 
  var txt = document.getElementById('txtTimLyTrinh').value.trim();
  var parsedTarget = parseLyTrinhWithSuffix(txt);
  var targetMeters = parsedTarget ? parsedTarget.meters : null;
  
  if (targetMeters === null || isNaN(targetMeters)) {
    showToast("Sai định dạng lý trình! Vui lòng nhập theo mẫu: 54+100 hoặc km 54+100", "error");
    return;
  }
  
  var pts = getPointsCuaTuyenHienTai();
  if (pts.length < 2) {
    showToast("Vui lòng chọn tuyến cáp trước khi tìm kiếm!", "error");
    return;
  }

  var isNghichHuong = (pts.length >= 2 && pts[1].calculatedLyTrinhMeters < pts[0].calculatedLyTrinhMeters);
  var sortedPts = [...pts].sort((a, b) => isNghichHuong ? b.calculatedLyTrinhMeters - a.calculatedLyTrinhMeters : a.calculatedLyTrinhMeters - b.calculatedLyTrinhMeters);

  var targetSeg = null;
  var foundLat = null, foundLng = null, bestDescription = "";

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

  if (!targetSeg) {
    var closest = sortedPts.reduce((prev, curr) => Math.abs(curr.calculatedLyTrinhMeters - targetMeters) < Math.abs(prev.calculatedLyTrinhMeters - targetMeters) ? curr : prev);
    var deviationMeters = Math.abs(closest.calculatedLyTrinhMeters - targetMeters);
    if (deviationMeters > 100) {
      showToast(`Không tìm thấy vị trí lý trình ${txt} chính xác (Sai số quá ${Math.round(deviationMeters)}m).`, "error");
      return;
    }
    foundLat = closest.lat;
    foundLng = closest.lng;
    bestDescription = `Gần điểm mốc: ${closest.ten} (Sai số ~${Math.round(deviationMeters)}m)`;
  }

  var selectTuyen = document.getElementById('selectTuyen');
  var selectTram = document.getElementById('selectTram');
  var selectDoanCap = document.getElementById('selectDoanCap');
  
  var tuyenVal = selectTuyen ? selectTuyen.value : 'ALL';
  var tramVal = selectTram ? selectTram.value : 'ALL';
  var doanVal = selectDoanCap ? selectDoanCap.value : 'ALL';

  var distToA = getDistanceAlongRoute({lat: foundLat, lng: foundLng}, getMasterRouteBackbone(tuyenVal, tramVal, doanVal));
  var distStr = (distToA >= 1000) ? (distToA / 1000).toFixed(2) + " km" : Math.round(distToA) + " m";

  if (foundMarkerLayer) map.removeLayer(foundMarkerLayer);
  map.setView([foundLat, foundLng], 19, { animate: true });
  
  var markerHtml = '<div style="background:#fd7e14; color:white; width:28px; height:28px; border-radius:50%; text-align:center; line-height:28px; border:2px solid #fff; box-shadow:0 0 10px #fd7e14; font-size:14px;">📍</div>';
  foundMarkerLayer = L.marker([foundLat, foundLng], { icon: L.divIcon({ html: markerHtml, className: '', iconSize: [28, 28], iconAnchor: [14, 14] }) }).addTo(map);
  
  var popupContent = `<b>🔍 KẾT QUẢ TÌM LÝ TRÌNH: ${txt}</b><br>` +
                     `- Vị trí: <b>${bestDescription}</b><br>` +
                     `- Cự ly cáp tới Trạm TNN: <b>${distStr}</b><br>` ;
                     
  foundMarkerLayer.bindPopup(popupContent).openPopup();
  datLichTuXoaMarkerTimKiem();
  var panel = document.getElementById('control-panel');
  if (panel) panel.style.display = 'none';
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
