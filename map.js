// ==========================================================================
// TỆP MAP.JS - BẢN ĐỒ LEAFLET & ĐỘNG CƠ TÍNH TOÁN HÌNH HỌC GIS / OTDR
// ==========================================================================

// Biến toàn cục quản lý Bản đồ và các Lớp hiển thị
var map = null;
var markersLayer = null;      // Lớp chứa các điểm / cụm biểu tượng (MarkerCluster)
var polylinesLayer = null;    // Lớp chứa đường cáp quang Polyline
var mxLayer = null;           // Lớp chứa riêng biểu tượng Măng xông
var foundMarkerLayer = null;  // Lớp chứa mốc tìm kiếm / Sự cố OTDR

var mapMoveDebounceTimer = null; // Bộ đếm thời gian hoãn nạp dữ liệu khi kéo bản đồ

// ==========================================================================
// PHẦN 1: CÁC HÀM THUẬT TOÁN HÌNH HỌC & ĐO TÍNH OTDR / LÝ TRÌNH
// ==========================================================================

/**
 * 1.1 TÍNH KHOẢNG CÁCH HAVERSINE GIỮA 2 TỌA ĐỘ GPS (TRẢ VỀ SỐ MÉT)
 */
function calculateHaversine(lat1, lon1, lat2, lon2) {
  var R = 6371000; // Bán kính Trái Đất tính bằng mét
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLon = (lon2 - lon1) * Math.PI / 180;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Khoảng cách thực tế (mét)
}

/**
 * 1.2 BỔ THÊM HOẶC CHUYỂN ĐỔI CHUỖI LÝ TRÌNH (VD: "54+100" -> 54100 mét)
 */
function parseLyTrinhWithSuffix(txt) {
  if (!txt) return null;
  var str = String(txt).trim().toLowerCase();
  
  // Loại bỏ các tiền tố như "km", "ly trình", "lt"
  str = str.replace(/^(km|ly trình|lt)\s*/i, '');
  
  // Trường hợp dạng 54+100 hoặc 54k100
  if (str.includes('+') || str.includes('k')) {
    var parts = str.split(/[+k]/);
    var km = parseFloat(parts[0]) || 0;
    var m = parseFloat(parts[1]) || 0;
    return { meters: km * 1000 + m, text: `${km}+${m}` };
  }
  
  // Trường hợp chỉ nhập số nguyên (VD: 54100)
  var num = parseFloat(str);
  if (!isNaN(num)) {
    var kmVal = Math.floor(num / 1000);
    var mVal = num % 1000;
    return { meters: num, text: `${kmVal}+${mVal}` };
  }
  
  return null;
}

/**
 * 1.3 LẤY TRỤC ĐƯỜNG CÁP CHUẨN (BACKBONE) CỦA TUYẾN CÁP
 */
function getMasterRouteBackbone(tuyenVal, tramVal, doanVal) {
  var state = AppStore.getState();
  var pts = state.dataPoints || globalDataPoints || [];
  
  if (!pts || pts.length === 0) return [];

  // Lọc danh sách điểm hợp lệ có đủ tọa độ
  var validPts = pts.filter(p => p && !isNaN(p.lat) && !isNaN(p.lng));

  // Sắp xếp các điểm theo thứ tự STT
  return validPts.sort((a, b) => (a.stt || 0) - (b.stt || 0));
}

/**
 * 1.4 TÍNH TOÁN TRƯỚC CỰ LY LŨY KẾ VÀ LÝ TRÌNH CHO DÃY ĐIỂM
 */
function precalculateRouteDataForPoints(backbone, points) {
  if (!backbone || backbone.length === 0) return;

  var currentDistMeters = 0;
  backbone[0].distanceFromAMeters = 0;

  // Tính lũy kế khoảng cách từ Trạm A dọc theo tuyến cáp
  for (var i = 0; i < backbone.length - 1; i++) {
    var segLen = calculateHaversine(
      backbone[i].lat, backbone[i].lng,
      backbone[i+1].lat, backbone[i+1].lng
    );
    currentDistMeters += segLen;
    backbone[i+1].distanceFromAMeters = currentDistMeters;
  }

  // Ép lý trình số nếu có thông tin lý trình chuỗi
  points.forEach(p => {
    var parsed = parseLyTrinhWithSuffix(p.lyTrinh);
    p.calculatedLyTrinhMeters = parsed ? parsed.meters : undefined;
  });
}

