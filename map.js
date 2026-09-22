// map.js - Khởi tạo bản đồ Leaflet, lắng nghe sự kiện di chuyển và vẽ tuyến cáp quang

var moveEndDebounceTimer = null;

/**
 * 1. KHỞI TẠO BẢN ĐỒ LEAFLET
 */
function khoiTaoBanDoLeaflet() {
  if (map) return;
  var osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 21, maxNativeZoom: 19 });
  var satLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 21, maxNativeZoom: 19 });
  
  map = L.map('map', { 
    center: [21.5942, 105.8481], 
    zoom: 13, 
    maxZoom: 21, 
    layers: [osmLayer],
    zoomControl: true,           
    attributionControl: false   // Tắt liên kết bản quyền Leaflet ở góc dưới bên phải
  });

  polylinesLayer.addTo(map); 
  markersLayer.addTo(map); 
  mxLayer.addTo(map); 
  userLocationLayer.addTo(map); 
  measureLayer.addTo(map);
  
  L.control.layers(
    { "Bản đồ OSM": osmLayer, "Vệ tinh": satLayer }, 
    { "Tuyến cáp quang": polylinesLayer, "Cột/Bể cáp": markersLayer, "Măng xông": mxLayer }, 
    { position: 'topright' }
  ).addTo(map);

  // Sự kiện tự động nạp điểm theo vùng xem khi kéo/zoom bản đồ
  map.on('moveend', function() {
    clearTimeout(moveEndDebounceTimer);
    moveEndDebounceTimer = setTimeout(function() {
      var selectTuyen = document.getElementById('selectTuyen');
      var tuyenVal = selectTuyen ? selectTuyen.value : 'ALL';
      if (tuyenVal === 'ALL' && typeof taiDiemTheoVungXem === 'function') {
        taiDiemTheoVungXem();
      }
    }, 400);
  });

  map.on('contextmenu', e => {
    if (currentUser.canEditMap || currentUser.role === 'sys_admin') moFormCrud('ADD', null, '', e.latlng.lat.toFixed(6), e.latlng.lng.toFixed(6));
    else showToast("Không có quyền thêm điểm.");
  });
  
  map.on('click', e => { if (isMeasuring) { measurePoints.push(e.latlng); redrawMeasureLayer(); } });
}

/**
 * 2. CÔNG CỤ ĐỊNH VỊ GPS VÀ ĐO KHOẢNG CÁCH
 */
function triggerUserLocation() {
  if (!navigator.geolocation) { showToast("Trình duyệt không hỗ trợ GPS."); return; }
  showLoading("Đang lấy vị trí GPS...");
  navigator.geolocation.getCurrentPosition(position => {
    hideLoading();
    var lat = position.coords.latitude, lng = position.coords.longitude, acc = position.coords.accuracy;
    userLocationLayer.clearLayers();
    var iconHtml = '<div style="background:#0d6efd; color:white; width:22px; height:22px; border-radius:50%; border:3px solid #fff; box-shadow:0 0 10px rgba(13,110,253,0.8); display:flex; align-items:center; justify-content:center; font-size:10px;">📍</div>';
    var marker = L.marker([lat, lng], { icon: L.divIcon({ className: '', html: iconHtml, iconSize: [22, 22], iconAnchor: [11, 11] }) }).bindPopup(`<b>Vị trí của bạn</b><br>Độ chính xác: ~${Math.round(acc)}m`);
    var circle = L.circle([lat, lng], { radius: acc, color: '#0d6efd', fillColor: '#0d6efd', fillOpacity: 0.15, weight: 1 });
    userLocationLayer.addLayer(marker); userLocationLayer.addLayer(circle);
    map.setView([lat, lng], 18, { animate: true });
    marker.openPopup();
  }, error => { hideLoading(); showToast("Lỗi GPS: " + error.message); }, { enableHighAccuracy: true, timeout: 10000 });
}

function toggleMeasureTool() {
  isMeasuring = !isMeasuring;
  var btn = document.getElementById('measure-btn');
  if (isMeasuring) {
    btn.style.background = '#0d6efd'; btn.style.color = 'white'; measurePoints = []; measureLayer.clearLayers();
    showToast("Đã BẬT đo khoảng cách. Click các điểm trên bản đồ.","info");
  } else {
    btn.style.background = 'white'; btn.style.color = 'black'; measureLayer.clearLayers(); measurePoints = [];
    showToast("Đã TẮT đo khoảng cách.");
  }
}

