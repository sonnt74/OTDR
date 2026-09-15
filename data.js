// data_2.js - Xử lý phân quyền currentUser chuẩn xác kết hợp bộ lọc Tuyến/Đoạn 2 lớp an toàn

async function fetchAllRowsSafe(tableName) {
  let size = 1000, from = 0, allData = [], keep = true;
  while (keep) {
    let { data, error } = await supabaseClient.from(tableName).select('*').range(from, from + size - 1);
    if (error) throw error;
    if (data && data.length > 0) { allData = allData.concat(data); if (data.length < size) keep = false; else from += size; } else keep = false;
  }
  return allData;
}

/**
 * HÀM PHỤ TRỢ: Lấy ID dạng Chuỗi (String) an toàn từ đối tượng
 */
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
 * 1. HÀM TẢI DỮ LIỆU BAN ĐẦU TỪ SUPABASE VÀO APPSTORE
 */
async function taiDuLieuSupabase(forceRefresh = false) {
  showLoading("Đang tải dữ liệu...");
  try {
    let [daiRes, tramRes, tuyenRes, doanRes, diemRes, dcdRes, loaiRes] = await Promise.all([
      supabaseClient.from('dai_vt').select('*'), 
      supabaseClient.from('tram_vt').select('*'),
      supabaseClient.from('tuyen_cap').select('*'), 
      supabaseClient.from('doan_cap').select('*'),
      fetchAllRowsSafe('diem_ha_tang'), 
      fetchAllRowsSafe('doan_cap_diem'), 
      supabaseClient.from('loai_diem').select('*')
    ]);
    
    rawDaiList = daiRes.data || []; 
    rawTramList = tramRes.data || []; 
    rawTuyenList = tuyenRes.data || [];
    rawDoanCapList = doanRes.data || []; 
    rawLoaiDiemList = loaiRes.data || [];
    
    var diemMap = {}, doanCapMap = {}, loaiDiemMap = {};
    diemRes.forEach(d => diemMap[getSafeStrId(d, ['id_diem', 'id'])] = d);
    rawDoanCapList.forEach(dc => doanCapMap[getSafeStrId(dc, ['id_doan_cap', 'id'])] = dc);
    rawLoaiDiemList.forEach(l => loaiDiemMap[getSafeStrId(l, ['id_loaidiem', 'id'])] = l.ten_loaidiem);

    globalDataPoints = [];
    dcdRes.forEach(item => {
      var pt = diemMap[getSafeStrId(item, ['id_diem', 'diem_id'])];
      var dc = doanCapMap[getSafeStrId(item, ['id_doan_cap', 'doan_cap_id'])];
      if (!pt || isNaN(parseFloat(pt.lat))) return;
      var idLoai = pt.id_loaidiem || 1;
      var loaiName = loaiDiemMap[String(idLoai)] || 'Điểm';
      var isMx = (Number(idLoai) === 4 || loaiName.toLowerCase().includes('mx') || loaiName.toLowerCase().includes('măng xông'));
      
      globalDataPoints.push({
        id: getSafeStrId(pt, ['id_diem', 'id']), 
        ten: pt.ten_diem || pt.ten, 
        lat: parseFloat(pt.lat), 
        lng: parseFloat(pt.long || pt.lng),
        ghiChu: pt.ghi_chu || '', 
        idTuyen: dc ? getSafeStrId(dc, ['id_tuyen', 'tuyen_cap_id', 'id_tuyen_cap', 'id']) : null,
        idDoanCap: getSafeStrId(item, ['id_doan_cap', 'doan_cap_id']), 
        idTram: getSafeStrId(pt, ['id_tram', 'tram_id']), 
        idLoaiDiem: idLoai,
        loai: loaiName, 
        lyTrinh: pt.ly_trinh || '', 
        duTru: pt.du_tru ? parseFloat(pt.du_tru) : 0, 
        stt: isMx ? 9999 : (item.thu_tu || 1)
      });
    });

    AppStore.setState({
      daiList: rawDaiList,
      tramList: rawTramList,
      tuyenList: rawTuyenList,
      doanCapList: rawDoanCapList,
      dataPoints: globalDataPoints
    });

    // KÍCH HOẠT LUỒNG PHÂN QUYỀN THEO CURRENTUSER
    xuLyPhanQuyenDoanTuyenUser();

    if (forceRefresh) showToast("Đã làm mới dữ liệu!");
  } catch (err) { 
    showToast("Lỗi tải dữ liệu: " + err.message); 
  } finally { 
    hideLoading(); 
    if (map) map.invalidateSize(); 
  }
}

