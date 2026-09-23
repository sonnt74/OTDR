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
  if (typeof capLayer !== 'undefined' && capLayer) {
    capLayer.clearLayers();
  }
  if (typeof mxLayer !== 'undefined' && mxLayer) {
      mxLayer.clearLayers();
  }
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
    
    var ghiChuBtn = `<button class="btn-small" style="background:#198754; margin-top:4px; color:white;" onclick="suaGhiChu('${mx.id}', '${mx.ghiChu}', ${mx.lat}, ${mx.lng})">📝 Ghi chú</button>`;
    
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
// ==========================================================================
// CÁC HÀM XỬ LÝ SỰ KIỆN NÚT BẤM TRÊN POPUP BẢN ĐỒ (SỬA TÊN, XÓA, GHI CHÚ)
// ==========================================================================

// ==========================================================================
// CÁC HÀM XỬ LÝ SỰ KIỆN NÚT BẤM TRÊN POPUP BẢN ĐỒ (ĐÃ THÊM CONFIRM & ZOOM)
// ==========================================================================

// 1. Hàm xử lý Sửa tên và Xóa đối tượng hạ tầng
window.moFormCrud = async function(action, id, ten, lat, lng) {
  if (action === 'DELETE') {
    // Xác thực xóa (Đã có hộp thoại đỏ cảnh báo)
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
        // Zoom lại vị trí vừa xóa để người dùng thấy điểm đã biến mất
        map.setView([lat, lng], 19, { animate: true });
      } catch (err) {
        showToast("❌ Lỗi xóa điểm: " + err.message, "error");
      }
      hideLoading();
    }
  } 
  else if (action === 'EDIT') {
    // Sử dụng hộp thoại một dòng chuyên nghiệp thay vì prompt cũ
    let newTen = await showSingleInputDialog(`✏️ Nhập tên mới cho điểm hạ tầng [${ten}]:`, ten);
    
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
    // 1. Đổ tọa độ click chuột vào form
    document.getElementById('diemLatInput').value = lat;
    document.getElementById('diemLngInput').value = lng;
    
    // 2. Làm sạch form
    document.getElementById('diemTen').value = '';
    document.getElementById('diemLyTrinh').value = '';
    document.getElementById('diemDuTru').value = 0;
    document.getElementById('diemGhiChuInput').value = '';
    document.getElementById('diemActionType').value = 'ADD';

    // 3. Nạp danh sách Loại Điểm
    let loaiSelect = document.getElementById('diemLoaiSelect');
    loaiSelect.innerHTML = '';
    if (typeof rawLoaiDiemList !== 'undefined') {
      rawLoaiDiemList.forEach(loai => {
        loaiSelect.innerHTML += `<option value="${loai.id_loaidiem || loai.id}">${loai.ten_loai || loai.loai}</option>`;
      });
    }

    // 4. Nạp danh sách Đoạn cáp
    let doanSelect = document.getElementById('diemDoanSelect');
    doanSelect.innerHTML = '';
    let currentDoan = AppStore.getState().selectedDoanCap;
    let doanList = AppStore.getState().doanCapList || rawDoanCapList;
    
    doanList.forEach(d => {
      let selected = (String(d.id_doan_cap || d.id) === String(currentDoan)) ? 'selected' : '';
      doanSelect.innerHTML += `<option value="${d.id_doan_cap || d.id}" ${selected}>${d.ten_doan_cap || d.ten_doancap}</option>`;
    });

    // 5. Mở Modal
    document.getElementById('diemHaTangModal').style.display = 'flex';
  }
};

