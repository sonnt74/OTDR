// data.js - Xử lý phân quyền currentUser, tự động dọn dẹp Marker sau 30s và nút Xóa Maps

var autoClearMarkerTimer = null; // Biến lưu bộ đếm thời gian 30s tự động xóa marker

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
 * 1. TẢI DỮ LIỆU SUPABASE VÀO APPSTORE
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

    if (forceRefresh) showToast("Đã làm mới dữ liệu!", "success");
  } catch (err) { 
    showToast("Lỗi tải dữ liệu: " + err.message, "error"); 
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
      showToast("⏱️ Đã tự động xóa mốc tìm kiếm (Sau 30s)", "info");
    }
  }, 30000);
}

/**
 * 4. TÌM VỊ TRÍ ĐỨT OTDR (CÓ TỰ XÓA SAU 30S)
 */
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
    showToast("Sai định dạng lý trình! Vui lòng nhập theo mẫu: 54+100 hoặc km 54+100", "error");
    return;
  }
  
  var pts = getPointsCuaTuyenHienTai();
  if (pts.length < 2) {
    showToast("Vui lòng chọn tuyến cáp trước khi tìm kiếm!", "error");
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
                     `- Cự ly cáp tới Trạm TNN: <b>${distStr}</b><br>` +
                     `<small style="color:red;">⏱️ Điểm này sẽ tự xóa sau 30 giây</small>`;
                     
  foundMarkerLayer.bindPopup(popupContent).openPopup();
  datLichTuXoaMarkerTimKiem();
}

/**
 * 6. HÀM NÚT "XÓA MAPS": XÓA SẠCH ĐỐI TƯỢNG TRÊN BẢN ĐỒ LEAFLET
 */
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

function veLaiTuyenAB() {
  if (!map) return;
  markersLayer.clearLayers(); mxLayer.clearLayers(); polylinesLayer.clearLayers();
  
  var selectTuyen = document.getElementById('selectTuyen');
  var tuyenVal = selectTuyen ? selectTuyen.value : 'ALL';

  if (tuyenVal === 'ALL' || !tuyenVal) return;

  var tramVal = document.getElementById('selectTram') ? document.getElementById('selectTram').value : 'ALL';
  var doanVal = document.getElementById('selectDoanCap') ? document.getElementById('selectDoanCap').value : 'ALL';

  var backbone = getMasterRouteBackbone(tuyenVal, tramVal, doanVal);
  if (!backbone || backbone.length < 2) return;

  precalculateRouteDataForPoints(backbone, backbone);

  var pts = getPointsCuaTuyenHienTai();
  if (pts.length === 0) return;
  
  var bounds = [];
  var isDraggable = (currentUser.canEditMap || currentUser.role === 'sys_admin');

  function taoNutHanhDong(id, ten, lat, lng) {
    return isDraggable ? `<hr style="margin:4px 0;"><button class="btn-small" onclick="moFormCrud('EDIT','${id}','${ten}',${lat},${lng})">✏️ Sửa Tên</button><button class="btn-small del" onclick="moFormCrud('DELETE','${id}','${ten}',${lat},${lng})">🗑️ Xóa</button>` : '';
  }

  async function handleDragEnd(e, ptObj) {
    var newPos = e.target.getLatLng();
    var isConfirmed = await showConfirmDialog(`Bạn có chắc chắn muốn lưu tọa độ mới cho điểm [${ptObj.ten}] không?`);
    
    if (isConfirmed) {
      showLoading("Đang lưu tọa độ...");
      try {
        const { error } = await supabaseClient.from('diem_ha_tang').update({ lat: newPos.lat, long: newPos.lng }).eq('id_diem', ptObj.id);
        if (error) throw error;
        
        var localPt = globalDataPoints.find(p => p.id == ptObj.id);
        if (localPt) { localPt.lat = newPos.lat; localPt.lng = newPos.lng; }
        
        hideLoading();
        await ghiNhatKyThaoTac("DOI_TOA_DO", `Kỹ sư thay đổi tọa độ điểm [${ptObj.ten}] sang (${newPos.lat.toFixed(6)}, ${newPos.lng.toFixed(6)})`);
        showToast("Đã lưu và cập nhật tọa độ thành công!", "success");
        veLaiTuyenAB();
        map.setView([newPos.lat, newPos.lng], 19, { animate: true });
      } catch (err) { 
        showToast("Lỗi: " + err.message, "error"); 
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
    
    var popupHtml = `<b>${pt.ten}</b><br>Loại: ${pt.loai}<br>📍 Lý trình QL: <b>${pt.calculatedLyTrinhText}</b><br>📏 Cự ly từ Trạm A: <b>${pt.distanceFromAText}</b>` + taoNutHanhDong(pt.id, pt.ten, pt.lat, pt.lng);
    marker.bindPopup(popupHtml);
    marker.on('dragend', e => handleDragEnd(e, pt));
    markersLayer.addLayer(marker);
  });

  var mxList = backbone.filter(p => isMangXong(p));
  mxList.forEach(mx => {
    bounds.push([mx.lat, mx.lng]);
    var mxMarker = L.marker([mx.lat, mx.lng], { icon: L.divIcon({ className: '', html: '<div class="mx-marker"></div>', iconSize: [12, 12], iconAnchor: [6, 6] }), draggable: isDraggable });
    var ghiChuBtn = `<button class="btn-small" style="background:#198754; margin-top:4px;" onclick="suaGhiChu('${mx.id}', '${mx.ghiChu}')">📝 Ghi chú</button>`;
    var popupHtml = `<b>${mx.ten}</b><br>📍 Lý trình QL: <b>${mx.calculatedLyTrinhText}</b><br>📏 Cự ly từ Trạm A: <b>${mx.distanceFromAText}</b><br>` + taoNutHanhDong(mx.id, mx.ten, mx.lat, mx.lng) + ghiChuBtn;

    mxMarker.bindPopup(popupHtml);
    mxMarker.on('dragend', e => handleDragEnd(e, mx));
    mxLayer.addLayer(mxMarker);
  });

  var lineCoordinates = backbone.map(p => [p.lat, p.lng]);
  if (lineCoordinates.length > 1) polylinesLayer.addLayer(L.polyline(lineCoordinates, { color: '#0d6efd', weight: 4, opacity: 0.85 }));
  if (bounds.length > 0) map.fitBounds(bounds, { padding: [40, 40] });
}
window.veLaiTuyenAB = veLaiTuyenAB;

function isMangXong(pt) {
  var name = (pt.loai || '').toUpperCase();
  return Number(pt.idLoaiDiem) === 4 || name.includes('MX') || name.includes('MĂNG XÔNG');
}
