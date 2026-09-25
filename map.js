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

/**
 * 1. HÀM TẢI DỮ LIỆU ĐỆM TỪ BẢNG doan_cap_diem (Chạy ngầm khi đổi đoạn cáp)
 * Bạn hãy gọi hàm này ở sự kiện onchange của dropdown chọn Đoạn cáp: taiDuLieuDoanCapDiem(doanVal);
 */
window.cacheThuTuDoanCap = {}; // Bộ nhớ tạm lưu thứ tự

async function taiDuLieuDoanCapDiem(doanVal) {
  if (!doanVal || doanVal === 'ALL') {
    window.cacheThuTuDoanCap = {};
    return;
  }

  try {
    let { data, error } = await supabaseClient
      .from('doan_cap_diem')
      .select('id_diem, thu_tu')
      .eq('id_doan_cap', Number(doanVal));

    if (error) {
      console.error("Lỗi tải bảng doan_cap_diem:", error);
      window.cacheThuTuDoanCap = {};
      return;
    }

    // Đưa vào object để tra cứu siêu nhanh dạng { id_diem: thu_tu }
    window.cacheThuTuDoanCap = {};
    if (data) {
      data.forEach(row => {
        window.cacheThuTuDoanCap[Number(row.id_diem)] = row.thu_tu;
      });
    }
  } catch (err) {
    console.error("Lỗi kết nối:", err);
    window.cacheThuTuDoanCap = {};
  }
}

/**
 * 2. HÀM XÂY DỰNG TUYẾN BACKBONE (ĐỒNG BỘ): 
 * Giúp hàm veLaiTuyenAB() cũ của bạn hoạt động hoàn hảo, không cần sửa đổi gì bên trong.
 */
/**
 * HÀM LẤY BACKBONE VÀ SẮP XẾP THEO THỨ TỰ CỦA BẢNG DOAN_CAP_DIEM
 */
