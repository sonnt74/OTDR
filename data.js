// data_2.js - Bổ sung nút Xóa Maps, tự xóa Marker sự cố sau 30s và phân quyền hệ thống

var autoClearMarkerTimer = null; // Biến lưu bộ đếm thời gian 30s

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
 * 1. TẢI DỮ LIỆU TỪ SUPABASE VÀO APPSTORE
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
 * 2. PHÂN QUYỀN GIAO DIỆN THEO CURRENTUSER
 */
function xuLyPhanQuyenDoanTuyenUser() {
  var selectDai = document.getElementById('selectDai');
  var groupDai = selectDai ? selectDai.closest('.form-group') : null;
  var selectTram = document.getElementById('selectTram');
  var groupTram = selectTram ? selectTram.closest('.form-group') : null;

  var userRole = (typeof currentUser !== 'undefined' && currentUser.role) ? currentUser.role : '';
  var userDaiId = currentUser ? getSafeStrId(currentUser, ['idDai', 'id_dai']) : '';
  var userTramId = currentUser ? getSafeStrId(currentUser, ['idTram', 'id_tram']) : '';

  if (selectDai) {
    selectDai.innerHTML = '<option value="ALL">-- Tất cả Đài --</option>';
    rawDaiList.forEach(d => {
      var dId = getSafeStrId(d, ['id_dai', 'id']);
      selectDai.innerHTML += `<option value="${dId}">${d.ten_dai || d.ten}</option>`;
    });
  }

  if (selectTram) {
    selectTram.innerHTML = '<option value="ALL">-- Tất cả Trạm --</option>';
    rawTramList.forEach(t => {
      var tId = getSafeStrId(t, ['id_tram', 'id']);
      selectTram.innerHTML += `<option value="${tId}">${t.ten_tram || t.ten}</option>`;
    });
  }

  var selectedDaiVal = 'ALL';
  var selectedTramVal = 'ALL';

  if (userRole === 'tram_admin' || userRole === 'member' || userRole === 'tram_user') {
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
    if (groupDai) { groupDai.style.display = 'block'; if (selectDai) selectDai.disabled = false; }
    if (groupTram) { groupTram.style.display = 'block'; if (selectTram) selectTram.disabled = false; }
  }

  AppStore.setState({
    selectedDai: selectedDaiVal,
    selectedTram: selectedTramVal
  });

  updateTuyenOptions();
}

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
  
  var doanCapList = state.doanCapList || rawDoanCapList;
  var tuyenList = state.tuyenList || rawTuyenList;
  var dataPoints = state.dataPoints || globalDataPoints;

  var allowedTuyenIds = [];

  if (tramVal === 'ALL') {
    allowedTuyenIds = tuyenList.map(t => getSafeStrId(t, ['id_tuyen_cap', 'id_tuyen', 'id']));
  } else {
    var matchedDoan = doanCapList.filter(d => {
      var tramIdInDoan = getSafeStrId(d, ['id_tram', 'tram_id', 'id_tram_vt', 'id_diem_a', 'id_diem_b']);
      return tramIdInDoan === tramVal;
    });

    allowedTuyenIds = [...new Set(matchedDoan.map(d => getSafeStrId(d, ['id_tuyen', 'tuyen_cap_id', 'id_tuyen_cap'])))];

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

  if (selectTuyen.options.length > 1) {
    selectTuyen.selectedIndex = 1;
  }

  onTuyenChange();
}

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

/**
 * 3. HÀM TỰ ĐỘNG XÓA MARKER ĐIỂM TÌM KIẾM SAU 30 GIÂY
 */
function datLichTuXoaMarkerTimKiem() {
  if (autoClearMarkerTimer) {
    clearTimeout(autoClearMarkerTimer);
  }

  autoClearMarkerTimer = setTimeout(function() {
    if (typeof foundMarkerLayer !== 'undefined' && foundMarkerLayer && map) {
      map.removeLayer(foundMarkerLayer);
      foundMarkerLayer = null;
      showToast("⏱️ Đã tự động xóa mốc tìm kiếm (Sau 30s)");
    }
  }, 30000); // 30,000 milliseconds = 30 giây
}