// 2. Hàm xử lý Ghi chú riêng cho Măng xông (Đã bổ sung lat, lng)
window.suaGhiChu = async function(id, oldNote, lat, lng) {
  let currentNote = (oldNote === 'undefined' || oldNote === 'null') ? '' : oldNote;
  
  // Gọi hộp thoại nhập liệu nhiều dòng chuyên nghiệp
  let newNote = await showTextareaDialog(`📝 Cập nhật thông tin ghi chú Măng xông:`, currentNote);
  
  if (newNote !== null && newNote !== currentNote) { 
    let isConfirmed = await showConfirmDialog(`Bạn có chắc chắn muốn lưu nội dung ghi chú này không?`, 'success');
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
  if (action !== 'ADD') return; // Tương lai sẽ phát triển thêm EDIT sau

  let ten = document.getElementById('diemTen').value.trim();
  let idLoai = document.getElementById('diemLoaiSelect').value;
  let idDoan = document.getElementById('diemDoanSelect').value;
  let lyTrinh = document.getElementById('diemLyTrinh').value.trim();
  let duTru = parseFloat(document.getElementById('diemDuTru').value) || 0;
  let ghiChu = document.getElementById('diemGhiChuInput').value.trim();
  let lat = parseFloat(document.getElementById('diemLatInput').value);
  let lng = parseFloat(document.getElementById('diemLngInput').value);

  if (!ten) { showToast("⚠️ Vui lòng nhập tên điểm hạ tầng!", "error"); return; }
  if (!idDoan || idDoan === 'ALL') { showToast("⚠️ Vui lòng chọn Đoạn cáp để liên kết!", "error"); return; }

  showLoading("Đang khởi tạo điểm hạ tầng mới...");

  try {
    // 1. LƯU VÀO BẢNG diem_ha_tang (Để lấy ID mới)
    const { data: newDiem, error: errDiem } = await supabaseClient
      .from('diem_ha_tang')
      .insert([{
        ten: ten,
        id_loaidiem: Number(idLoai),
        lat: lat,
        long: lng,
        ly_trinh: lyTrinh,
        du_tru: duTru,
        ghi_chu: ghiChu
      }])
      .select();

    if (errDiem) throw errDiem;
    let idDiemMoi = newDiem[0].id_diem;

    // 2. LẤY DANH SÁCH ĐIỂM HIỆN TẠI CỦA ĐOẠN CÁP (Để tính thứ tự chèn)
    const { data: currentPts, error: errPts } = await supabaseClient
      .from('doan_cap_diem')
      .select('id_diem, thu_tu, diem_ha_tang(lat, long)')
      .eq('id_doan_cap', Number(idDoan))
      .order('thu_tu', { ascending: true });

    if (errPts) throw errPts;

    let arrayDeUpsert = [];
    let thuTuMoi = 1;

    if (!currentPts || currentPts.length === 0) {
      // Nhánh 1: Đoạn cáp này chưa có điểm nào -> Nó là điểm đầu tiên (thu_tu = 1)
      arrayDeUpsert.push({ id_doan_cap: Number(idDoan), id_diem: idDiemMoi, thu_tu: 1 });
    } else {
      // Nhánh 2: Tính toán hình học để chèn vào vị trí gần nhất
      let insertIndex = currentPts.length; // Mặc định chèn vào cuối cùng
      let minDistance = Infinity;

      // Tìm đoạn thẳng (i đến i+1) gần với điểm mới click nhất
      for (let i = 0; i < currentPts.length - 1; i++) {
        let p1 = currentPts[i].diem_ha_tang;
        let p2 = currentPts[i+1].diem_ha_tang;
        
        // Khoảng cách từ điểm click đến P1 và P2
        let dToP1 = calculateHaversine(lat, lng, p1.lat, p1.long);
        let dToP2 = calculateHaversine(lat, lng, p2.lat, p2.long);
        let dP1P2 = calculateHaversine(p1.lat, p1.long, p2.lat, p2.long);

        // Nếu điểm click nằm giữa P1 và P2 (cộng thêm 20m sai số GPS)
        if (dToP1 + dToP2 <= dP1P2 + 20) {
          if (dToP1 + dToP2 < minDistance) {
            minDistance = dToP1 + dToP2;
            insertIndex = i + 1; // Chèn vào sau P1 (tức là vị trí i+1)
          }
        }
      }

      // 3. TÁI TẠO LẠI MẢNG THỨ TỰ MỚI
      // Đẩy các điểm cũ vào mảng, đến vị trí insertIndex thì nhét điểm mới vào
      let counter = 1;
      for (let i = 0; i < currentPts.length; i++) {
        if (i === insertIndex) {
          arrayDeUpsert.push({ id_doan_cap: Number(idDoan), id_diem: idDiemMoi, thu_tu: counter });
          counter++;
        }
        arrayDeUpsert.push({ id_doan_cap: Number(idDoan), id_diem: currentPts[i].id_diem, thu_tu: counter });
        counter++;
      }
      // Nếu chèn vào cuối cùng
      if (insertIndex === currentPts.length) {
        arrayDeUpsert.push({ id_doan_cap: Number(idDoan), id_diem: idDiemMoi, thu_tu: counter });
      }
    }

    // 4. CẬP NHẬT ĐỒNG LOẠT VÀO BẢNG doan_cap_diem
    const { error: errUpsert } = await supabaseClient
      .from('doan_cap_diem')
      .upsert(arrayDeUpsert);

    if (errUpsert) throw errUpsert;

    // Thành công: Ghi Log, đóng cửa sổ, gọi hàm vẽ lại bản đồ
    await ghiNhatKyThaoTac("THEM_DIEM", `Kỹ sư thêm mới điểm [${ten}] vào bản đồ`);
    showToast(`✅ Đã thêm điểm [${ten}] vào bản đồ và tính toán Line thành công!`, "success");
    
    document.getElementById('diemHaTangModal').style.display = 'none';
    
    // Nạp lại bộ nhớ đệm đoạn cáp và vẽ lại
    if (typeof taiDuLieuDoanCapDiem === 'function') await taiDuLieuDoanCapDiem(idDoan);
    if (typeof taiDuLieuSupabase === 'function') taiDuLieuSupabase(false); // Cập nhật lại globalDataPoints ngầm
    
  } catch (err) {
    showToast("❌ Lỗi thêm điểm: " + err.message, "error");
    console.error(err);
  } finally {
    hideLoading();
  }
};