/**
 * 2. LUỒNG XỬ LÝ PHÂN QUYỀN NGUỜI DÙNG (CURRENTUSER)
 */
function xuLyPhanQuyenDoanTuyenUser() {
  var selectDai = document.getElementById('selectDai');
  var groupDai = selectDai ? selectDai.closest('.form-group') : null;
  var selectTram = document.getElementById('selectTram');
  var groupTram = selectTram ? selectTram.closest('.form-group') : null;

  var userRole = (typeof currentUser !== 'undefined' && currentUser.role) ? currentUser.role : '';
  var userDaiId = currentUser ? getSafeStrId(currentUser, ['idDai', 'id_dai']) : '';
  var userTramId = currentUser ? getSafeStrId(currentUser, ['idTram', 'id_tram']) : '';

  // 1. NẠP DỮ LIỆU ĐÀI
  if (selectDai) {
    selectDai.innerHTML = '<option value="ALL">-- Tất cả Đài --</option>';
    rawDaiList.forEach(d => {
      var dId = getSafeStrId(d, ['id_dai', 'id']);
      selectDai.innerHTML += `<option value="${dId}">${d.ten_dai || d.ten}</option>`;
    });
  }

  // 2. NẠP DỮ LIỆU TRẠM
  if (selectTram) {
    selectTram.innerHTML = '<option value="ALL">-- Tất cả Trạm --</option>';
    rawTramList.forEach(t => {
      var tId = getSafeStrId(t, ['id_tram', 'id']);
      selectTram.innerHTML += `<option value="${tId}">${t.ten_tram || t.ten}</option>`;
    });
  }

  var selectedDaiVal = 'ALL';
  var selectedTramVal = 'ALL';

  // 3. XỬ LÝ THEO VAI TRÒ (ROLE)
  if (userRole === 'tram_admin' || userRole === 'member' || userRole === 'tram_user') {
    // Nhân viên / Admin Trạm: Ẩn ComboBox Đài và Trạm
    if (groupDai) groupDai.style.display = 'none';
    if (groupTram) groupTram.style.display = 'none';

    if (userTramId) {
      selectedTramVal = userTramId;
      var matchedTram = rawTramList.find(t => getSafeStrId(t, ['id_tram', 'id']) === userTramId);
      if (matchedTram) selectedDaiVal = getSafeStrId(matchedTram, ['id_dai', 'dai_id']);

      if (selectTram) selectTram.value = selectedTramVal;
      if (selectDai) selectDai.value = selectedDaiVal;
    }
  } else if (userRole === 'dai_admin') {
    // Admin Đài: Khóa cứng Đài, chỉ nạp Trạm thuộc Đài
    if (groupDai) groupDai.style.display = 'block';
    if (groupTram) groupTram.style.display = 'block';

    if (userDaiId) {
      selectedDaiVal = userDaiId;
      if (selectDai) {
        selectDai.value = selectedDaiVal;
        selectDai.disabled = true;
      }

      if (selectTram) {
        selectTram.innerHTML = '<option value="ALL">-- Tất cả Trạm --</option>';
        rawTramList.filter(t => getSafeStrId(t, ['id_dai', 'dai_id']) === userDaiId)
                  .forEach(t => {
                    var tId = getSafeStrId(t, ['id_tram', 'id']);
                    selectTram.innerHTML += `<option value="${tId}">${t.ten_tram || t.ten}</option>`;
                  });
      }
    }
  } else {
    // Sys Admin hoặc chưa đăng nhập: Mở toàn bộ
    if (groupDai) { groupDai.style.display = 'block'; if (selectDai) selectDai.disabled = false; }
    if (groupTram) { groupTram.style.display = 'block'; if (selectTram) selectTram.disabled = false; }
  }

  // ĐỒNG BỘ TRẠNG THÁI APPSTORE DUY NHẤT 1 LẦN
  AppStore.setState({
    selectedDai: selectedDaiVal,
    selectedTram: selectedTramVal
  });

  // KÍCH HOẠT LỌC TUYẾN
  updateTuyenOptions();
}

