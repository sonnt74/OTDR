// data_2.js - Xử lý bắt sự kiện chọn Trạm, lọc chính xác danh sách Tuyến và Đoạn cáp

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
 * HÀM PHỤ TRỢ: Lấy giá trị ID dạng Chuỗi (String) an toàn tuyệt đối
 */
function safeGetId(item, keys) {
  if (!item) return '';
  for (let k of keys) {
    if (item[k] !== undefined && item[k] !== null) return String(item[k]).trim();
  }
  return '';
}

/**
 * 1. HÀM TẢI DỮ LIỆU BAN ĐẦU TỪ SUPABASE
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
    diemRes.forEach(d => diemMap[safeGetId(d, ['id_diem', 'id'])] = d);
    rawDoanCapList.forEach(dc => doanCapMap[safeGetId(dc, ['id_doan_cap', 'id'])] = dc);
    rawLoaiDiemList.forEach(l => loaiDiemMap[safeGetId(l, ['id_loaidiem', 'id'])] = l.ten_loaidiem);

    globalDataPoints = [];
    dcdRes.forEach(item => {
      var pt = diemMap[safeGetId(item, ['id_diem', 'diem_id'])];
      var dc = doanCapMap[safeGetId(item, ['id_doan_cap', 'doan_cap_id'])];
      if (!pt || isNaN(parseFloat(pt.lat))) return;
      var idLoai = pt.id_loaidiem || 1;
      var loaiName = loaiDiemMap[String(idLoai)] || 'Điểm';
      var isMx = (Number(idLoai) === 4 || loaiName.toLowerCase().includes('mx') || loaiName.toLowerCase().includes('măng xông'));
      
      globalDataPoints.push({
        id: safeGetId(pt, ['id_diem', 'id']), 
        ten: pt.ten_diem || pt.ten, 
        lat: parseFloat(pt.lat), 
        lng: parseFloat(pt.long || pt.lng),
        ghiChu: pt.ghi_chu || '', 
        idTuyen: dc ? safeGetId(dc, ['id_tuyen', 'tuyen_cap_id', 'id']) : null,
        idDoanCap: safeGetId(item, ['id_doan_cap', 'doan_cap_id']), 
        idTram: safeGetId(pt, ['id_tram', 'tram_id']), 
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

    khoiTaoComboDaiTheoPhanCap();

    if (forceRefresh) showToast("Đã làm mới dữ liệu!");
  } catch (err) { 
    showToast("Lỗi tải dữ liệu: " + err.message); 
  } finally { 
    hideLoading(); 
    if (map) map.invalidateSize(); 
  }
}

/**
 * 2. KHỞI TẠO COMBOBOX ĐÀI VÀ TRẠM
 */
function khoiTaoComboDaiTheoPhanCap() {
  var selectDai = document.getElementById('selectDai');
  var selectTram = document.getElementById('selectTram');

  if (selectDai) {
    selectDai.innerHTML = '<option value="ALL">-- Tất cả Đài --</option>';
    rawDaiList.forEach(d => {
      var dId = safeGetId(d, ['id_dai', 'id']);
      selectDai.innerHTML += `<option value="${dId}">${d.ten_dai || d.ten}</option>`;
    });
  }

  if (selectTram) {
    selectTram.innerHTML = '<option value="ALL">-- Tất cả Trạm --</option>';
    rawTramList.forEach(t => {
      var tId = safeGetId(t, ['id_tram', 'id']);
      selectTram.innerHTML += `<option value="${tId}">${t.ten_tram || t.ten}</option>`;
    });
  }

  // Tự động gán nếu có User phân quyền
  if (currentUser && currentUser.idTram && selectTram) {
    var userTramId = String(currentUser.idTram).trim();
    selectTram.value = userTramId;
  }

  onTramChange();
}

/**
 * 3. HÀM KHI CHỌN ĐÀI - LỌC TRẠM VÀ CẬP NHẬT TUYẾN
 */
function onDaiChange() {
  var selectDai = document.getElementById('selectDai');
  var daiVal = selectDai ? selectDai.value : 'ALL';
  var selectTram = document.getElementById('selectTram');

  AppStore.setState({ selectedDai: String(daiVal), selectedTram: 'ALL' });

  if (selectTram) {
    selectTram.innerHTML = '<option value="ALL">-- Tất cả Trạm --</option>';
    rawTramList.filter(tram => daiVal === 'ALL' || safeGetId(tram, ['id_dai', 'dai_id']) === String(daiVal))
               .forEach(tram => {
                 var tId = safeGetId(tram, ['id_tram', 'id']);
                 selectTram.innerHTML += `<option value="${tId}">${tram.ten_tram || tram.ten}</option>`;
               });
  }
  onTramChange();
}

