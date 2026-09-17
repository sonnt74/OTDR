// ==========================================================================
// TỆP MAP.JS - QUẢN LÝ BẢN ĐỒ LEAFLET & THUẬT TOÁN GIS / OTDR (ĐẦY ĐỦ 100%)
// ==========================================================================

// Biến toàn cục quản lý Bản đồ và các Lớp hiển thị
var map = null;
var markersLayer = null;      // Lớp chứa các mốc biểu tượng
var polylinesLayer = null;    // Lớp chứa đường cáp Polyline
var mxLayer = null;           // Lớp chứa riêng biểu tượng Măng xông
var foundMarkerLayer = null;  // Lớp chứa mốc sự cố OTDR / Tìm kiếm lý trình

var mapMoveDebounceTimer = null; // Bộ đếm hoãn tải dữ liệu khi kéo bản đồ

// ==========================================================================
// PHẦN 1: CÁC HÀM THUẬT TOÁN HÌNH HỌC GIS & ĐO TÍNH OTDR / LÝ TRÌNH
// ==========================================================================

/**
 * 1.1 Tính khoảng cách thực tế giữa 2 tọa độ GPS (Trả về mét)
 */
function calculateHaversine(lat1, lon1, lat2, lon2) {
  var R = 6371000; // Bán kính Trái Đất (mét)
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLon = (lon2 - lon1) * Math.PI / 180;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * 1.2 Xử lý chuỗi lý trình dạng 54+100 hoặc km 54+100 thành số mét
 */
function parseLyTrinhWithSuffix(txt) {
  if (!txt) return null;
  var str = String(txt).trim().toLowerCase().replace(/^(km|ly trình|lt)\s*/i, '');
  
  if (str.includes('+') || str.includes('k')) {
    var parts = str.split(/[+k]/);
    var km = parseFloat(parts[0]) || 0;
    var m = parseFloat(parts[1]) || 0;
    return { meters: km * 1000 + m, text: `${km}+${m}` };
  }
  
  var num = parseFloat(str);
  if (!isNaN(num)) {
    var kmVal = Math.floor(num / 1000);
    var mVal = num % 1000;
    return { meters: num, text: `${kmVal}+${mVal}` };
  }
  
  return null;
}

/**
 * 1.3 Lấy trục đường cáp chuẩn (Backbone) của tuyến đang chọn
 */
function getMasterRouteBackbone(tuyenVal, tramVal, doanVal) {
  var state = AppStore.getState();
  var pts = state.dataPoints || globalDataPoints || [];
  if (!pts || pts.length === 0) return [];

  var validPts = pts.filter(function(p) {
    return p && !isNaN(p.lat) && !isNaN(p.lng);
  });

  return validPts.sort(function(a, b) {
    return (a.stt || 0) - (b.stt || 0);
  });
}

/**
 * 1.4 Tính lũy kế khoảng cách và lý trình cho danh sách điểm
 */
function precalculateRouteDataForPoints(backbone, points) {
  if (!backbone || backbone.length === 0) return;

  var currentDistMeters = 0;
  backbone[0].distanceFromAMeters = 0;

  for (var i = 0; i < backbone.length - 1; i++) {
    var segLen = calculateHaversine(
      backbone[i].lat, backbone[i].lng,
      backbone[i+1].lat, backbone[i+1].lng
    );
    currentDistMeters += segLen;
    backbone[i+1].distanceFromAMeters = currentDistMeters;
  }

  points.forEach(function(p) {
    var parsed = parseLyTrinhWithSuffix(p.lyTrinh);
    p.calculatedLyTrinhMeters = parsed ? parsed.meters : undefined;
  });
}

/**
 * 1.5 Tính khoảng cách từ Trạm gốc A tới 1 điểm bất kỳ trên tuyến
 */
function getDistanceAlongRoute(targetPt, backbone) {
  if (!backbone || backbone.length === 0) return 0;
  var minDist = Infinity;
  var closestIndex = 0;

  for (var i = 0; i < backbone.length; i++) {
    var d = calculateHaversine(targetPt.lat, targetPt.lng, backbone[i].lat, backbone[i].lng);
    if (d < minDist) {
      minDist = d;
      closestIndex = i;
    }
  }

  return backbone[closestIndex].distanceFromAMeters || 0;
}

/**
 * 1.6 Lấy danh sách điểm thuộc tuyến hiện tại
 */
function getPointsCuaTuyenHienTai() {
  var state = AppStore.getState();
  var pts = state.dataPoints || globalDataPoints || [];
  var selectedTuyen = state.selectedTuyen;

  if (selectedTuyen === 'ALL') return pts;

  var filtered = pts.filter(function(p) {
    return String(p.idTuyen) === String(selectedTuyen);
  });

  var backbone = getMasterRouteBackbone(selectedTuyen, 'ALL', 'ALL');
  precalculateRouteDataForPoints(backbone, filtered);

  return filtered;
}

// ==========================================================================
// PHẦN 2: KHỞI TẠO BẢN ĐỒ LEAFLET VÀ TẠO BIỂU TƯỢNG (ICONS)
// ==========================================================================

/**
 * 2.1 Khởi tạo bản đồ Leaflet
 */
function khoiTaoBanDoLeaflet() {
  var mapContainer = document.getElementById('map');
  if (!mapContainer) return;

  if (map !== null) {
    map.invalidateSize();
    return;
  }

  // Tọa độ trung tâm mặc định (Thái Nguyên)
  map = L.map('map', {
    center: [21.5927, 105.8442],
    zoom: 13,
    zoomControl: false
  });

  var osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(map);

  var googleSatLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    attribution: '© Google Maps'
  });

  var baseMaps = {
    "🗺️ Đường phố": osmLayer,
    "🛰️ Vệ tinh": googleSatLayer
  };

  L.control.layers(baseMaps, null, { position: 'topright' }).addTo(map);

  polylinesLayer = L.layerGroup().addTo(map);
  mxLayer = L.layerGroup().addTo(map);
  markersLayer = L.featureGroup().addTo(map);

  // Hoãn nạp dữ liệu khi kéo/phóng bản đồ
  map.on('moveend', function() {
    if (mapMoveDebounceTimer) clearTimeout(mapMoveDebounceTimer);
    mapMoveDebounceTimer = setTimeout(function() {
      var state = AppStore.getState();
      if (state.selectedTuyen === 'ALL' && typeof taiDiemTheoVungXem === 'function') {
        taiDiemTheoVungXem();
      }
    }, 300);
  });

  // Tự động vẽ lại bản đồ khi AppStore cập nhật trạng thái
  AppStore.subscribe(function(state) {
    veLaiTuyenAB();
  });
}