function redrawMeasureLayer() {
  measureLayer.clearLayers();
  if (measurePoints.length === 0) return;
  var totalDist = 0;
  for (var i = 0; i < measurePoints.length; i++) {
    L.circleMarker(measurePoints[i], { radius: 5, color: '#dc3545', fillColor: '#fff', fillOpacity: 1, weight: 2 }).addTo(measureLayer);
    if (i > 0) {
      totalDist += calculateHaversine(measurePoints[i-1].lat, measurePoints[i-1].lng, measurePoints[i].lat, measurePoints[i].lng);
      L.polyline([measurePoints[i-1], measurePoints[i]], { color: '#dc3545', weight: 3, dashArray: '5,5' }).addTo(measureLayer);
    }
  }
  var distStr = (totalDist >= 1000) ? (totalDist/1000).toFixed(2) + ' km' : Math.round(totalDist) + ' m';
  var textIcon = L.divIcon({ className: '', html: `<div style="background:#dc3545; color:white; padding:2px 6px; border-radius:3px; font-size:10px; font-weight:bold; white-space:nowrap;">📏 ${distStr}</div>`, iconSize: [80, 20], iconAnchor: [-10, 10] });
  L.marker(measurePoints[measurePoints.length - 1], { icon: textIcon }).addTo(measureLayer);
}

/**
 * 3. HÀM TÍNH TOÁN LÝ TRÌNH VÀ KHOẢNG CÁCH THEO TUYẾN
 */
function parseLyTrinhWithSuffix(str) {
  if (!str) return null;
  var cleanStr = str.toString().trim();
  var match = cleanStr.match(/(?:km\s*)?(\d+)\s*\+\s*(\d+)(?:\s*[\(\)]?\s*([a-zA-Z0-9\-_]+))?/i);
  if (match) {
    var km = parseInt(match[1]);
    var m = parseInt(match[2]);
    var suffix = match[3] ? match[3].trim().toUpperCase() : '';
    return { meters: km * 1000 + m, suffix: suffix };
  }
  var num = parseFloat(cleanStr);
  return isNaN(num) ? null : { meters: num, suffix: '' };
}

function calculateHaversine(lat1, lon1, lat2, lon2) {
  var R = 6371000, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
  var a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function getDistanceAlongRoute(targetPt, pathPts) {
  var heSo = parseFloat(document.getElementById('txtDoChung')?.value) || 1.075;
  var bestDist = 0, currentDist = 0, minDst = Infinity;
  
  for (var i = 0; i < pathPts.length - 1; i++) {
    var p1 = pathPts[i], p2 = pathPts[i+1];
    var segPhys = calculateHaversine(p1.lat, p1.lng, p2.lat, p2.lng);
    if (segPhys === 0) continue;
    
    var segOpt = (segPhys * heSo) + (p2.duTru || 0);
    
    var dx = p2.lng - p1.lng, dy = p2.lat - p1.lat, lenSq = dx * dx + dy * dy;
    var t = Math.max(0, Math.min(1, ((targetPt.lng - p1.lng) * dx + (targetPt.lat - p1.lat) * dy) / lenSq));
    var distToProj = calculateHaversine(targetPt.lat, targetPt.lng, p1.lat + t * dy, p1.lng + t * dx);
    
    if (distToProj < minDst) { 
      minDst = distToProj; 
      bestDist = currentDist + (t * segOpt); 
    }
    currentDist += segOpt;
  }
  return bestDist;
}

function getMasterRouteBackbone(tuyenVal, tramVal, doanVal) {
  var allPts = globalDataPoints.filter(pt => (tuyenVal === 'ALL' || pt.idTuyen == tuyenVal) && (tramVal === 'ALL' || pt.idTram == tramVal) && (doanVal === 'ALL' || pt.idDoanCap == doanVal));
  if (allPts.length === 0) return [];

  var basePt = allPts.find(p => Math.abs(p.lat - 21.593365) < 0.0001);
  if (!basePt) {
    basePt = { id: 'TNN_BASE', ten: "Trạm TNN", lat: 21.593365, lng: 105.839945, lyTrinh: "0+000", idTuyen: tuyenVal, stt: -9999, loai: "Trạm", idLoaiDiem: 0, duTru: 0 };
    allPts.unshift(basePt);
  }

  let sorted = [basePt];
  let remaining = allPts.filter(p => p !== basePt);

  while (remaining.length > 0) {
    let current = sorted[sorted.length - 1];
    let nearestIdx = 0, minDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      let dist = calculateHaversine(current.lat, current.lng, remaining[i].lat, remaining[i].lng);
      if (dist < minDist) { minDist = dist; nearestIdx = i; }
    }
    sorted.push(remaining[nearestIdx]);
    remaining.splice(nearestIdx, 1);
  }

  return sorted;
}