/**
 * 4. HÀM XỬ LÝ KHI CHỌN TRẠM (ĐÃ KHẮC PHỤC LỖI KHÔNG HIỆN TUYẾN)
 */
function onTramChange() {
  var selectTram = document.getElementById('selectTram');
  var tramVal = selectTram ? String(selectTram.value).trim() : 'ALL';

  // Cập nhật Trạm vào AppStore
  AppStore.setState({ selectedTram: tramVal });

  // Gọi hàm lọc Tuyến theo Trạm
  updateTuyenOptions();
}

/**
 * 5. LỌC DANH SÁCH TUYẾN THEO TRẠM ĐÃ CHỌN
 */
function updateTuyenOptions() {
  var selectTuyen = document.getElementById('selectTuyen');
  var selectTram = document.getElementById('selectTram');
  if (!selectTuyen) return;

  var tramVal = selectTram ? String(selectTram.value).trim() : 'ALL';
  selectTuyen.innerHTML = '<option value="ALL">-- Chọn tuyến cáp --</option>';

  // Lọc lấy các Đoạn cáp thuộc Trạm đã chọn
  var matchedDoanList = rawDoanCapList;
  if (tramVal !== 'ALL') {
    matchedDoanList = rawDoanCapList.filter(d => safeGetId(d, ['id_tram', 'tram_id']) === tramVal);
  }

  // Lấy danh sách ID Tuyến duy nhất xuất hiện trong các Đoạn cáp này
  var allowedTuyenIds = [...new Set(matchedDoanList.map(d => safeGetId(d, ['id_tuyen', 'tuyen_cap_id'])))];

  // Lọc dữ liệu Tuyến cáp từ danh sách Tuyến gốc
  var filteredTuyenList = rawTuyenList.filter(t => allowedTuyenIds.includes(safeGetId(t, ['id_tuyen_cap', 'id'])));

  // Đổ Tuyến cáp vào thẻ <select id="selectTuyen">
  filteredTuyenList.forEach(tuyen => {
    var tuyenId = safeGetId(tuyen, ['id_tuyen_cap', 'id']);
    var tuyenMa = tuyen.ma_tuyencap || tuyen.ten_tuyen;
    selectTuyen.innerHTML += `<option value="${tuyenId}">${tuyenMa}</option>`;
  });

  // Tự động chọn Tuyến đầu tiên nếu có danh sách
  if (selectTuyen.options.length > 1) {
    selectTuyen.selectedIndex = 1;
  }

  // Gọi tiếp hàm cập nhật Đoạn cáp
  onTuyenChange();
}

/**
 * 6. LỌC ĐOẠN CÁP THEO TUYẾN ĐÃ CHỌN VÀ VẼ BẢN ĐỒ
 */