/**
 * 3. HÀM CHỌN ĐÀI
 */
function onDaiChange() {
  var selectDai = document.getElementById('selectDai');
  var daiVal = selectDai ? selectDai.value : 'ALL';
  var selectTram = document.getElementById('selectTram');

  AppStore.setState({ selectedDai: String(daiVal), selectedTram: 'ALL' });

  var state = AppStore.getState();
  var tramList = state.tramList || rawTramList;

  if (selectTram) {
    selectTram.innerHTML = '<option value="ALL">-- Tất cả Trạm --</option>';
    tramList.filter(t => daiVal === 'ALL' || getSafeStrId(t, ['id_dai', 'dai_id']) === String(daiVal))
            .forEach(t => {
              var tId = getSafeStrId(t, ['id_tram', 'id']);
              selectTram.innerHTML += `<option value="${tId}">${t.ten_tram || t.ten}</option>`;
            });
    selectTram.value = 'ALL';
  }

  onTramChange();
}

/**
 * 4. HÀM CHỌN TRẠM
 */
function onTramChange() {
  var selectTram = document.getElementById('selectTram');
  var tramVal = selectTram ? String(selectTram.value).trim() : 'ALL';

  AppStore.setState({ selectedTram: tramVal });
  updateTuyenOptions();
}

/**
 * 5. HÀM LỌC TUYẾN CÁP 2 LỚP VỚI BỘ LỌC PHÂN QUYỀN
 */
function updateTuyenOptions() {
  var selectTuyen = document.getElementById('selectTuyen');
  var selectTram = document.getElementById('selectTram');
  if (!selectTuyen) return;

  var tramVal = selectTram ? String(selectTram.value).trim() : 'ALL';
  var state = AppStore.getState();
  
  var doanCapList = state.doanCapList || rawDoanCapList;
  var tuyenList = state.tuyenList || rawTuyenList;
  var dataPoints = state.dataPoints || globalDataPoints;

  var allowedTuyenIds = [];

  if (tramVal === 'ALL') {
    allowedTuyenIds = tuyenList.map(t => getSafeStrId(t, ['id_tuyen_cap', 'id_tuyen', 'id']));
  } else {
    // LỚP 1: Lọc qua doanCapList
    var matchedDoan = doanCapList.filter(d => {
      var tramIdInDoan = getSafeStrId(d, ['id_tram', 'tram_id', 'id_tram_vt', 'id_diem_a', 'id_diem_b']);
      return tramIdInDoan === tramVal;
    });

    allowedTuyenIds = [...new Set(matchedDoan.map(d => getSafeStrId(d, ['id_tuyen', 'tuyen_cap_id', 'id_tuyen_cap'])))];

    // LỚP 2: Lọc qua dataPoints nếu Lớp 1 rỗng
    if (allowedTuyenIds.length === 0 && dataPoints.length > 0) {
      var matchedPoints = dataPoints.filter(p => String(p.idTram).trim() === tramVal);
      allowedTuyenIds = [...new Set(matchedPoints.map(p => String(p.idTuyen).trim()))];
    }
  }

  var filteredTuyenList = tuyenList.filter(t => {
    if (tramVal === 'ALL') return true;
    var tId = getSafeStrId(t, ['id_tuyen_cap', 'id_tuyen', 'id']);
    return allowedTuyenIds.includes(tId);
  });

  selectTuyen.innerHTML = '<option value="ALL">-- Chọn tuyến cáp --</option>';
  filteredTuyenList.forEach(t => {
    var tuyenId = getSafeStrId(t, ['id_tuyen_cap', 'id_tuyen', 'id']);
    var tuyenMa = t.ma_tuyencap || t.ten_tuyen || t.ten || ("Tuyến " + tuyenId);
    selectTuyen.innerHTML += `<option value="${tuyenId}">${tuyenMa}</option>`;
  });

  // Tự động chọn Tuyến đầu tiên thuộc phân quyền
  if (selectTuyen.options.length > 1) {
    selectTuyen.selectedIndex = 1;
  }

  onTuyenChange();
}