function getMasterRouteBackbone(tuyenVal, tramVal, doanVal) {
  if (!doanVal || doanVal === 'ALL') {
    return [];
  }

  // 1. Lọc các điểm thuộc đúng đoạn cáp hiện tại từ bộ nhớ globalDataPoints
  let segmentPts = globalDataPoints.filter(pt => String(pt.idDoanCap) === String(doanVal));

  if (segmentPts.length === 0) {
    return [];
  }

  // 2. Sắp xếp tuyệt đối theo cột stt (hoặc thu_tu) đã được đồng bộ sẵn từ cơ sở dữ liệu
  segmentPts.sort((a, b) => {
    let orderA = a.stt !== undefined && a.stt !== null ? Number(a.stt) : (a.thu_tu !== undefined ? Number(a.thu_tu) : 9999);
    let orderB = b.stt !== undefined && b.stt !== null ? Number(b.stt) : (b.thu_tu !== undefined ? Number(b.thu_tu) : 9999);
    return orderA - orderB;
  });

  return segmentPts;
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
document.getElementById('selectDoanCap').addEventListener('change', async function() {
  var doanVal = this.value;
  
  // 1. Tải trước thứ tự từ bảng doan_cap_diem vào bộ nhớ đệm
  await taiDuLieuDoanCapDiem(doanVal);
  
  // 2. Gọi hàm vẽ lại bản đồ cũ của bạn (giữ nguyên 100%)
  veLaiTuyenAB();
});
function veLaiTuyenAB() {
  if (!map) return;
  if (typeof capLayer !== 'undefined' && capLayer) capLayer.clearLayers();
  if (typeof mxLayer !== 'undefined' && mxLayer) mxLayer.clearLayers();
  markersLayer.clearLayers(); polylinesLayer.clearLayers();

  var selectTuyen = document.getElementById('selectTuyen');
  var tuyenVal = selectTuyen ? selectTuyen.value : 'ALL';
  var tramVal = document.getElementById('selectTram') ? document.getElementById('selectTram').value : 'ALL';
  var doanVal = document.getElementById('selectDoanCap') ? document.getElementById('selectDoanCap').value : 'ALL';

  // 1. TẠO BẢNG MÀU CHO CÁC ĐƯỜNG CÁP
  var colorPalette = ['#0d6efd', '#dc3545', '#198754', '#f59e0b', '#6f42c1', '#e83e8c', '#fd7e14', '#20c997'];

  // 2. XÁC ĐỊNH DANH SÁCH ĐOẠN CÁP CẦN VẼ
  var danhSachDoanCanVe = [];
  if (doanVal === 'ALL') {
    var doanCapList = (typeof AppStore !== 'undefined' && AppStore.getState().doanCapList) ? AppStore.getState().doanCapList : (window.rawDoanCapList || []);
    danhSachDoanCanVe = doanCapList.filter(d => {
      var isTuyenMatch = (tuyenVal === 'ALL') ? true : (String(d.id_tuyen || d.tuyen_id || d.id_tuyen_cap) === String(tuyenVal));
      var isTramMatch = (tramVal === 'ALL') ? true : (String(d.id_tram || d.tram_id) === String(tramVal));
      return isTuyenMatch && isTramMatch;
    }).map(d => d.id_doan_cap || d.id);
  } else {
    danhSachDoanCanVe = [doanVal];
  }

  if (danhSachDoanCanVe.length === 0) return;

  var bounds = [];
  var drawnMarkerIds = new Set(); // Bẫy khử trùng lặp Marker

  // Lấy quyền user hiện tại
  var currentUser = (typeof AppStore !== 'undefined' && AppStore.getState().currentUser) ? AppStore.getState().currentUser : (window.currentUser || {});
  var isDraggable = (currentUser.canEditMap || (currentUser.role || '').toLowerCase().includes('admin') || (currentUser.role || '').toLowerCase().includes('sys'));

  // HÀM TẠO NÚT BẤM POPUP (Giữ nguyên 100% logic phân quyền)
  function taoNutHanhDong(ptObj) {
    let id = ptObj.id || ptObj.id_diem;
    let ten = ptObj.ten || ptObj.ten_diem || 'Điểm hạ tầng';
    let lat = ptObj.lat;
    let lng = ptObj.lng;

    let valQuyen = currentUser.xem_ghichu_an;
    let hasQuyenGhiChuAn = (valQuyen === true || valQuyen === 1 || valQuyen === '1' || valQuyen === 'true' || valQuyen === 'TRUE');

    var btnGhiChuAn = '';
    if (hasQuyenGhiChuAn) {
      btnGhiChuAn = `<button class="btn-small" style="background:#f59e0b; color:white; flex: 1; margin-right: 0;" onclick="xemGhiChuAnTaiDiem(${id}, '${ten}')">📝 Mật</button>`;
    }

    var btnAdmin = '';
    if (isDraggable) {
      btnAdmin = `
         <button class="btn-small btn-success" style="flex: 1; margin-right: 0;" onclick="moFormCrud('EDIT','${id}','${ten}',${lat},${lng})">✏️ Sửa</button>
         <button class="btn-small del" style="flex: 1; margin-right: 0;" onclick="moFormCrud('DELETE','${id}','${ten}',${lat},${lng})">🗑️ Xóa</button>
      `;
    }

    var btnTienIch = `
      <a href="https://maps.google.com/?q=${lat},${lng}" target="_blank" class="btn-small" style="background:#0dcaf0; color:black; text-decoration:none; flex: 1; margin-right: 0; display: flex; align-items: center; justify-content: center;">🗺️ Map</a>
      <button class="btn-small" style="background:#6c757d; color:white; flex: 1; margin-right: 0;" onclick="copyToClipboardTNN('${lat.toFixed(6)}, ${lng.toFixed(6)}')">📋 Tọa độ</button>
    `;

    return `
      <hr style="margin:6px 0; border:0; border-top:1px dashed #ccc;">
      <div style="display:flex; flex-direction:column; margin-top:4px;">
        <div style="display:flex; gap:4px; width: 100%; margin-bottom:4px;">${btnGhiChuAn}${btnAdmin}</div>
        <div style="display:flex; gap:4px; width: 100%;">${btnTienIch}</div>
      </div>`;
  }

  // HÀM LƯU TỌA ĐỘ KHI KÉO THẢ (Giữ nguyên 100%)
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
        if(typeof ghiNhatKyThaoTac==='function') await ghiNhatKyThaoTac("DOI_TOA_DO", `Kỹ sư thay đổi tọa độ điểm [${ptObj.ten}] sang (${newPos.lat.toFixed(6)}, ${newPos.lng.toFixed(6)})`);
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

  // 3. VÒNG LẶP VẼ ĐA TUYẾN
  danhSachDoanCanVe.forEach((idDoanHienTai, idx) => {
    var currentColor = colorPalette[idx % colorPalette.length];

    var backbone = getMasterRouteBackbone(tuyenVal, tramVal, idDoanHienTai);
    if (!backbone || backbone.length === 0) return;
    
    precalculateRouteDataForPoints(backbone, backbone);

    var nonMxPts = backbone.filter(pt => !isMangXong(pt) && pt.idLoaiDiem !== 0);
    var basePt = backbone.find(p => p.id === 'TNN_BASE' || Math.abs(p.lat - 21.593365) < 0.0001);
    if (basePt && !nonMxPts.includes(basePt)) nonMxPts.unshift(basePt);
    
    var pts = precalculateRouteDataForPoints(nonMxPts, backbone);
    
    // VẼ BỂ, CỘT, MỐC
    pts.forEach((pt, index) => {
      bounds.push([pt.lat, pt.lng]);
      
      if (drawnMarkerIds.has(pt.id)) return; // Bỏ qua nếu đã vẽ
      drawnMarkerIds.add(pt.id);

      var markerClass = 'marker-loai-1'; 
      if (index === 0) markerClass = 'point-a-marker'; 
      else if (String(pt.idLoaiDiem) === '2') markerClass = 'marker-loai-2'; 
      else if (String(pt.idLoaiDiem) === '3') markerClass = 'marker-loai-3'; 

      var iconHtml = (index === 0) ? `<div class="${markerClass}">A</div>` : `<div class="${markerClass}"></div>`;
      var marker = L.marker([pt.lat, pt.lng], { icon: L.divIcon({ className: '', html: iconHtml, iconSize: [26, 26], iconAnchor: [13, 13] }), draggable: isDraggable });
      
      var popupHtml = `
        <div style="font-size: 12px; line-height: 1.6;">
          <b style="font-size: 14px; color: #0d6efd;">${pt.ten}</b><br>
          Loại: <b>${pt.loai}</b><br>
          📍 Tọa độ: <span style="color:#dc3545; font-weight:bold;">${pt.lat.toFixed(6)}, ${pt.lng.toFixed(6)}</span><br>
          📍 Lý trình QL: <b>${pt.calculatedLyTrinhText}</b><br>
          📏 Cự ly từ Trạm A: <b>${pt.distanceFromAText}</b>
        </div>
      ` + taoNutHanhDong(pt);
      
      marker.bindPopup(popupHtml); 
      marker.on('dragend', e => handleDragEnd(e, pt));
      markersLayer.addLayer(marker);
    });

    // VẼ MĂNG XÔNG
    var mxList = backbone.filter(p => isMangXong(p));
    mxList.forEach(mx => {
      bounds.push([mx.lat, mx.lng]);
      
      if (drawnMarkerIds.has(mx.id)) return; // Bỏ qua nếu đã vẽ
      drawnMarkerIds.add(mx.id);

      var mxMarker = L.marker([mx.lat, mx.lng], { icon: L.divIcon({ className: '', html: '<div class="marker-loai-4"></div>', iconSize: [12, 12], iconAnchor: [6, 6] }), draggable: isDraggable });
      
      var popupHtml = `
        <div style="font-size: 12px; line-height: 1.6;">
          <b style="font-size: 14px; color: #198754;">${mx.ten}</b><br>
          📍 Tọa độ: <span style="color:#dc3545; font-weight:bold;">${mx.lat.toFixed(6)}, ${mx.lng.toFixed(6)}</span><br>
          📍 Lý trình QL: <b>${mx.calculatedLyTrinhText}</b><br>
          📏 Cự ly từ Trạm A: <b>${mx.distanceFromAText}</b><br>
        </div>
      ` + taoNutHanhDong(mx);
      
      mxMarker.bindPopup(popupHtml); 
      mxMarker.on('dragend', e => handleDragEnd(e, mx));
      mxLayer.addLayer(mxMarker);
    });

    // VẼ POLYLINE MÀU SẮC RIÊNG
    var lineCoordinates = backbone.map(p => [p.lat, p.lng]);
    if (lineCoordinates.length > 1) {
        polylinesLayer.addLayer(L.polyline(lineCoordinates, { color: currentColor, weight: 4, opacity: 0.85 }));
    }
  });

  if (bounds.length > 0 && tuyenVal !== 'ALL') map.fitBounds(bounds, { padding: [40, 40] });
}
window.veLaiTuyenAB = veLaiTuyenAB;

function isMangXong(pt) {
  var name = (pt.loai || '').toUpperCase();
  return Number(pt.idLoaiDiem) === 4 || name.includes('MX') || name.includes('MĂNG XÔNG');
}
// ==========================================================================
// HÀM QUẢN LÝ CRUD ĐIỂM HẠ TẦNG (THÊM, SỬA, XÓA) - TỐI ƯU TẢI TÊN LOẠI ĐIỂM
// ==========================================================================
// ==========================================================================
// HÀM QUẢN LÝ CRUD ĐIỂM HẠ TẦNG (THÊM, SỬA, XÓA) - ĐÃ DỌN DẸP & CHUẨN HÓA TÊN CỘT
// ==========================================================================
window.moFormCrud = async function(action, id, ten, lat, lng) {
  // 1. XỬ LÝ XÓA ĐIỂM
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
        if (typeof map !== 'undefined') {
            map.flyTo([lat, lng], 19, { animate: true, duration: 1.5 });
        }
      } catch (err) { showToast("❌ Lỗi xóa điểm: " + err.message, "error"); }
      hideLoading();
    }
  } 
  // 2. XỬ LÝ THÊM (ADD) HOẶC SỬA (EDIT) ĐIỂM HẠ TẦNG
  else if (action === 'ADD' || action === 'EDIT') {
    showLoading("Đang tải biểu mẫu...");
    
    document.getElementById('diemActionType').value = action;
    document.getElementById('diemEditId').value = id || '';
    document.getElementById('diemModalTitle').innerText = (action === 'ADD') ? '📍 Thêm Điểm Hạ Tầng Mới' : `✏️ Sửa Điểm: ${ten}`;

    let tenInput = document.getElementById('diemTen');
    let lyTrinhInput = document.getElementById('diemLyTrinh');
    let duTruInput = document.getElementById('diemDuTru');
    let ghiChuInput = document.getElementById('diemGhiChuInput');
    let latInput = document.getElementById('diemLatInput');
    let lngInput = document.getElementById('diemLngInput');
    let loaiSelect = document.getElementById('diemLoaiSelect');
    let huongSelect = document.getElementById('diemHuongSelect'); // Lấy DOM hướng
    let ngayPsInput = document.getElementById('diemNgayPs');      // Lấy DOM ngày
    let doanContainer = document.getElementById('diemDoanCheckboxList');
    let tuyenSelect = document.getElementById('diemTuyenSelect');
    
    // Nạp danh sách Hướng vào Combobox
    let dsHuong = window.rawHuongList || [];
    huongSelect.innerHTML = '<option value="">-- Không xác định --</option>';
    dsHuong.forEach(h => {
        huongSelect.innerHTML += `<option value="${h.id_huong || h.id}">${h.ten_huong || h.ten || h.name}</option>`;
    });

    // BƯỚC A: LẤY DANH SÁCH LOẠI ĐIỂM TỪ RAM HOẶC TRUY VẤN DB NẾU TRỐNG
    let dsLoai = window.rawLoaiDiemList || [];
    if (dsLoai.length === 0 && typeof supabaseClient !== 'undefined') {
      try {
        let { data } = await supabaseClient.from('loai_diem').select('*');
        if (data && data.length > 0) {
          dsLoai = data;
          window.rawLoaiDiemList = data;
        }
      } catch (e) {
        console.warn("Không thể tải bảng loại điểm:", e);
      }
    }

    // Dự phòng tĩnh an toàn
    if (dsLoai.length === 0) {
      dsLoai = [
        { id_loaidiem: 1, ten_loaidiem: 'Cột cáp' },
        { id_loaidiem: 2, ten_loaidiem: 'Bể cáp' },
        { id_loaidiem: 3, ten_loaidiem: 'Mốc tuyến' },
        { id_loaidiem: 4, ten_loaidiem: 'Măng xông' }
      ];
    }

    loaiSelect.innerHTML = '';
    dsLoai.forEach(loai => {
      let loaiId = loai.id_loaidiem !== undefined ? loai.id_loaidiem : (loai.id !== undefined ? loai.id : 1);
      
      // Ưu tiên đọc đúng tên cột 'ten_loaidiem' từ CSDL của bạn, kết hợp các tên dự phòng khác
      let loaiName = loai.ten_loaidiem || loai.ten_loai || loai.loai || loai.ten || loai.name || ('Loại ' + loaiId);
      
      loaiSelect.innerHTML += `<option value="${loaiId}">${loaiName}</option>`;
    });

    // BƯỚC B: HIỂN THỊ THÔNG TIN TUYẾN HIỆN TẠI
    let currentTuyen = AppStore.getState().selectedTuyen;
    let tuyenList = AppStore.getState().tuyenList || window.rawTuyenList || [];
    let curTuyenObj = tuyenList.find(t => String(t.id_tuyen_cap || t.id || t.id_tuyen) === String(currentTuyen));
    tuyenSelect.innerHTML = `<option value="${currentTuyen}">${curTuyenObj ? (curTuyenObj.ten_tuyen || curTuyenObj.ten_tuyencap || curTuyenObj.ten) : 'Tuyến hiện tại'}</option>`;

    // BƯỚC C: LẤY TOÀN BỘ ĐOẠN CÁP HỢP LỆ VÀ NHÓM THEO TUYẾN
    let doanList = (typeof getFilteredDoanList === 'function') ? getFilteredDoanList() : (AppStore.getState().doanCapList || window.rawDoanCapList || []);
    
    let groupedDoanByTuyen = {};
    doanList.forEach(d => {
      let idTuyen = String(d.id_tuyen || d.tuyen_id || d.id_tuyen_cap || 'khac');
      if (!groupedDoanByTuyen[idTuyen]) groupedDoanByTuyen[idTuyen] = [];
      groupedDoanByTuyen[idTuyen].push(d);
    });

    doanContainer.innerHTML = '';
    Object.keys(groupedDoanByTuyen).forEach(idTuyen => {
      let tuyenObj = tuyenList.find(t => String(t.id_tuyen_cap || t.id || t.id_tuyen) === idTuyen);
      let tuyenName = tuyenObj ? (tuyenObj.ten_tuyen || tuyenObj.ten_tuyencap || tuyenObj.ten) : `Tuyến ID: ${idTuyen}`;
      
      let doansOfTuyen = groupedDoanByTuyen[idTuyen];
      let htmlCheckboxes = doansOfTuyen.map(d => {
        let idDoan = d.id_doan_cap || d.id;
        let tenDoan = d.ten_doan_cap || d.ten_doancap || d.ten;
        return `
          <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 11px; color: #1e293b; margin-left: 10px; margin-bottom: 1px;">
            <input type="checkbox" class="doan-checkbox" value="${idDoan}" style="width: 14px; height: 14px;">
            ${tenDoan}
          </label>
        `;
      }).join('');

      doanContainer.innerHTML += `
        <div style="margin-bottom: 4px; border-bottom: 1px dashed #e2e8f0; padding-bottom: 2px;">
          <b style="font-size: 11px; color: #0d6efd;">🛣️ Tuyến: ${tuyenName}</b>
          ${htmlCheckboxes}
        </div>
      `;
    });

    // BƯỚC D: PHÂN NHÁNH DỮ LIỆU KHI THÊM MỚI (ADD) HOẶC SỬA (EDIT)
    if (action === 'ADD') {
      latInput.value = lat; 
      lngInput.value = lng;
      tenInput.value = ''; 
      lyTrinhInput.value = ''; 
      duTruInput.value = 0; 
      ghiChuInput.value = '';
      huongSelect.value = '';  // Thêm
      ngayPsInput.value = '';  // Thêm
      
      let currentDoan = AppStore.getState().selectedDoanCap;
      let cb = doanContainer.querySelector(`input[value="${currentDoan}"]`);
      if (cb) cb.checked = true;
      
    } else if (action === 'EDIT') {
      let ptObj = globalDataPoints.find(p => String(p.id) === String(id));
      if (ptObj) {
        latInput.value = ptObj.lat || lat; 
        lngInput.value = ptObj.lng || lng;
        tenInput.value = ptObj.ten || ''; 
        lyTrinhInput.value = ptObj.lyTrinh || '';
        duTruInput.value = ptObj.duTru || 0; 
        loaiSelect.value = ptObj.idLoaiDiem || 1;
        ghiChuInput.value = (ptObj.ghiChu && ptObj.ghiChu !== 'undefined' && ptObj.ghiChu !== 'null') ? ptObj.ghiChu : '';
        let huongSelect = document.getElementById('diemHuongSelect');
        if (huongSelect) {
            huongSelect.value = (ptObj.idHuong !== null && ptObj.idHuong !== '') ? ptObj.idHuong : '';
        }
        let ngayPsInput = document.getElementById('diemNgayPs');
        if (ngayPsInput) {
            let dateVal = '';
            // Cắt chuỗi để lấy đúng định dạng YYYY-MM-DD
            if (ptObj.ngayPs && ptObj.ngayPs !== 'null' && ptObj.ngayPs !== '') {
                dateVal = String(ptObj.ngayPs).split('T')[0]; 
            }
            ngayPsInput.value = dateVal;
        }
      }

      try {
        let { data: linkedDoan } = await supabaseClient.from('doan_cap_diem').select('id_doan_cap').eq('id_diem', Number(id));
        let linkedIds = (linkedDoan || []).map(d => String(d.id_doan_cap));
        
        doanContainer.querySelectorAll('.doan-checkbox').forEach(cb => {
          if (linkedIds.includes(cb.value)) cb.checked = true;
        });
      } catch(e) { console.error("Lỗi lấy liên kết đoạn cáp:", e); }
    }
    
    hideLoading();
    document.getElementById('diemHaTangModal').style.display = 'flex';
  }
};