/**
 * 1.5 TÍNH KHOẢNG CÁCH TỪ TRẠM GỐC A TỚI MỘT ĐIỂM BẤT KỲ TRÊN BẢN ĐỒ
 */
function getDistanceAlongRoute(targetPt, backbone) {
  if (!backbone || backbone.length === 0) return 0;
  
  var minDist = Infinity;
  var closestIndex = 0;

  // Tìm điểm thuộc tuyến gần nhất với vị trí cần tính
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
 * 1.6 LẤY DANH SÁCH ĐIỂM THUỘC TUYẾN ĐANG CHỌN TRÊN BẢNG ĐIỀU KHIỂN
 */
function getPointsCuaTuyenHienTai() {
  var state = AppStore.getState();
  var pts = state.dataPoints || globalDataPoints || [];
  var selectedTuyen = state.selectedTuyen;

  if (selectedTuyen === 'ALL') return pts;

  var filtered = pts.filter(p => String(p.idTuyen) === String(selectedTuyen));
  var backbone = getMasterRouteBackbone(selectedTuyen, 'ALL', 'ALL');
  precalculateRouteDataForPoints(backbone, filtered);

  return filtered;
}

// ==========================================================================
// PHẦN 2: KHỞI TẠO BẢN ĐỒ LEAFLET & TRÌNH DIỄN BIỂU TƯỢNG (ICONS)
// ==========================================================================

/**
 * 2.1 KHỞI TẠO BẢN ĐỒ LEAFLET
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

  // Nền Bản đồ Đường phố (OpenStreetMap)
  var osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(map);

  // Nền Bản đồ Vệ tinh (Google Maps)
  var googleSatLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    attribution: '© Google Maps'
  });

  var baseMaps = {
    "🗺️ Bản đồ đường phố": osmLayer,
    "🛰️ Bản đồ vệ tinh": googleSatLayer
  };
  L.control.layers(baseMaps, null, { position: 'topright' }).addTo(map);

  // Khởi tạo các Lớp hiển thị
  polylinesLayer = L.layerGroup().addTo(map);
  mxLayer = L.layerGroup().addTo(map);

  // Lắng nghe sự kiện di chuyển bản đồ (Hoãn 300ms chống nháy)
  map.on('moveend', function() {
    if (mapMoveDebounceTimer) clearTimeout(mapMoveDebounceTimer);
    mapMoveDebounceTimer = setTimeout(function() {
      var state = AppStore.getState();
      if (state.selectedTuyen === 'ALL' && typeof taiDiemTheoVungXem === 'function') {
        taiDiemTheoVungXem();
      }
    }, 300);
  });

  // Đăng ký lắng nghe làm mới bản đồ khi trạng thái AppStore thay đổi
  AppStore.subscribe(function(state) {
    veLaiTuyenAB();
  });
}

/**
 * 2.2 KIỂM TRA ĐIỂM CÓ PHẢI LÀ MĂNG XÔNG CÁP QUANG TỰ ĐỘNG
 */
function isMangXong(pt) {
  if (!pt) return false;
  var idLoai = Number(pt.idLoaiDiem);
  var loaiStr = String(pt.loai || '').toLowerCase();
  return idLoai === 4 || loaiStr.includes('mx') || loaiStr.includes('măng xông');
}

/**
 * 2.3 TẠO BIỂU TƯỢNG (ICON) ĐIỂM HẠ TẦNG
 */
function taoIconBieuTuong(pt) {
  var isMX = isMangXong(pt);
  var idLoai = Number(pt.idLoaiDiem);

  // Icon 1: Măng xông (Hình tròn màu cam)
  if (isMX) {
    return L.divIcon({
      html: '<div style="background:#fd7e14; color:white; width:22px; height:22px; border-radius:50%; text-align:center; line-height:22px; border:2px solid #fff; box-shadow:0 0 4px rgba(0,0,0,0.5); font-size:11px;">🔀</div>',
      className: '',
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    });
  }

  // Icon 2: Trạm viễn thông (Hình vuông xanh lá)
  if (idLoai === 2 || String(pt.loai).toLowerCase().includes('trạm')) {
    return L.divIcon({
      html: '<div style="background:#198754; color:white; width:24px; height:24px; border-radius:4px; text-align:center; line-height:24px; border:2px solid #fff; box-shadow:0 0 4px rgba(0,0,0,0.5); font-size:12px;">🏢</div>',
      className: '',
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
  }

  // Icon 3: Cột / Bể / Chấm hạ tầng (Chấm tròn xanh dương)
  return L.divIcon({
    html: '<div style="background:#0d6efd; color:white; width:14px; height:14px; border-radius:50%; border:2px solid #fff; box-shadow:0 0 3px rgba(0,0,0,0.4);"></div>',
    className: '',
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });
}

// ==========================================================================
// PHẦN 3: ĐIỀU PHỐI VẼ LẠI TOÀN BỘ BẢN ĐỒ
// ==========================================================================

/**
 * 3.1 VẼ LẠI CÁC ĐIỂM VÀ ĐƯỜNG CÁP POLYLINE TRÊN BẢN ĐỒ
 */
function veLaiTuyenAB() {
  if (!map) return;

  var state = AppStore.getState();
  var selectedTuyen = state.selectedTuyen;
  var points = state.dataPoints || globalDataPoints || [];

  // Dọn dẹp các lớp cũ
  if (markersLayer) {
    map.removeLayer(markersLayer);
    markersLayer = null;
  }
  if (polylinesLayer) polylinesLayer.clearLayers();
  if (mxLayer) mxLayer.clearLayers();

  if (!points || points.length === 0) return;

  // CHẾ ĐỘ 1: XEM TẤT CẢ TUYẾN (GOM CỤM MARKER CLUSTER)
  if (selectedTuyen === 'ALL') {
    if (typeof L.markerClusterGroup === 'function') {
      markersLayer = L.markerClusterGroup({
        chunkedLoading: true,
        maxClusterRadius: 50
      });
    } else {
      markersLayer = L.featureGroup();
    }

    points.forEach(function(pt) {
      if (pt.lat && pt.lng) {
        var marker = L.marker([pt.lat, pt.lng], { icon: taoIconBieuTuong(pt) });
        var popupText = `<b>${pt.ten || 'Điểm hạ tầng'}</b><br>` +
                        `Loại: ${pt.loai || 'Chưa rõ'}<br>` +
                        `Tọa độ: ${pt.lat.toFixed(6)}, ${pt.lng.toFixed(6)}<br>` +
                        (pt.ghiChu ? `Ghi chú: ${pt.ghiChu}` : '');
        marker.bindPopup(popupText);
        markersLayer.addLayer(marker);
      }
    });

    map.addLayer(markersLayer);
  } 
  
  // CHẾ ĐỘ 2: PHÂN TÍCH CHI TIẾT THEO TUYẾN CÁP CỤ THỂ
  else {
    markersLayer = L.featureGroup();
    var latLngs = [];

    var sortedPoints = [...points].sort(function(a, b) {
      return (a.stt || 0) - (b.stt || 0);
    });

    sortedPoints.forEach(function(pt) {
      if (pt.lat && pt.lng) {
        var ptLatLng = [pt.lat, pt.lng];
        latLngs.push(ptLatLng);

        var marker = L.marker(ptLatLng, { icon: taoIconBieuTuong(pt) });
        var popupText = `<b>📍 ${pt.ten || 'Điểm tuyến'}</b><br>` +
                        `Loại: <b>${pt.loai}</b><br>` +
                        `Lý trình: <b>${pt.lyTrinh || 'Chưa có'}</b><br>` +
                        `Dự trữ cáp: <b>${pt.duTru || 0} m</b><br>` +
                        `Tọa độ: ${pt.lat.toFixed(6)}, ${pt.lng.toFixed(6)}<br>` +
                        `<a href="https://maps.google.com/?q=${pt.lat},${pt.lng}" target="_blank" class="btn-info" style="display:inline-block; margin-top:5px; color:white; background:#0d6efd; padding:2px 6px; border-radius:3px; text-decoration:none;">🗺️ Mở Google Maps</a>`;
        
        marker.bindPopup(popupText);
        markersLayer.addLayer(marker);
      }
    });

    // Vẽ nét đứt Polyline cáp quang màu đỏ
    if (latLngs.length >= 2) {
      var cablePolyline = L.polyline(latLngs, {
        color: '#dc3545',
        weight: 4,
        opacity: 0.85,
        dashArray: '8, 4'
      });
      polylinesLayer.addLayer(cablePolyline);
      map.fitBounds(cablePolyline.getBounds(), { padding: [30, 30] });
    }

    map.addLayer(markersLayer);
  }
}