/**
 * 6. HÀM CHỌN TUYẾN CÁP - LỌC ĐOẠN CÁP VÀ VẼ BẢN ĐỒ GIS
 */
function onTuyenChange() {
  var selectTuyen = document.getElementById('selectTuyen');
  var tuyenVal = selectTuyen ? String(selectTuyen.value).trim() : 'ALL';
  var selectDoanCap = document.getElementById('selectDoanCap');
  
  AppStore.setState({ selectedTuyen: tuyenVal });

  var state = AppStore.getState();
  var doanCapList = state.doanCapList || rawDoanCapList;

  if (selectDoanCap) {
    selectDoanCap.innerHTML = '<option value="ALL">-- Tất cả đoạn cáp --</option>';
    if (tuyenVal !== 'ALL') {
      var matchedDoan = doanCapList.filter(d => getSafeStrId(d, ['id_tuyen', 'tuyen_cap_id', 'id_tuyen_cap']) === tuyenVal);

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

  capNhatComboDiemA();
  veLaiTuyenAB();
}

function onDoanCapChange() { 
  var selectDoanCap = document.getElementById('selectDoanCap');
  var doanVal = selectDoanCap ? String(selectDoanCap.value).trim() : 'ALL';
  AppStore.setState({ selectedDoanCap: doanVal });
  veLaiTuyenAB(); 
}

function onDiemAChange() { 
  veLaiTuyenAB(); 
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

// --- CÁC HÀM OTDR VÀ TÌM LÝ TRÌNH ---
function chiaSeSuCo(lat, lng, khoangCachKm, prevMX, nextMX, shareType) {
  var message = `[TNN NET1] THÔNG BÁO SỰ CỐ CÁP QUANG\n- Tọa độ: ${lat}, ${lng}\n- Cự ly đo OTDR: ${khoangCachKm} km\n- Vị trí: Nằm giữa [${prevMX}] và [${nextMX}]\n- Bản đồ: https://maps.google.com/?q=${lat},${lng}`;
  var encoded = encodeURIComponent(message);
  if (shareType === 'copy') { navigator.clipboard.writeText(message); showToast("Đã sao chép nội dung!"); }
  else if (shareType === 'sms') window.open(`sms:?&body=${encoded}`, '_blank');
  else if (shareType === 'viber') window.open(`viber://forward?text=${encoded}`, '_blank');
}

function timViTriDut() {
  var kcOtdrKm = parseFloat(document.getElementById('txtKcOtdr').value), kcOtdrMeters = kcOtdrKm * 1000; 
  if (isNaN(kcOtdrMeters) || kcOtdrMeters <= 0) { showToast("Nhập cự ly đo hợp lệ!"); return; }
  
  var tuyenVal = document.getElementById('selectTuyen').value;
  var tramVal = document.getElementById('selectTram') ? document.getElementById('selectTram').value : 'ALL';
  var doanVal = document.getElementById('selectDoanCap').value;
  var backbone = getMasterRouteBackbone(tuyenVal, tramVal, doanVal);
  precalculateRouteDataForPoints(backbone, backbone);

  if (backbone.length < 2) { showToast("Tuyến cáp chưa đủ dữ liệu!"); return; }

  var routeStops = [];
  backbone.forEach(p => routeStops.push({ pt: p, dist: p.distanceFromAMeters, duTru: p.duTru || 0, isMX: isMangXong(p) }));
  routeStops.sort((a, b) => a.dist - b.dist);

  var targetLat = backbone[backbone.length - 1].lat, targetLng = backbone[backbone.length - 1].lng;
  var closestPrevMX = "Chưa xác định", closestNextMX = "Chưa xác định";
  var interpolatedLyTrinhText = "Đang xác định...";

  for (var i = 0; i < routeStops.length - 1; i++) {
    if (routeStops[i].isMX) closestPrevMX = routeStops[i].pt.ten;
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

      for (var j = i + 1; j < routeStops.length; j++) { if (routeStops[j].isMX) { closestNextMX = routeStops[j].pt.ten; break; } }
      break;
    }
  }

  if (foundMarkerLayer) map.removeLayer(foundMarkerLayer);
  map.setView([targetLat, targetLng], 19, { animate: true });
  
  var faultIcon = L.divIcon({ html: '<div style="background:red; color:white; width:28px; height:28px; border-radius:50%; text-align:center; line-height:28px; border:2px solid #fff; box-shadow:0 0 10px red;">⚡</div>', iconSize: [28, 28] });
  var faultMarker = L.marker([targetLat, targetLng], { icon: faultIcon }).addTo(map);
  foundMarkerLayer = faultMarker;

  var shareButtons = `<div style="margin-top: 8px; border-top: 1px dashed #ccc; padding-top: 6px;"><b>Chia sẻ sự cố:</b><br><button class="btn-info" onclick="chiaSeSuCo(${targetLat.toFixed(6)}, ${targetLng.toFixed(6)}, ${kcOtdrKm.toFixed(2)}, '${closestPrevMX}', '${closestNextMX}', 'copy')">📋 Copy</button><button class="btn-info" onclick="chiaSeSuCo(${targetLat.toFixed(6)}, ${targetLng.toFixed(6)}, ${kcOtdrKm.toFixed(2)}, '${closestPrevMX}', '${closestNextMX}', 'sms')" style="background:#28a745; color:white;">📩 SMS</button><button class="btn-info" onclick="chiaSeSuCo(${targetLat.toFixed(6)}, ${targetLng.toFixed(6)}, ${kcOtdrKm.toFixed(2)}, '${closestPrevMX}', '${closestNextMX}', 'viber')" style="background:#6f42c1; color:white;">📱 Viber</button></div>`;
  
  var popupHtml = `<b>⚡ VỊ TRÍ SỰ CỐ OTDR</b><br>` +
                  `Cự ly đo: <b>${kcOtdrKm.toFixed(2)} km</b><br>` +
                  `📍 Lý trình QL: <b>${interpolatedLyTrinhText}</b><br>` +
                  `MX trước: <b>${closestPrevMX}</b><br>` +
                  `MX sau: <b>${closestNextMX}</b><br>` +
                  `<a href='https://maps.google.com/?q=${targetLat},${targetLng}' target='_blank' class='gmaps-btn'>🗺️ Dẫn đường</a>${shareButtons}`;
  
  faultMarker.bindPopup(popupHtml).openPopup();
}

function timLyTrinhBanDo() {
  var txt = document.getElementById('txtTimLyTrinh').value.trim();
  var parsedTarget = parseLyTrinhWithSuffix(txt);
  var targetMeters = parsedTarget ? parsedTarget.meters : null;
  
  if (targetMeters === null || isNaN(targetMeters)) {
    showToast("Sai định dạng lý trình! Vui lòng nhập theo mẫu: 54+100 hoặc km 54+100");
    return;
  }
  
  var pts = getPointsCuaTuyenHienTai();
  if (pts.length < 2) {
    showToast("Vui lòng chọn tuyến cáp trước khi tìm kiếm!");
    return;
  }

  var isNghichHuong = false;
  if (pts.length >= 2) {
    if (pts[1].calculatedLyTrinhMeters < pts[0].calculatedLyTrinhMeters) {
      isNghichHuong = true; 
    }
  }

  var sortedPts = [...pts].sort((a, b) => {
    return isNghichHuong 
      ? b.calculatedLyTrinhMeters - a.calculatedLyTrinhMeters 
      : a.calculatedLyTrinhMeters - b.calculatedLyTrinhMeters;
  });

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
    var closest = sortedPts.reduce((prev, curr) => 
      Math.abs(curr.calculatedLyTrinhMeters - targetMeters) < Math.abs(prev.calculatedLyTrinhMeters - targetMeters) ? curr : prev
    );
    
    var deviationMeters = Math.abs(closest.calculatedLyTrinhMeters - targetMeters);
    if (deviationMeters > 100) {
      showToast(`Không tìm thấy vị trí lý trình ${txt} chính xác (Sai số quá ${Math.round(deviationMeters)}m so với mốc gần nhất ${closest.ten}). Vui lòng kiểm tra lại mốc neo!`);
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
                     `- Cự ly cáp tới Trạm TNN: <b>${distStr}</b><br>` +
                     `🏛️ Địa chỉ: <span id='lt-addr'>Đang tra cứu tọa độ...</span>`;
                     
  foundMarkerLayer.bindPopup(popupContent).openPopup();
  
  fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${foundLat}&lon=${foundLng}&accept-language=vi`)
    .then(r => r.json())
    .then(data => {
      var addressText = data.display_name || "Không rõ địa chỉ chi tiết";
      foundMarkerLayer.setPopupContent(popupContent.replace("Đang tra cứu tọa độ...", addressText));
    })
    .catch(() => {
      foundMarkerLayer.setPopupContent(popupContent.replace("Đang tra cứu tọa độ...", "Không thể kết nối dịch vụ địa danh"));
    });
}

function veLaiTuyenAB() {
  if (!map) return;
  markersLayer.clearLayers(); mxLayer.clearLayers(); polylinesLayer.clearLayers();
  var tuyenVal = document.getElementById('selectTuyen').value, tramVal = document.getElementById('selectTram').value, doanVal = document.getElementById('selectDoanCap').value;
  if (tuyenVal === 'ALL') return;

  var backbone = getMasterRouteBackbone(tuyenVal, tramVal, doanVal);
  precalculateRouteDataForPoints(backbone, backbone);

  var pts = getPointsCuaTuyenHienTai();
  if (pts.length === 0) return;
  
  var bounds = [];
  var isDraggable = (currentUser.canEditMap || currentUser.role === 'sys_admin');

  function taoNutHanhDong(id, ten, lat, lng) {
    return isDraggable ? `<hr style="margin:4px 0;"><button class="btn-small" onclick="moFormCrud('EDIT','${id}','${ten}',${lat},${lng})">âœï¸ Sá»­a TÃªn</button><button class="btn-small del" onclick="moFormCrud('DELETE','${id}','${ten}',${lat},${lng})">ðŸ—‘ï¸ XÃ³a</button>` : '';
  }

  async function handleDragEnd(e, ptObj) {
    var newPos = e.target.getLatLng();
    
    var isConfirmed = await showConfirmDialog(`Báº¡n cÃ³ cháº¯c cháº¯n muá»‘n lÆ°u tá»a Ä‘á»™ má»›i cho Ä‘iá»ƒm [${ptObj.ten}] khÃ´ng?`);
    
    if (isConfirmed) {
      showLoading("Äang lÆ°u tá»a Ä‘á»™...");
      try {
        // 1. LÆ°u dá»¯ liá»‡u xuá»‘ng Supabase
        const { error } = await supabaseClient.from('diem_ha_tang').update({ lat: newPos.lat, long: newPos.lng }).eq('id_diem', ptObj.id);
        if (error) throw error;
        
        // 2. Cáº­p nháº­t trá»±c tiáº¿p trong bá»™ nhá»› RAM (globalDataPoints)
        var localPt = globalDataPoints.find(p => p.id == ptObj.id);
        if (localPt) {
          localPt.lat = newPos.lat;
          localPt.lng = newPos.lng;
        }
        
        hideLoading();
        showToast("ÄÃ£ lÆ°u vÃ  cáº­p nháº­t tá»a Ä‘á»™ thÃ nh cÃ´ng!", "success");
        
        // 3. Váº½ láº¡i báº£n Ä‘á»“ vÃ  Zoom trá»ng tÃ¢m tá»›i Ä‘iá»ƒm vá»«a kÃ©o tháº£
        veLaiTuyenAB();
        map.setView([newPos.lat, newPos.lng], 19, { animate: true });
        
      } catch (err) { 
        showToast("Lá»—i: " + err.message, "error"); 
        hideLoading(); 
        e.target.setLatLng([ptObj.lat, ptObj.lng]); 
      }
    } else { 
      e.target.setLatLng([ptObj.lat, ptObj.lng]); 
    }
  }

  pts.forEach((pt, index) => {
    bounds.push([pt.lat, pt.lng]);
    var iconHtml = (index === 0) ? '<div class="point-a-marker">A</div>' : '<div class="standard-marker"></div>';
    var marker = L.marker([pt.lat, pt.lng], { icon: L.divIcon({ className: '', html: iconHtml, iconSize: [26, 26], iconAnchor: [13, 13] }), draggable: isDraggable });
    
    var popupHtml = `<b>${pt.ten}</b><br>` +
                    `Loáº¡i: ${pt.loai}<br>` +
                    `ðŸ“ LÃ½ trÃ¬nh QL: <b>${pt.calculatedLyTrinhText}</b><br>` +
                    `ðŸ“ Cá»± ly tá»« Tráº¡m A: <b>${pt.distanceFromAText}</b>` + 
                    taoNutHanhDong(pt.id, pt.ten, pt.lat, pt.lng);

    marker.bindPopup(popupHtml);
    marker.on('dragend', e => handleDragEnd(e, pt));
    markersLayer.addLayer(marker);
  });

  var mxList = backbone.filter(p => isMangXong(p));
  mxList.forEach(mx => {
    bounds.push([mx.lat, mx.lng]);
    var mxMarker = L.marker([mx.lat, mx.lng], { icon: L.divIcon({ className: '', html: '<div class="mx-marker"></div>', iconSize: [12, 12], iconAnchor: [6, 6] }), draggable: isDraggable });
    var ghiChuBtn = `<button class="btn-small" style="background:#198754; margin-top:4px;" onclick="suaGhiChu('${mx.id}', '${mx.ghiChu}')">ðŸ“ Ghi chÃº</button>`;
    
    var popupHtml = `<b>${mx.ten}</b><br>` +
                    `ðŸ“ LÃ½ trÃ¬nh QL: <b>${mx.calculatedLyTrinhText}</b><br>` +
                    `ðŸ“ Cá»± ly tá»« Tráº¡m A: <b>${mx.distanceFromAText}</b><br>` +
                    taoNutHanhDong(mx.id, mx.ten, mx.lat, mx.lng) + ghiChuBtn;

    mxMarker.bindPopup(popupHtml);
    mxMarker.on('dragend', e => handleDragEnd(e, mx));
    mxLayer.addLayer(mxMarker);
  });

  var lineCoordinates = backbone.map(p => [p.lat, p.lng]);
  if (lineCoordinates.length > 1) polylinesLayer.addLayer(L.polyline(lineCoordinates, { color: '#0d6efd', weight: 3 }));
  if (bounds.length > 0) map.fitBounds(bounds, { padding: [40, 40] });
}
window.veLaiTuyenAB = veLaiTuyenAB;