function onTuyenChange() {
  var selectTuyen = document.getElementById('selectTuyen');
  var tuyenVal = selectTuyen ? String(selectTuyen.value).trim() : 'ALL';
  var selectDoanCap = document.getElementById('selectDoanCap');
  
  AppStore.setState({ selectedTuyen: tuyenVal });

  if (selectDoanCap) {
    selectDoanCap.innerHTML = '<option value="ALL">-- Tất cả đoạn cáp --</option>';
    if (tuyenVal !== 'ALL') {
      var matchedDoan = rawDoanCapList.filter(d => safeGetId(d, ['id_tuyen', 'tuyen_cap_id']) === tuyenVal);

      matchedDoan.forEach(d => {
        var dId = safeGetId(d, ['id_doan_cap', 'id']);
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

// --- CÁC HÀM PHÂN TÍCH SỰ CỐ OTDR VÀ TÌM LÝ TRÌNH ---
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

/**
 * 7. MODULE VẼ ĐƯỜNG TUYẾN PHÂN MÀU VÀ MỐC HẠ TẦNG TRÊN BẢN ĐỒ
 */
var routeColoredLinesGroup = L.featureGroup();
var pointsMarkersLayer = L.featureGroup();

function getColorByLoaiDiem(loaiDiemStr, idLoaiDiem) {
  var str = (loaiDiemStr || '').toLowerCase();
  if (str.includes('bể') || str.includes('be') || idLoaiDiem == 2) return '#fd7e14'; // Cam (Bể)
  if (str.includes('mốc') || str.includes('moc') || idLoaiDiem == 3) return '#795548'; // Nâu (Mốc)
  if (str.includes('cột') || str.includes('cot') || idLoaiDiem == 1) return '#28a745'; // Xanh lá (Cột)
  if (str.includes('măng xông') || str.includes('mx') || idLoaiDiem == 4) return '#dc3545'; // Đỏ (MX)
  return '#007bff';
}

function createCustomMarkerIcon(loaiDiemStr, idLoaiDiem) {
  var color = getColorByLoaiDiem(loaiDiemStr, idLoaiDiem);
  var symbol = '📍';
  var str = (loaiDiemStr || '').toLowerCase();

  if (str.includes('bể') || str.includes('be') || idLoaiDiem == 2) symbol = '📦';
  else if (str.includes('mốc') || str.includes('moc') || idLoaiDiem == 3) symbol = '🧱';
  else if (str.includes('cột') || str.includes('cot') || idLoaiDiem == 1) symbol = '💈';
  else if (str.includes('măng xông') || str.includes('mx') || idLoaiDiem == 4) symbol = '⚡';

  var htmlContent = `<div style="
    background-color: ${color};
    color: white;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    text-align: center;
    line-height: 24px;
    border: 2px solid #ffffff;
    box-shadow: 0 0 4px rgba(0,0,0,0.5);
    font-size: 11px;
  ">${symbol}</div>`;

  return L.divIcon({
    html: htmlContent,
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
}

function renderColoredRouteOnMap() {
  var selectTuyen = document.getElementById('selectTuyen');
  var tuyenVal = selectTuyen ? selectTuyen.value : 'ALL';

  if (tuyenVal === 'ALL') {
    if (map.hasLayer(routeColoredLinesGroup)) routeColoredLinesGroup.clearLayers();
    if (map.hasLayer(pointsMarkersLayer)) pointsMarkersLayer.clearLayers();
    return;
  }

  var selectTram = document.getElementById('selectTram');
  var selectDoanCap = document.getElementById('selectDoanCap');
  var tramVal = selectTram ? selectTram.value : 'ALL';
  var doanVal = selectDoanCap ? selectDoanCap.value : 'ALL';
  
  var backbone = getMasterRouteBackbone(tuyenVal, tramVal, doanVal);
  if (!backbone || backbone.length < 2) return;

  if (!map.hasLayer(routeColoredLinesGroup)) routeColoredLinesGroup.addTo(map);
  if (!map.hasLayer(pointsMarkersLayer)) pointsMarkersLayer.addTo(map);

  routeColoredLinesGroup.clearLayers();
  pointsMarkersLayer.clearLayers();

  for (var i = 0; i < backbone.length - 1; i++) {
    var p1 = backbone[i];
    var p2 = backbone[i + 1];

    if (p1.lat && p1.lng && p2.lat && p2.lng) {
      var lineColor = getColorByLoaiDiem(p1.loai || p1.loaiDiem, p1.idLoaiDiem);
      var segment = L.polyline(
        [[p1.lat, p1.lng], [p2.lat, p2.lng]],
        { color: lineColor, weight: 5, opacity: 0.85, lineJoin: 'round' }
      );
      var popupText = `<b>Đoạn cáp: ${p1.ten || p1.tenDiem} ➔ ${p2.ten || p2.tenDiem}</b><br>` +
                      `- Phân loại: <b>${p1.loai || p1.loaiDiem}</b><br>` +
                      `- Lý trình: <b>${p1.lyTrinh || '0+000'}</b>`;
      segment.bindPopup(popupText);
      routeColoredLinesGroup.addLayer(segment);
    }
  }

  backbone.forEach(function(pt) {
    if (pt.lat && pt.lng) {
      var icon = createCustomMarkerIcon(pt.loai || pt.loaiDiem, pt.idLoaiDiem);
      var marker = L.marker([pt.lat, pt.lng], { icon: icon });
      var markerPopup = `<b>📌 ${pt.ten || pt.tenDiem}</b><br>` +
                        `- Loại điểm: <b>${pt.loai || pt.loaiDiem}</b><br>` +
                        `- Lý trình: <b>${pt.lyTrinh || 'N/A'}</b><br>` +
                        `- Dự trữ cáp: <b>${pt.duTru || 0} m</b>`;
      marker.bindPopup(markerPopup);
      pointsMarkersLayer.addLayer(marker);
    }
  });

  try {
    map.fitBounds(routeColoredLinesGroup.getBounds(), { padding: [40, 40] });
  } catch(e) {}
}

function veLaiTuyenAB() {
  renderColoredRouteOnMap();
}