function precalculateRouteDataForPoints(pts, backbonePts) {
  if (!pts || pts.length === 0) return pts;
  
  var segmentsMap = {};
  backbonePts.forEach(p => {
    var segId = p.idDoanCap || 'default';
    if (!segmentsMap[segId]) segmentsMap[segId] = [];
    segmentsMap[segId].push(p);
  });

  Object.keys(segmentsMap).forEach(segId => {
    var segPoints = segmentsMap[segId];
    var anchors = [];
    segPoints.forEach((pt, idx) => {
      var parsed = parseLyTrinhWithSuffix(pt.lyTrinh);
      if (parsed !== null) {
        anchors.push({ index: idx, meters: parsed.meters, suffix: parsed.suffix, pt: pt });
      }
    });

    var isSegmentNghich = (anchors.length >= 2 && anchors[1].meters < anchors[0].meters);
    var segBaseMeters = anchors.length > 0 ? anchors[0].meters : 0;
    var segSuffix = anchors.length > 0 ? anchors[0].suffix : '';
    var segAnchorDistFromA = anchors.length > 0 ? getDistanceAlongRoute(anchors[0].pt, backbonePts) : 0;

    segPoints.forEach(pt => {
      let distFromA = getDistanceAlongRoute(pt, backbonePts);
      pt.distanceFromAMeters = distFromA;
      let distAVal = Math.round(pt.distanceFromAMeters);
      pt.distanceFromAText = (distAVal >= 1000) ? (distAVal / 1000).toFixed(2) + " km" : distAVal + " m";

      var parsedPt = parseLyTrinhWithSuffix(pt.lyTrinh);
      if (parsedPt !== null && parsedPt.suffix) {
        segSuffix = parsedPt.suffix;
        segBaseMeters = parsedPt.meters;
        segAnchorDistFromA = distFromA;
      }

      let effectiveLyTrinhMeters = isSegmentNghich ? (segBaseMeters - (distFromA - segAnchorDistFromA)) : (segBaseMeters - segAnchorDistFromA + distFromA);

      pt.calculatedLyTrinhMeters = effectiveLyTrinhMeters;
      let totalMeters = Math.round(pt.calculatedLyTrinhMeters);
      let km = Math.floor(totalMeters / 1000);
      let m = totalMeters % 1000;
      pt.calculatedLyTrinhText = `${km}+${m < 10 ? '0' + m : m}` + (segSuffix ? ` (${segSuffix})` : '');
    });
  });

  return pts;
}

function getPointsCuaTuyenHienTai() {
  var selectTuyen = document.getElementById('selectTuyen');
  var tuyenVal = selectTuyen ? selectTuyen.value : 'ALL';
  var tramVal = document.getElementById('selectTram') ? document.getElementById('selectTram').value : 'ALL';
  var doanVal = document.getElementById('selectDoanCap') ? document.getElementById('selectDoanCap').value : 'ALL';
  
  var backbone = getMasterRouteBackbone(tuyenVal, tramVal, doanVal);
  if (backbone.length === 0) return [];

  var nonMxPts = backbone.filter(pt => !isMangXong(pt) && pt.idLoaiDiem !== 0);
  var basePt = backbone.find(p => p.id === 'TNN_BASE' || Math.abs(p.lat - 21.593365) < 0.0001);
  if (basePt && !nonMxPts.includes(basePt)) nonMxPts.unshift(basePt);

  return precalculateRouteDataForPoints(nonMxPts, backbone);
}

/**
 * 4. VẼ TUYẾN CÁP VÀ ĐIỂM HẠ TẦNG LÊN BẢN ĐỒ
 */