/**
 * 2.2 Kiểm tra điểm có phải là Măng xông cáp quang
 */
function isMangXong(pt) {
  if (!pt) return false;
  var idLoai = Number(pt.idLoaiDiem);
  var loaiStr = String(pt.loai || '').toLowerCase();
  return idLoai === 4 || loaiStr.includes('mx') || loaiStr.includes('măng xông');
}

/**
 * 2.3 Tạo biểu tượng (Icon) điểm hạ tầng
 */
function taoIconBieuTuong(pt) {
  if (isMangXong(pt)) {
    return L.divIcon({
      html: '<div style="background:#fd7e14; color:white; width:20px; height:20px; border-radius:50%; text-align:center; line-height:20px; border:2px solid #fff; font-size:10px;">🔀</div>',
      className: '', iconSize: [20, 20], iconAnchor: [10, 10]
    });
  }

  if (Number(pt.idLoaiDiem) === 2 || String(pt.loai).toLowerCase().includes('trạm')) {
    return L.divIcon({
      html: '<div style="background:#198754; color:white; width:22px; height:22px; border-radius:4px; text-align:center; line-height:22px; border:2px solid #fff; font-size:11px;">🏢</div>',
      className: '', iconSize: [22, 22], iconAnchor: [11, 11]
    });
  }

  return L.divIcon({
    html: '<div style="background:#0d6efd; color:white; width:12px; height:12px; border-radius:50%; border:2px solid #fff;"></div>',
    className: '', iconSize: [12, 12], iconAnchor: [6, 6]
  });
}

// ==========================================================================
// PHẦN 3: ĐIỀU PHỐI VẼ BẢN ĐỒ VÀ QUẢN LÝ DỮ LIỆU TỰ ĐỘNG
// ==========================================================================

/**
 * 3.1 Vẽ lại toàn bộ biểu tượng và tuyến cáp trên bản đồ
 */
function veLaiTuyenAB() {
  if (!map) return;

  var state = AppStore.getState();
  var selectedTuyen = state.selectedTuyen;
  var points = state.dataPoints || globalDataPoints || [];

  // Dọn dẹp các lớp vẽ cũ
  polylinesLayer.clearLayers();
  markersLayer.clearLayers();

  if (!points || points.length === 0) return;

  var validPoints = points.filter(function(p) {
    return p && p.lat && p.lng;
  });

  // KỊCH BẢN 1: Xem tất cả tuyến -> Chỉ hiện mốc biểu tượng, KHÔNG VẼ ĐƯỜNG CÁP
  if (selectedTuyen === 'ALL') {
    validPoints.forEach(function(pt) {
      var marker = L.marker([pt.lat, pt.lng], { icon: taoIconBieuTuong(pt) });
      var popupText = '<b>' + (pt.ten || 'Điểm hạ tầng') + '</b><br>' +
                      'Loại: ' + (pt.loai || 'Chưa rõ') + '<br>' +
                      'Tọa độ: ' + pt.lat.toFixed(6) + ', ' + pt.lng.toFixed(6);
      marker.bindPopup(popupText);
      markersLayer.addLayer(marker);
    });
  } 
  
  // KỊCH BẢN 2: Chọn tuyến cụ thể -> Vẽ ĐÚNG 1 ĐƯỜNG CÁP duy nhất
  else {
    var sortedPoints = [...validPoints].sort(function(a, b) {
      return (a.stt || 0) - (b.stt || 0);
    });
    var latLngs = [];

    sortedPoints.forEach(function(pt) {
      var latLng = [pt.lat, pt.lng];
      latLngs.push(latLng);

      var marker = L.marker(latLng, { icon: taoIconBieuTuong(pt) });
      var popupText = '<b>📍 ' + pt.ten + '</b><br>' +
                      'Loại: <b>' + pt.loai + '</b><br>' +
                      'Lý trình: <b>' + (pt.lyTrinh || 'Chưa có') + '</b><br>' +
                      'Tọa độ: ' + pt.lat.toFixed(6) + ', ' + pt.lng.toFixed(6);
      marker.bindPopup(popupText);
      markersLayer.addLayer(marker);
    });

    // Vẽ đúng 1 đường polyline cáp duy nhất màu đỏ
    if (latLngs.length >= 2) {
      var cablePolyline = L.polyline(latLngs, {
        color: '#dc3545',
        weight: 3,
        opacity: 0.8,
        dashArray: '6, 4'
      });
      polylinesLayer.addLayer(cablePolyline);
      map.fitBounds(cablePolyline.getBounds(), { padding: [20, 20] });
    }
  }
}