/**
 * 4. TÌM VỊ TRÍ ĐỨT OTDR (CÓ TỰ XÓA SAU 30S)
 */
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

  var popupHtml = `<b>⚡ VỊ TRÍ SỰ CỐ OTDR</b><br>` +
                  `Cự ly đo: <b>${kcOtdrKm.toFixed(2)} km</b><br>` +
                  `📍 Lý trình QL: <b>${interpolatedLyTrinhText}</b><br>` +
                  `MX trước: <b>${closestPrevMX}</b><br>` +
                  `MX sau: <b>${closestNextMX}</b><br>` +
                  `<small style="color:red;">⏱️ Điểm này sẽ tự xóa sau 30 giây</small><br>` +
                  `<a href='https://maps.google.com/?q=${targetLat},${targetLng}' target='_blank' class='gmaps-btn'>🗺️ Dẫn đường</a>`;
  
  faultMarker.bindPopup(popupHtml).openPopup();

  // KÍCH HOẠT ĐẾM GIỜ 30S TỰ XÓA
  datLichTuXoaMarkerTimKiem();
}

/**
 * 5. TÌM LÝ TRÌNH TRÊN BẢN ĐỒ (CÓ TỰ XÓA SAU 30S)
 */
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
                     `<small style="color:red;">⏱️ Điểm này sẽ tự xóa sau 30 giây</small>`;
                     
  foundMarkerLayer.bindPopup(popupContent).openPopup();

  // KÍCH HOẠT ĐẾM GIỜ 30S TỰ XÓA
  datLichTuXoaMarkerTimKiem();
}

/**
 * 6. HÀM NÚT "XÓA MAPS": XÓA SẠCH TẤT CẢ ĐỐI TƯỢNG VẼ VÀ MARKER TRÊN BẢN ĐỒ
 */
function xoaTatCaDoiTuongMap() {
  // 1. Xóa đường vẽ phân màu tuyến cáp
  if (typeof routeColoredLinesGroup !== 'undefined' && routeColoredLinesGroup) {
    routeColoredLinesGroup.clearLayers();
  }

  // 2. Xóa các điểm mốc hạ tầng (bể, mốc, cột, măng xông)
  if (typeof pointsMarkersLayer !== 'undefined' && pointsMarkersLayer) {
    pointsMarkersLayer.clearLayers();
  }

  // 3. Xóa điểm marker tìm kiếm (OTDR / Lý trình)
  if (typeof foundMarkerLayer !== 'undefined' && foundMarkerLayer && map) {
    map.removeLayer(foundMarkerLayer);
    foundMarkerLayer = null;
  }

  // 4. Hủy bộ đếm giờ tự xóa nếu đang chạy
  if (autoClearMarkerTimer) {
    clearTimeout(autoClearMarkerTimer);
    autoClearMarkerTimer = null;
  }

  showToast("🧹 Đã xóa sạch tất cả đối tượng trên bản đồ!");
}

/**
 * 7. VẼ NỀN ĐƯỜNG TUYẾN PHÂN MÀU VÀ MỐC HẠ TẦNG
 */
var routeColoredLinesGroup = L.featureGroup();
var pointsMarkersLayer = L.featureGroup();