// Hàm tiện ích: Sao chép nội dung vào bộ nhớ tạm
window.copyToClipboardTNN = function(text) {
  navigator.clipboard.writeText(text).then(function() {
    if (typeof showToast === 'function') showToast("📋 Đã sao chép tọa độ: " + text, "success");
  }).catch(function(err) {
    console.error('Lỗi copy: ', err);
  });
};
function veLaiTuyenAB() {
  if (!map) return;
  markersLayer.clearLayers(); mxLayer.clearLayers(); polylinesLayer.clearLayers();
  
  var selectTuyen = document.getElementById('selectTuyen');
  var tuyenVal = selectTuyen ? selectTuyen.value : 'ALL';
  var tramVal = document.getElementById('selectTram') ? document.getElementById('selectTram').value : 'ALL';
  var doanVal = document.getElementById('selectDoanCap') ? document.getElementById('selectDoanCap').value : 'ALL';

  var backbone = getMasterRouteBackbone(tuyenVal, tramVal, doanVal);
  if (!backbone || backbone.length === 0) return;

  precalculateRouteDataForPoints(backbone, backbone);
  var pts = getPointsCuaTuyenHienTai();
  
  var bounds = [];
  var isDraggable = (currentUser.canEditMap || currentUser.role === 'sys_admin');

  function taoNutHanhDong(id, ten, lat, lng) {
    // 1. Nút quản trị (Chỉ hiện khi có quyền isDraggable)
    var btnAdmin = isDraggable ? 
      `<button class="btn-small btn-success" onclick="moFormCrud('EDIT','${id}','${ten}',${lat},${lng})">✏️ Sửa Tên</button>
       <button class="btn-small del" onclick="moFormCrud('DELETE','${id}','${ten}',${lat},${lng})">🗑️ Xóa</button>` : '';
    
    // 2. Nút tiện ích (Luôn hiện cho tất cả mọi người)
    var btnTienIch = `
      <a href="https://maps.google.com/?q=${lat},${lng}" target="_blank" class="btn-small" style="background:#0dcaf0; color:black; text-decoration:none;">🗺️ Chỉ đường</a>
      <button class="btn-small" style="background:#6c757d; color:white;" onclick="copyToClipboardTNN('${lat.toFixed(6)}, ${lng.toFixed(6)}')">📋 Tọa độ</button>
    `;

    // 3. Gom nhóm bằng Flexbox
    return `
      <hr style="margin:6px 0; border:0; border-top:1px dashed #ccc;">
      <div style="display:flex; gap:4px; flex-wrap:wrap; margin-top:4px;">
        ${btnAdmin}
        ${btnTienIch}
      </div>`;
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

  // Vẽ các điểm thông thường (Bể, Cột, Mốc)
  pts.forEach((pt, index) => {
    bounds.push([pt.lat, pt.lng]);
    var iconHtml = (index === 0) ? '<div class="point-a-marker">A</div>' : '<div class="standard-marker"></div>';
    var marker = L.marker([pt.lat, pt.lng], { icon: L.divIcon({ className: '', html: iconHtml, iconSize: [26, 26], iconAnchor: [13, 13] }), draggable: isDraggable });
    
    // Giao diện Popup chuẩn hóa cho điểm thường
    var popupHtml = `
      <div style="font-size: 12px; line-height: 1.6;">
        <b style="font-size: 14px; color: #0d6efd;">${pt.ten}</b><br>
        Loại: <b>${pt.loai}</b><br>
        📍 Tọa độ: <span style="color:#dc3545; font-weight:bold;">${pt.lat.toFixed(6)}, ${pt.lng.toFixed(6)}</span><br>
        📍 Lý trình QL: <b>${pt.calculatedLyTrinhText}</b><br>
        📏 Cự ly từ Trạm A: <b>${pt.distanceFromAText}</b>
      </div>
    ` + taoNutHanhDong(pt.id, pt.ten, pt.lat, pt.lng);
    
    marker.bindPopup(popupHtml);
    marker.on('dragend', e => handleDragEnd(e, pt));
    markersLayer.addLayer(marker);
  });

  // Vẽ các Măng Xông
  var mxList = backbone.filter(p => isMangXong(p));
  mxList.forEach(mx => {
    bounds.push([mx.lat, mx.lng]);
    var mxMarker = L.marker([mx.lat, mx.lng], { icon: L.divIcon({ className: '', html: '<div class="mx-marker"></div>', iconSize: [12, 12], iconAnchor: [6, 6] }), draggable: isDraggable });
    
    var ghiChuBtn = `<button class="btn-small" style="background:#198754; color:white;" onclick="suaGhiChu('${mx.id}', '${mx.ghiChu}')">📝 Ghi chú</button>`;
    
    // Giao diện Popup chuẩn hóa cho Măng xông
    var popupHtml = `
      <div style="font-size: 12px; line-height: 1.6;">
        <b style="font-size: 14px; color: #198754;">${mx.ten}</b><br>
        📍 Tọa độ: <span style="color:#dc3545; font-weight:bold;">${mx.lat.toFixed(6)}, ${mx.lng.toFixed(6)}</span><br>
        📍 Lý trình QL: <b>${mx.calculatedLyTrinhText}</b><br>
        📏 Cự ly từ Trạm A: <b>${mx.distanceFromAText}</b><br>
      </div>
      <div style="margin-top:4px;">${ghiChuBtn}</div>
    ` + taoNutHanhDong(mx.id, mx.ten, mx.lat, mx.lng);

    mxMarker.bindPopup(popupHtml);
    mxMarker.on('dragend', e => handleDragEnd(e, mx));
    mxLayer.addLayer(mxMarker);
  });

  var lineCoordinates = backbone.map(p => [p.lat, p.lng]);
  if (lineCoordinates.length > 1) polylinesLayer.addLayer(L.polyline(lineCoordinates, { color: '#0d6efd', weight: 4, opacity: 0.85 }));
  if (bounds.length > 0 && tuyenVal !== 'ALL') map.fitBounds(bounds, { padding: [40, 40] });
}
window.veLaiTuyenAB = veLaiTuyenAB;

function isMangXong(pt) {
  var name = (pt.loai || '').toUpperCase();
  return Number(pt.idLoaiDiem) === 4 || name.includes('MX') || name.includes('MĂNG XÔNG');
}