// Hàm tiện ích: Sao chép nội dung vào bộ nhớ tạm (Dành cho nút Tọa độ)
window.copyToClipboardTNN = function(text) {
  navigator.clipboard.writeText(text).then(function() {
    showToast("📋 Đã sao chép tọa độ: " + text, "success");
  }).catch(function(err) {
    console.error('Lỗi copy: ', err);
  });
};

/**
 * HÀM XỬ LÝ LƯU ĐIỂM HẠ TẦNG MỚI (BAO GỒM TÍNH TOÁN THỨ TỰ TỰ ĐỘNG)
 */
window.saveDiemHatangFullAction = async function() {
  let action = document.getElementById('diemActionType').value;
  let idDiemEdit = document.getElementById('diemEditId').value;
  
  let ten = document.getElementById('diemTen').value.trim();
  let idLoai = document.getElementById('diemLoaiSelect').value;
  let lyTrinh = document.getElementById('diemLyTrinh').value.trim();
  let duTru = parseFloat(document.getElementById('diemDuTru').value) || 0;
  let ghiChu = document.getElementById('diemGhiChuInput').value.trim();
  let lat = parseFloat(document.getElementById('diemLatInput').value);
  let lng = parseFloat(document.getElementById('diemLngInput').value);

  // FIX: Lấy thêm giá trị Hướng và Ngày phát sinh từ giao diện
  let idHuongSelect = document.getElementById('diemHuongSelect');
  let idHuong = (idHuongSelect && idHuongSelect.value !== '') ? Number(idHuongSelect.value) : null;
  
  let ngayPsInput = document.getElementById('diemNgayPs');
  let ngayPs = (ngayPsInput && ngayPsInput.value.trim() !== '') ? ngayPsInput.value : null;

  let checkedDoanIds = Array.from(document.querySelectorAll('#diemDoanCheckboxList .doan-checkbox:checked')).map(cb => cb.value);

  if (!ten) { showToast("⚠️ Vui lòng nhập tên điểm hạ tầng!", "error"); return; }
  if (checkedDoanIds.length === 0) { showToast("⚠️ Vui lòng chọn ít nhất 1 Đoạn cáp để liên kết!", "error"); return; }

  let isConfirmed = await showConfirmDialog(`Xác nhận ${action === 'ADD' ? 'THÊM MỚI' : 'CẬP NHẬT'} điểm hạ tầng này chứ?`, 'success');
  if (!isConfirmed) return;

  showLoading("Đang xử lý thuật toán không gian và lưu dữ liệu...");

  try {
    let idDiemTarget = null;
    
    // Gói dữ liệu hoàn chỉnh để chèn hoặc sửa
    let payload = { 
        ten_diem: ten, 
        id_loaidiem: Number(idLoai), 
        lat: lat, 
        long: lng, 
        ly_trinh: lyTrinh, 
        du_tru: duTru, 
        ghi_chu: ghiChu,
        id_huong: idHuong,
        ngay_ps: ngayPs
    };

    if (action === 'ADD') {
      const { data: newDiem, error: errDiem } = await supabaseClient
        .from('diem_ha_tang')
        .insert([{ ten_diem: ten, id_loaidiem: Number(idLoai), lat: lat, long: lng, ly_trinh: lyTrinh, du_tru: duTru, ghi_chu: ghiChu, id_huong: idHuong, ngay_ps: ngayPs }])
        .select();
      if (errDiem) throw errDiem;
      idDiemTarget = newDiem[0].id_diem;
    } else {
      idDiemTarget = Number(idDiemEdit);
      const { error: errUpdate } = await supabaseClient
        .from('diem_ha_tang')
        .update({ ten_diem: ten, id_loaidiem: Number(idLoai), lat: lat, long: lng, ly_trinh: lyTrinh, du_tru: duTru, ghi_chu: ghiChu, id_huong: idHuong, ngay_ps: ngayPs })
        .eq('id_diem', idDiemTarget);
      if (errUpdate) throw errUpdate;

      await supabaseClient.from('doan_cap_diem').delete().eq('id_diem', idDiemTarget);
    }

    for (let i = 0; i < checkedDoanIds.length; i++) {
      let idDoan = Number(checkedDoanIds[i]);

      const { data: currentPts, error: errPts } = await supabaseClient
        .from('doan_cap_diem')
        .select('id_diem, thu_tu, diem_ha_tang(lat, long)')
        .eq('id_doan_cap', idDoan)
        .neq('id_diem', idDiemTarget) 
        .order('thu_tu', { ascending: true });

      if (errPts) throw errPts;

      let arrayDeUpsert = [];
      let insertIndex = currentPts ? currentPts.length : 0; 
      
      if (currentPts && currentPts.length > 0) {
        let minDistance = Infinity;
        for (let j = 0; j < currentPts.length - 1; j++) {
          let p1 = currentPts[j].diem_ha_tang;
          let p2 = currentPts[j+1].diem_ha_tang;
          if (!p1 || !p2) continue;
          
          let dToP1 = calculateHaversine(lat, lng, p1.lat, p1.long);
          let dToP2 = calculateHaversine(lat, lng, p2.lat, p2.long);
          let dP1P2 = calculateHaversine(p1.lat, p1.long, p2.lat, p2.long);

          if (dToP1 + dToP2 <= dP1P2 + 20) {
            if (dToP1 + dToP2 < minDistance) {
              minDistance = dToP1 + dToP2;
              insertIndex = j + 1; 
            }
          }
        }

        let counter = 1;
        for (let j = 0; j < currentPts.length; j++) {
          if (j === insertIndex) {
            arrayDeUpsert.push({ id_doan_cap: idDoan, id_diem: idDiemTarget, thu_tu: counter });
            counter++;
          }
          arrayDeUpsert.push({ id_doan_cap: idDoan, id_diem: currentPts[j].id_diem, thu_tu: counter });
          counter++;
        }
        if (insertIndex === currentPts.length) {
          arrayDeUpsert.push({ id_doan_cap: idDoan, id_diem: idDiemTarget, thu_tu: counter });
        }
      } else {
        arrayDeUpsert.push({ id_doan_cap: idDoan, id_diem: idDiemTarget, thu_tu: 1 });
      }

      const { error: errUpsert } = await supabaseClient
        .from('doan_cap_diem')
        .upsert(arrayDeUpsert, { onConflict: 'id_doan_cap,id_diem' });
        
      if (errUpsert) throw errUpsert;
    }

    if (typeof ghiNhatKyThaoTac === 'function') ghiNhatKyThaoTac(action === 'ADD' ? "THEM_DIEM" : "SUA_DIEM", `Kỹ sư ${action === 'ADD' ? 'thêm mới' : 'cập nhật'} điểm [${ten}] trên ${checkedDoanIds.length} đoạn cáp`);
    showToast(`✅ Đã ${action === 'ADD' ? 'thêm' : 'cập nhật'} thành công!`, "success");
    document.getElementById('diemHaTangModal').style.display = 'none';
    
    if (typeof taiDuLieuSupabase === 'function') {
       try { await taiDuLieuSupabase(false); } catch(e) { taiDuLieuSupabase(false); }
    }

    if (typeof map !== 'undefined') {
       setTimeout(() => {
           map.stop(); 
           map.flyTo([lat, lng], 19, { animate: true, duration: 1.5 });
       }, 1200); 
    }

  } catch (err) {
    showToast("❌ Lỗi xử lý: " + err.message, "error");
    console.error(err);
  } finally {
    hideLoading();
  }
};
// ==========================================================================
// HÀM XEM & SỬA THÔNG TIN MẬT (Đã fix chuẩn Promise để lưu dữ liệu)
// ==========================================================================
window.xemGhiChuAnTaiDiem = async function(idDiem, tenDiem) {
  if (typeof showLoading === 'function') showLoading("Đang tải thông tin mật...");

  try {
    const { data, error } = await supabaseClient
      .from('diem_ha_tang')
      .select('ghichu_an')
      .eq('id_diem', idDiem)
      .single();

    if (error) throw error;
    if (typeof hideLoading === 'function') hideLoading();

    let noiDungHienTai = data.ghichu_an;
    if (!noiDungHienTai || String(noiDungHienTai).trim() === '' || String(noiDungHienTai).trim() === 'null') {
        noiDungHienTai = ""; 
    } else {
        noiDungHienTai = String(noiDungHienTai).replace(/<br\s*[\/]?>/gi, '\n');
    }

    if (typeof showTextareaDialog === 'function') {
      let tieuDeHopThoai = `📝 Ghi chú mật - [${tenDiem}]`;
      
      // FIX: Gọi hàm bằng await và hứng kết quả trả về
      let noiDungMoi = await showTextareaDialog(tieuDeHopThoai, noiDungHienTai);
      
      // Nếu người dùng bấm "Lưu ghi chú" (không bấm Hủy)
      if (noiDungMoi !== null) {
        if (typeof showLoading === 'function') showLoading("Đang lưu thông tin mật...");
        try {
          const { error: errUpdate } = await supabaseClient
            .from('diem_ha_tang')
            .update({ ghichu_an: noiDungMoi })
            .eq('id_diem', idDiem);
            
          if (errUpdate) throw errUpdate;
          if (typeof showToast === 'function') showToast("✅ Đã lưu thông tin mật thành công!", "success");
          if (typeof ghiNhatKyThaoTac === 'function') ghiNhatKyThaoTac("SUA_MAT", `Kỹ sư cập nhật Ghi chú mật điểm [${tenDiem}]`);
        } catch (err) {
          console.error("Lỗi cập nhật Ghi chú mật:", err);
          if (typeof showToast === 'function') showToast("❌ Lỗi khi lưu: " + err.message, "error");
        } finally {
          if (typeof hideLoading === 'function') hideLoading();
        }
      }
    }
  } catch (err) {
    console.error("Lỗi lấy thông tin mật:", err);
    if (typeof showToast === 'function') showToast("❌ Không thể tải thông tin mật!", "error");
    if (typeof hideLoading === 'function') hideLoading();
  }
};