function getColorByLoaiDiem(loaiDiemStr, idLoaiDiem) {
  var str = (loaiDiemStr || '').toLowerCase();
  if (str.includes('bể') || str.includes('be') || idLoaiDiem == 2) return '#fd7e14';
  if (str.includes('mốc') || str.includes('moc') || idLoaiDiem == 3) return '#795548';
  if (str.includes('cột') || str.includes('cot') || idLoaiDiem == 1) return '#28a745';
  if (str.includes('măng xông') || str.includes('mx') || idLoaiDiem == 4) return '#dc3545';
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

  if (tuyenVal === 'ALL' || !tuyenVal) {
    if (map.hasLayer(routeColoredLinesGroup)) routeColoredLinesGroup.clearLayers();
    if (map.hasLayer(pointsMarkersLayer)) pointsMarkersLayer.clearLayers();
    return;
  }

  var selectTram = document.getElementById('selectTram');
  var selectDoanCap = document.getElementById('selectDoanCap');
  var tramVal = selectTram ? selectTram.value : 'ALL';
  var doanVal = selectDoanCap ? selectDoanCap.value : 'ALL';
  
  var backbone = getMasterRouteBackbone(tuyenVal, tramVal, doanVal);

  if (!backbone || backbone.length < 2) {
    if (map.hasLayer(routeColoredLinesGroup)) routeColoredLinesGroup.clearLayers();
    if (map.hasLayer(pointsMarkersLayer)) pointsMarkersLayer.clearLayers();
    return;
  }

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

// crud_manager.js - Quản lý Phân quyền Xem/Sửa/Xóa User & Danh mục Trạm VT

/**
 * 1. HÀM MỞ FORM XEM/SỬA NGƯỜI DÙNG CÓ PHÂN QUYỀN
 */
function moFormSuaUser(userData) {
  var userRole = (typeof currentUser !== 'undefined' && currentUser.role) ? currentUser.role : 'member';
  var myDaiId = currentUser ? String(currentUser.idDai || currentUser.id_dai).trim() : '';
  var myTramId = currentUser ? String(currentUser.idTram || currentUser.id_tram).trim() : '';

  var targetDaiId = String(userData.idDai || userData.id_dai).trim();
  var targetTramId = String(userData.idTram || userData.id_tram).trim();

  // KIỂM TRA QUYỀN XEM/SỬA NGƯỜI DÙNG
  if (userRole === 'dai_admin' && targetDaiId !== myDaiId) {
    showToast("⛔ Anh chỉ có quyền Xem/Sửa tài khoản thuộc Đài của mình!");
    return;
  }
  if (userRole === 'tram_admin' && targetTramId !== myTramId) {
    showToast("⛔ Anh chỉ có quyền Xem/Sửa tài khoản thuộc Trạm của mình!");
    return;
  }

  // Cấu hình giao diện Form User
  document.getElementById('crudTargetType').value = 'user';
  document.getElementById('modalFormCRUDLabel').innerText = "✏️ Chỉnh Sửa Người Dùng";
  document.getElementById('groupUserFields').style.display = 'block';
  document.getElementById('groupTramFields').style.display = 'none';

  // Nạp thông tin người dùng vào ô nhập
  document.getElementById('crudRecordId').value = userData.id;
  document.getElementById('txtTenUser').value = userData.ten || userData.name || '';
  document.getElementById('txtEmailUser').value = userData.email || '';
  document.getElementById('selectRoleUser').value = userData.role || 'member';

  // Nạp danh sách Đài & Trạm vào Form
  napComboDaiFormUser(targetDaiId, targetTramId);

  // ÁP DỤNG KHÓA CỤC BỘ THEO ROLE
  var selectDai = document.getElementById('selectDaiUser');
  var selectTram = document.getElementById('selectTramUser');
  var selectRole = document.getElementById('selectRoleUser');

  if (userRole === 'dai_admin') {
    selectDai.disabled = true; // Khóa không cho đổi Đài
    selectRole.disabled = false;
  } else if (userRole === 'tram_admin') {
    selectDai.disabled = true; // Khóa Đài
    selectTram.disabled = true; // Khóa Trạm
    selectRole.disabled = true; // Khóa Vai trò
  } else {
    selectDai.disabled = false;
    selectTram.disabled = false;
    selectRole.disabled = false;
  }

  // Hiển thị Modal Form
  var modalEl = new bootstrap.Modal(document.getElementById('modalFormCRUD'));
  modalEl.show();
}

/**
 * 2. HÀM MỞ FORM XEM/SỬA DANH MỤC TRẠM VT CÓ PHÂN QUYỀN
 */
function moFormSuaTram(tramData) {
  var userRole = (typeof currentUser !== 'undefined' && currentUser.role) ? currentUser.role : 'member';
  var myDaiId = currentUser ? String(currentUser.idDai || currentUser.id_dai).trim() : '';
  var myTramId = currentUser ? String(currentUser.idTram || currentUser.id_tram).trim() : '';

  var targetTramId = String(tramData.id_tram || tramData.id).trim();
  var targetDaiId = String(tramData.id_dai || tramData.dai_id).trim();

  // KIỂM TRA QUYỀN XEM/SỬA TRẠM VT
  if (userRole === 'dai_admin' && targetDaiId !== myDaiId) {
    showToast("⛔ Anh chỉ có quyền Xem/Sửa danh mục Trạm thuộc Đài của mình!");
    return;
  }
  if (userRole === 'tram_admin' && targetTramId !== myTramId) {
    showToast("⛔ Anh chỉ có quyền Xem/Sửa danh mục thuộc Trạm của mình!");
    return;
  }

  // Cấu hình giao diện Form Trạm
  document.getElementById('crudTargetType').value = 'tram';
  document.getElementById('modalFormCRUDLabel').innerText = "🏛️ Chỉnh Sửa Danh Mục Trạm VT";
  document.getElementById('groupUserFields').style.display = 'none';
  document.getElementById('groupTramFields').style.display = 'block';

  // Nạp thông tin Trạm vào ô nhập
  document.getElementById('crudRecordId').value = targetTramId;
  document.getElementById('txtMaTram').value = tramData.ma_tram || '';
  document.getElementById('txtTenTram').value = tramData.ten_tram || tramData.ten || '';
  document.getElementById('txtGhiChuTram').value = tramData.ghi_chu || '';

  // Nạp danh sách Đài
  var selectDai = document.getElementById('selectDaiTramForm');
  selectDai.innerHTML = '';
  rawDaiList.forEach(d => {
    var dId = String(d.id_dai || d.id).trim();
    selectDai.innerHTML += `<option value="${dId}">${d.ten_dai || d.ten}</option>`;
  });
  selectDai.value = targetDaiId;

  // XỬ LÝ KHÓA CỤC BỘ KHÔNG CHO SỬA ĐƠN VỊ CẤP TRÊN
  if (userRole === 'dai_admin' || userRole === 'tram_admin') {
    selectDai.disabled = true; // Không cho đổi Trạm sang Đài khác
  } else {
    selectDai.disabled = false;
  }

  // Hiển thị Modal Form
  var modalEl = new bootstrap.Modal(document.getElementById('modalFormCRUD'));
  modalEl.show();
}

/**
 * 3. HÀM PHỤ TRỢ NẠP DỮ LIỆU ĐÀI VÀ TRẠM VÀO FORM USER
 */
function napComboDaiFormUser(selectedDaiId, selectedTramId) {
  var selectDai = document.getElementById('selectDaiUser');
  selectDai.innerHTML = '';
  rawDaiList.forEach(d => {
    var dId = String(d.id_dai || d.id).trim();
    selectDai.innerHTML += `<option value="${dId}">${d.ten_dai || d.ten}</option>`;
  });
  if (selectedDaiId) selectDai.value = selectedDaiId;

  capNhatComboTramUser(selectedTramId);
}

function capNhatComboTramUser(selectedTramId) {
  var selectDaiVal = document.getElementById('selectDaiUser').value;
  var selectTram = document.getElementById('selectTramUser');
  selectTram.innerHTML = '';

  rawTramList.filter(t => String(t.id_dai || t.dai_id).trim() === String(selectDaiVal).trim())
            .forEach(t => {
              var tId = String(t.id_tram || t.id).trim();
              selectTram.innerHTML += `<option value="${tId}">${t.ten_tram || t.ten}</option>`;
            });

  if (selectedTramId) selectTram.value = selectedTramId;
}

/**
 * 4. HÀM LƯU DỮ LIỆU CÓ KIỂM TRA QUYỀN KHI BẤM NÚT "LƯU"
 */
async function luuDuLieuCRUD() {
  var targetType = document.getElementById('crudTargetType').value;
  var recordId = document.getElementById('crudRecordId').value;
  showLoading("Đang lưu thay đổi vào cơ sở dữ liệu...");

  try {
    if (targetType === 'user') {
      var payloadUser = {
        name: document.getElementById('txtTenUser').value,
        email: document.getElementById('txtEmailUser').value,
        role: document.getElementById('selectRoleUser').value,
        id_dai: document.getElementById('selectDaiUser').value,
        id_tram: document.getElementById('selectTramUser').value
      };

      let { error } = await supabaseClient.from('users').update(payloadUser).eq('id', recordId);
      if (error) throw error;
      showToast("✅ Đã cập nhật người dùng thành công!");

    } else if (targetType === 'tram') {
      var payloadTram = {
        ma_tram: document.getElementById('txtMaTram').value,
        ten_tram: document.getElementById('txtTenTram').value,
        id_dai: document.getElementById('selectDaiTramForm').value,
        ghi_chu: document.getElementById('txtGhiChuTram').value
      };

      let { error } = await supabaseClient.from('tram_vt').update(payloadTram).eq('id_tram', recordId);
      if (error) throw error;
      showToast("✅ Đã cập nhật danh mục Trạm VT thành công!");
    }

    // Ẩn Modal và làm mới dữ liệu
    var modalEl = bootstrap.Modal.getInstance(document.getElementById('modalFormCRUD'));
    if (modalEl) modalEl.hide();
    taiDuLieuSupabase(true);

  } catch (err) {
    showToast("❌ Lỗi cập nhật: " + err.message);
  } finally {
    hideLoading();
  }
}
// crud_manager.js - Hàm render hiển thị bảng danh sách và nút lệnh quản trị theo phân quyền

/**
 * 1. HÀM HIỂN THỊ DANH SÁCH NGƯỜI DÙNG KÈM NÚT LỆNH THAO TÁC
 */
function renderBangQuanTriUser(userList) {
  var tbody = document.getElementById('tableUserBody');
  if (!tbody) return;

  var userRole = (typeof currentUser !== 'undefined' && currentUser.role) ? currentUser.role : 'member';
  var myDaiId = currentUser ? String(currentUser.idDai || currentUser.id_dai).trim() : '';
  var myTramId = currentUser ? String(currentUser.idTram || currentUser.id_tram).trim() : '';

  tbody.innerHTML = ''; // Làm sạch bảng trước khi nạp

  if (!userList || userList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Không có dữ liệu người dùng</td></tr>';
    return;
  }

  userList.forEach((u, index) => {
    var uDaiId = String(u.idDai || u.id_dai).trim();
    var uTramId = String(u.idTram || u.id_tram).trim();

    // Kiểm tra quyền hiển thị nút lệnh theo yêu cầu phân quyền
    var coQuyenSua = false;
    var coQuyenXoa = false;

    if (userRole === 'sys_admin') {
      coQuyenSua = true;
      coQuyenXoa = true;
    } else if (userRole === 'dai_admin' && uDaiId === myDaiId) {
      coQuyenSua = true; // dai_admin chỉ Sửa user thuộc Đài
      coQuyenXoa = false;
    } else if (userRole === 'tram_admin' && uTramId === myTramId) {
      coQuyenSua = true; // tram_admin chỉ Sửa user thuộc Trạm
      coQuyenXoa = false;
    }

    // Tạo các nút lệnh thao tác
    var nutSua = coQuyenSua 
      ? `<button class="btn btn-sm btn-warning me-1" onclick='moFormSuaUser(${JSON.stringify(u)})'>✏️ Sửa</button>` 
      : `<span class="badge bg-secondary">Chỉ xem</span>`;
      
    var nutXoa = coQuyenXoa 
      ? `<button class="btn btn-sm btn-danger" onclick='xoaUserData("${u.id}")'>🗑️ Xóa</button>` 
      : '';

    var tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td><b>${u.ten || u.name || 'N/A'}</b></td>
      <td>${u.email || ''}</td>
      <td><span class="badge bg-info text-dark">${u.role || 'member'}</span></td>
      <td>${u.ten_tram || u.id_tram || 'N/A'}</td>
      <td class="text-center">${nutSua} ${nutXoa}</td>
    `;
    tbody.appendChild(tr);
  });
}

/**
 * 2. HÀM HIỂN THỊ DANH SÁCH TRẠM VT KÈM NÚT LỆNH THAO TÁC
 */
function renderBangDanhMucTram(tramList) {
  var tbody = document.getElementById('tableTramBody');
  if (!tbody) return;

  var userRole = (typeof currentUser !== 'undefined' && currentUser.role) ? currentUser.role : 'member';
  var myDaiId = currentUser ? String(currentUser.idDai || currentUser.id_dai).trim() : '';
  var myTramId = currentUser ? String(currentUser.idTram || currentUser.id_tram).trim() : '';

  tbody.innerHTML = '';

  if (!tramList || tramList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Không có dữ liệu Trạm VT</td></tr>';
    return;
  }

  tramList.forEach((t, index) => {
    var tTramId = String(t.id_tram || t.id).trim();
    var tDaiId = String(t.id_dai || t.dai_id).trim();

    var coQuyenSua = false;
    var coQuyenXoa = false;

    if (userRole === 'sys_admin') {
      coQuyenSua = true;
      coQuyenXoa = true;
    } else if (userRole === 'dai_admin' && tDaiId === myDaiId) {
      coQuyenSua = true; // dai_admin chỉ Sửa trạm thuộc Đài
      coQuyenXoa = false;
    } else if (userRole === 'tram_admin' && tTramId === myTramId) {
      coQuyenSua = true; // tram_admin chỉ Sửa trạm thuộc Trạm mình
      coQuyenXoa = false;
    }

    var nutSua = coQuyenSua 
      ? `<button class="btn btn-sm btn-warning me-1" onclick='moFormSuaTram(${JSON.stringify(t)})'>✏️ Sửa</button>` 
      : `<span class="badge bg-secondary">Chỉ xem</span>`;

    var nutXoa = coQuyenXoa 
      ? `<button class="btn btn-sm btn-danger" onclick='xoaTramData("${tTramId}")'>🗑️ Xóa</button>` 
      : '';

    var tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td><b>${t.ma_tram || ''}</b></td>
      <td>${t.ten_tram || t.ten || ''}</td>
      <td>${t.ghi_chu || ''}</td>
      <td class="text-center">${nutSua} ${nutXoa}</td>
    `;
    tbody.appendChild(tr);
  });
}

/**
 * 3. HÀM KÍCH HOẠT NẠP TOÀN BỘ DANH MỤC VÀ HỦY ẨN BẢNG
 */
function taiVaHienThiQuanTriDanhMuc() {
  var state = AppStore.getState();
  var tramList = state.tramList || rawTramList;

  // Lấy dữ liệu người dùng từ Supabase nếu có
  supabaseClient.from('users').select('*').then(({ data, error }) => {
    var userList = data || [];
    renderBangQuanTriUser(userList);
  });

  // Render bảng Trạm VT
  renderBangDanhMucTram(tramList);
}
