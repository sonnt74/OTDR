// ---------------- KHỞI TẠO BIẾN TOÀN CỤC VÀ SUPABASE ----------------
const SUPABASE_URL = 'https://clddwitzwuewwxawuorv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_U3tMbsj5oQ9Wub1UAJO5Cw_NXt6Px8E';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

var currentUser = { isLoggedIn: false, role: 'member', idDai: null, idTram: null, canEditMap: false };
var map = null;

var markersLayer = L.markerClusterGroup({ maxClusterRadius: 40 });
var mxLayer = L.layerGroup();
var polylinesLayer = L.layerGroup();
var userLocationLayer = L.layerGroup();
var measureLayer = L.layerGroup();
var foundMarkerLayer = null;

var isMeasuring = false;
var measurePoints = [];

var rawDaiList = [];
var rawTramList = [];
var rawTuyenList = [];
var rawDoanCapList = [];
var rawLoaiDiemList = [];
var globalDataPoints = [];

// ---------------- TỰ ĐỘNG ĐĂNG NHẬP KHI MỞ TRANG ----------------
window.onload = function() {
  var savedSession = localStorage.getItem('tnn_user');
  if (savedSession) {
    currentUser = JSON.parse(savedSession);
    document.getElementById('loginModal').style.display = 'none';
    document.getElementById('sidebar-menu').style.display = 'flex';
    document.getElementById('control-panel').style.display = 'block';
    if (currentUser.role === 'sys_admin' || currentUser.role === 'dai_admin') {
      document.getElementById('adminMenuIcon').style.display = 'flex';
    }
    khoiTaoBanDoLeaflet();
    taiDuLieuSupabase();
  }
};

// ---------------- CÁC HÀM TIỆN ÍCH GIAO DIỆN ----------------
function toggleGISPanel() {
  var panel = document.getElementById('control-panel');
  panel.style.display = (panel.style.display === 'none' || panel.style.display === '') ? 'block' : 'none';
}

function closeModals() {
  document.querySelectorAll('.app-modal').forEach(modal => {
    if (modal.id !== 'loginModal' || !currentUser.isLoggedIn) modal.style.display = 'none';
  });
}

function showLoading(msg) {
  document.getElementById('loading-overlay-text').innerText = msg;
  document.getElementById('loading-overlay').style.display = 'flex';
}

function hideLoading() {
  document.getElementById('loading-overlay').style.display = 'none';
}

function switchAdminTab(tabId) {
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  event.target.classList.add('active');
}

function openModal(id, tabId = null) {
  closeModals();
  document.getElementById(id).style.display = 'flex';
  if (id === 'adminMasterModal') {
    if (tabId) switchAdminTab(tabId);
    loadAdminMasterData();
  }
}

// ---------------- ĐĂNG NHẬP & ĐĂNG XUẤT ----------------
async function handleCustomLogin() {
  var email = document.getElementById('loginEmail').value.trim();
  var pass = document.getElementById('loginPass').value;
  if (!email || !pass) { alert("Vui lòng nhập đủ email và mật khẩu!"); return; }
  
  showLoading("Đang xác thực thông tin...");
  try {
    const { data, error } = await supabaseClient.from('tai_khoan').select('*').eq('email', email).eq('password', pass).single();
    if (error || !data) throw new Error("Sai thông tin tài khoản hoặc mật khẩu!");
    
    currentUser = { isLoggedIn: true, role: data.role || 'member', idDai: data.id_dai, idTram: data.id_tram, canEditMap: data.can_edit_map === true };
    localStorage.setItem('tnn_user', JSON.stringify(currentUser));
    
    document.getElementById('loginModal').style.display = 'none';
    document.getElementById('sidebar-menu').style.display = 'flex';
    document.getElementById('control-panel').style.display = 'block';
    if (currentUser.role === 'sys_admin' || currentUser.role === 'dai_admin') document.getElementById('adminMenuIcon').style.display = 'flex';
    
    khoiTaoBanDoLeaflet();
    await taiDuLieuSupabase();
  } catch (err) { alert("Lỗi: " + err.message); hideLoading(); }
}

function handleLogout() {
  localStorage.removeItem('tnn_user');
  location.reload();
}

// ---------------- ĐỊNH VỊ GPS & ĐO KHOẢNG CÁCH ----------------
function triggerUserLocation() {
  if (!navigator.geolocation) { alert("Trình duyệt không hỗ trợ GPS."); return; }
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
  }, error => { hideLoading(); alert("Lỗi GPS: " + error.message); }, { enableHighAccuracy: true, timeout: 10000 });
}

function toggleMeasureTool() {
  isMeasuring = !isMeasuring;
  var btn = document.getElementById('measure-btn');
  if (isMeasuring) {
    btn.style.background = '#0d6efd'; btn.style.color = 'white'; measurePoints = []; measureLayer.clearLayers();
    alert("Đã BẬT đo khoảng cách. Click các điểm trên bản đồ.");
  } else {
    btn.style.background = 'white'; btn.style.color = 'black'; measureLayer.clearLayers(); measurePoints = [];
    alert("Đã TẮT đo khoảng cách.");
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

// ---------------- KHỞI TẠO BẢN ĐỒ LEAFLET ----------------
function khoiTaoBanDoLeaflet() {
  if (map) return;
  var osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 21, maxNativeZoom: 19 });
  var satLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 21, maxNativeZoom: 19 });
  
  map = L.map('map', { center: [21.5942, 105.8481], zoom: 13, maxZoom: 21, layers: [osmLayer] });
  polylinesLayer.addTo(map); markersLayer.addTo(map); mxLayer.addTo(map); userLocationLayer.addTo(map); measureLayer.addTo(map);
  
  L.control.layers({ "Bản đồ OSM": osmLayer, "Vệ tinh": satLayer }, { "Tuyến cáp quang": polylinesLayer, "Cột/Bể cáp": markersLayer, "Măng xông": mxLayer }, { position: 'topright' }).addTo(map);
  
  map.on('contextmenu', e => {
    if (currentUser.canEditMap || currentUser.role === 'sys_admin') moFormCrud('ADD', null, '', e.latlng.lat.toFixed(6), e.latlng.lng.toFixed(6));
    else alert("Không có quyền thêm điểm.");
  });
  map.on('click', e => { if (isMeasuring) { measurePoints.push(e.latlng); redrawMeasureLayer(); } });
}

// ---------------- ĐỒNG BỘ DỮ LIỆU TỪ SUPABASE ----------------
async function fetchAllRowsSafe(tableName) {
  let size = 1000, from = 0, allData = [], keep = true;
  while (keep) {
    let { data, error } = await supabaseClient.from(tableName).select('*').range(from, from + size - 1);
    if (error) throw error;
    if (data && data.length > 0) { allData = allData.concat(data); if (data.length < size) keep = false; else from += size; } else keep = false;
  }
  return allData;
}

async function taiDuLieuSupabase(forceRefresh = false) {
  showLoading("Đang tải dữ liệu...");
  try {
    let [daiRes, tramRes, tuyenRes, doanRes, diemRes, dcdRes, loaiRes] = await Promise.all([
      supabaseClient.from('dai_vt').select('*'), supabaseClient.from('tram_vt').select('*'),
      supabaseClient.from('tuyen_cap').select('*'), supabaseClient.from('doan_cap').select('*'),
      fetchAllRowsSafe('diem_ha_tang'), fetchAllRowsSafe('doan_cap_diem'), supabaseClient.from('loai_diem').select('*')
    ]);
    
    rawDaiList = daiRes.data || []; rawTramList = tramRes.data || []; rawTuyenList = tuyenRes.data || [];
    rawDoanCapList = doanRes.data || []; rawLoaiDiemList = loaiRes.data || [];
    
    var diemMap = {}, doanCapMap = {}, loaiDiemMap = {};
    diemRes.forEach(d => diemMap[d.id_diem || d.id] = d);
    rawDoanCapList.forEach(dc => doanCapMap[dc.id_doan_cap || dc.id] = dc);
    rawLoaiDiemList.forEach(l => loaiDiemMap[l.id_loaidiem || l.id] = l.ten_loaidiem);

    globalDataPoints = [];
    dcdRes.forEach(item => {
      var pt = diemMap[item.id_diem || item.diem_id], dc = doanCapMap[item.id_doan_cap || item.doan_cap_id];
      if (!pt || isNaN(parseFloat(pt.lat))) return;
      var idLoai = pt.id_loaidiem || 1, loaiName = loaiDiemMap[idLoai] || 'Điểm';
      var isMx = (Number(idLoai) === 4 || loaiName.toLowerCase().includes('mx') || loaiName.toLowerCase().includes('măng xông'));
      
      globalDataPoints.push({
        id: pt.id_diem || pt.id, ten: pt.ten_diem || pt.ten, lat: parseFloat(pt.lat), lng: parseFloat(pt.long || pt.lng),
        ghiChu: pt.ghi_chu || '', idTuyen: dc ? (dc.id_tuyen || dc.tuyen_cap_id) : null,
        idDoanCap: item.id_doan_cap || item.doan_cap_id, idTram: pt.id_tram || 2, idLoaiDiem: idLoai,
        loai: loaiName, lyTrinh: pt.ly_trinh || '', duTru: pt.du_tru ? parseFloat(pt.du_tru) : 0, stt: isMx ? 9999 : (item.thu_tu || 1)
      });
    });

    khoiTaoComboDaiTheoPhanCap();
    if (forceRefresh) alert("Đã làm mới dữ liệu!");
  } catch (err) { alert("Lỗi: " + err.message); } finally { hideLoading(); if (map) map.invalidateSize(); }
}

// ---------------- COMBOBOX & LỌC DỮ LIỆU ----------------
function khoiTaoComboDaiTheoPhanCap() {
  var selectDai = document.getElementById('selectDai');
  selectDai.innerHTML = '<option value="ALL">-- Tất cả Đài --</option>';
  rawDaiList.forEach(dai => selectDai.innerHTML += `<option value="${dai.id_dai}">${dai.ten_dai}</option>`);
  if (currentUser.role === 'dai_admin' && currentUser.idDai) { selectDai.value = currentUser.idDai; selectDai.disabled = true; }
  onDaiChange();
}

function onDaiChange() {
  var daiVal = document.getElementById('selectDai').value;
  var selectTram = document.getElementById('selectTram');
  selectTram.innerHTML = '<option value="ALL">-- Tất cả Trạm --</option>';
  rawTramList.filter(tram => daiVal === 'ALL' || tram.id_dai == daiVal)
             .forEach(tram => selectTram.innerHTML += `<option value="${tram.id_tram}">${tram.ten_tram}</option>`);
  if (currentUser.role === 'tram_admin' && currentUser.idTram) { selectTram.value = currentUser.idTram; selectTram.disabled = true; }
  updateTuyenOptions();
}

function onTramChange() { updateTuyenOptions(); }

function updateTuyenOptions() {
  var selectTuyen = document.getElementById('selectTuyen');
  selectTuyen.innerHTML = '<option value="ALL">-- Chọn tuyến cáp --</option>';
  rawTuyenList.forEach(tuyen => selectTuyen.innerHTML += `<option value="${tuyen.id_tuyen_cap}">${tuyen.ma_tuyencap}</option>`);
  onTuyenChange();
}

function onTuyenChange() {
  var tuyenVal = document.getElementById('selectTuyen').value;
  var selectDoanCap = document.getElementById('selectDoanCap');
  selectDoanCap.innerHTML = '<option value="ALL">-- Tất cả đoạn cáp --</option>';
  if (tuyenVal !== 'ALL') {
    rawDoanCapList.filter(doan => doan.id_tuyen == tuyenVal)
                  .forEach(doan => selectDoanCap.innerHTML += `<option value="${doan.id_doan_cap}">${doan.ma_doancap}</option>`);
  }
  capNhatComboDiemA();
  veLaiTuyenAB();
}

function onDoanCapChange() { veLaiTuyenAB(); }
function onDiemAChange() { veLaiTuyenAB(); }

function capNhatComboDiemA() {
  var tuyenVal = document.getElementById('selectTuyen').value;
  var combo = document.getElementById('comboDiemA');
  combo.innerHTML = '<option value="DEFAULT">📍 Trạm Gốc (TNN)</option>';
  
  globalDataPoints.filter(pt => isMangXong(pt) && (tuyenVal === 'ALL' || pt.idTuyen == tuyenVal)).forEach(mx => {
    combo.innerHTML += `<option value="${mx.ten}">🔀 ${mx.ten}</option>`;
  });
}

function isMangXong(pt) {
  var name = (pt.loai || '').toUpperCase();
  return Number(pt.idLoaiDiem) === 4 || name.includes('MX') || name.includes('MĂNG XÔNG');
}

function getPointsCuaTuyenHienTai() {
  var tuyenVal = document.getElementById('selectTuyen').value;
  var tramVal = document.getElementById('selectTram').value;
  var doanVal = document.getElementById('selectDoanCap').value;
  if (tuyenVal === 'ALL') return [];
  
  var filteredPts = globalDataPoints.filter(pt => !isMangXong(pt) && pt.idTuyen == tuyenVal && (tramVal === 'ALL' || pt.idTram == tramVal) && (doanVal === 'ALL' || pt.idDoanCap == doanVal));
  filteredPts.sort((a, b) => a.stt - b.stt);
  
  if (filteredPts.length > 0) {
    var hasBase = filteredPts.some(p => Math.abs(p.lat - 21.593365) < 0.0001);
    if (!hasBase) {
      filteredPts.unshift({ ten: "Trạm TNN", lat: 21.593365, lng: 105.839945, lyTrinh: "", idTuyen: tuyenVal, stt: -9999, loai: "Trạm" });
    }
  }
  return document.getElementById('chkNghichHuong').checked ? filteredPts.slice().reverse() : filteredPts;
}

// ---------------- VẼ TUYẾN CÁP & KÉO THẢ TỌA ĐỘ ----------------
function veLaiTuyenAB() {
  if (!map) return;
  markersLayer.clearLayers(); mxLayer.clearLayers(); polylinesLayer.clearLayers();
  var pts = getPointsCuaTuyenHienTai(), bounds = [];
  if (pts.length === 0) return;
  
  var tuyenVal = document.getElementById('selectTuyen').value, tramVal = document.getElementById('selectTram').value, doanVal = document.getElementById('selectDoanCap').value;
  var isDraggable = (currentUser.canEditMap || currentUser.role === 'sys_admin');

  function taoNutHanhDong(id, ten, lat, lng) {
    return isDraggable ? `<hr style="margin:4px 0;"><button class="btn-small" onclick="moFormCrud('EDIT','${id}','${ten}',${lat},${lng})">✏️ Sửa Tên</button><button class="btn-small del" onclick="moFormCrud('DELETE','${id}','${ten}',${lat},${lng})">🗑️ Xóa</button>` : '';
  }

  async function handleDragEnd(e, ptObj) {
    var newPos = e.target.getLatLng();
    if (confirm(`Lưu tọa độ mới cho [${ptObj.ten}]?`)) {
      showLoading("Đang lưu tọa độ...");
      try {
        const { error } = await supabaseClient.from('diem_ha_tang').update({ lat: newPos.lat, long: newPos.lng }).eq('id_diem', ptObj.id);
        if (error) throw error;
        hideLoading(); taiDuLieuSupabase();
      } catch (err) { alert("Lỗi: " + err.message); hideLoading(); e.target.setLatLng([ptObj.lat, ptObj.lng]); }
    } else { e.target.setLatLng([ptObj.lat, ptObj.lng]); }
  }

  pts.forEach((pt, index) => {
    bounds.push([pt.lat, pt.lng]);
    var iconHtml = (index === 0) ? '<div class="point-a-marker">A</div>' : ((index === pts.length - 1) ? '<div class="point-b-marker">B</div>' : '<div class="standard-marker"></div>');
    var marker = L.marker([pt.lat, pt.lng], { icon: L.divIcon({ className: '', html: iconHtml, iconSize: [26, 26], iconAnchor: [13, 13] }), draggable: isDraggable });
    marker.bindPopup(`<b>${pt.ten}</b><br>Loại: ${pt.loai}<br>Lý trình: ${pt.lyTrinh || 'Không có'}` + taoNutHanhDong(pt.id, pt.ten, pt.lat, pt.lng));
    marker.on('dragend', e => handleDragEnd(e, pt));
    markersLayer.addLayer(marker);
  });

  globalDataPoints.filter(p => isMangXong(p) && p.idTuyen == tuyenVal && (tramVal === 'ALL' || p.idTram == tramVal) && (doanVal === 'ALL' || p.idDoanCap == doanVal)).forEach(mx => {
    bounds.push([mx.lat, mx.lng]);
    var mxMarker = L.marker([mx.lat, mx.lng], { icon: L.divIcon({ className: '', html: '<div class="mx-marker"></div>', iconSize: [12, 12], iconAnchor: [6, 6] }), draggable: isDraggable });
    var distToA = getDistanceAlongRoute(mx, pts);
    var distStr = (distToA >= 1000) ? (distToA / 1000).toFixed(2) + " km" : Math.round(distToA) + " m";
    var ghiChuBtn = `<button class="btn-small" style="background:#198754; margin-top:4px;" onclick="suaGhiChu('${mx.id}', '${mx.ghiChu}')">📝 Ghi chú</button>`;
    mxMarker.bindPopup(`<b>${mx.ten}</b><br>Lý trình: ${mx.lyTrinh || 'Không có'}<br>📏 Cách gốc: <b>${distStr}</b><br>` + taoNutHanhDong(mx.id, mx.ten, mx.lat, mx.lng) + ghiChuBtn);
    mxMarker.on('dragend', e => handleDragEnd(e, mx));
    mxLayer.addLayer(mxMarker);
  });

  var lineCoordinates = pts.map(p => [p.lat, p.lng]);
  if (lineCoordinates.length > 1) polylinesLayer.addLayer(L.polyline(lineCoordinates, { color: '#0d6efd', weight: 3 }));
  if (bounds.length > 0) map.fitBounds(bounds, { padding: [40, 40] });
}

async function suaGhiChu(id, oldGhiChu) {
  if (!currentUser.canEditMap && currentUser.role !== 'sys_admin') { alert("Không có quyền!"); return; }
  var newVal = prompt("Nhập nội dung ghi chú:", (oldGhiChu === 'undefined' || oldGhiChu === 'null') ? '' : oldGhiChu);
  if (newVal !== null) {
    showLoading("Đang lưu...");
    await supabaseClient.from('diem_ha_tang').update({ ghi_chu: newVal }).eq('id_diem', id);
    alert("Đã lưu!"); taiDuLieuSupabase();
  }
}

// ---------------- THUẬT TOÁN HÌNH HỌC & KHOẢNG CÁCH ----------------
function calculateHaversine(lat1, lon1, lat2, lon2) {
  var R = 6371000, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
  var a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function getDistanceAlongRoute(targetPt, pathPts) {
  var bestDist = 0, currentDist = 0, minDst = Infinity;
  for (var i = 0; i < pathPts.length - 1; i++) {
    var p1 = pathPts[i], p2 = pathPts[i+1], segLen = calculateHaversine(p1.lat, p1.lng, p2.lat, p2.lng);
    if (segLen === 0) continue;
    var dx = p2.lng - p1.lng, dy = p2.lat - p1.lat, lenSq = dx * dx + dy * dy;
    var t = Math.max(0, Math.min(1, ((targetPt.lng - p1.lng) * dx + (targetPt.lat - p1.lat) * dy) / lenSq));
    var distToProj = calculateHaversine(targetPt.lat, targetPt.lng, p1.lat + t * dy, p1.lng + t * dx);
    if (distToProj < minDst) { minDst = distToProj; bestDist = currentDist + t * segLen; }
    currentDist += segLen;
  }
  return bestDist;
}

// ---------------- PHÂN TÍCH SỰ CỐ & CHIA SẺ ----------------
function chiaSeSuCo(lat, lng, khoangCachKm, prevMX, nextMX, shareType) {
  var message = `[TNN NET1] THÔNG BÁO SỰ CỐ CÁP QUANG\n- Tọa độ: ${lat}, ${lng}\n- Cự ly đo OTDR: ${khoangCachKm} km\n- Vị trí: Nằm giữa [${prevMX}] và [${nextMX}]\n- Bản đồ: https://maps.google.com/?q=${lat},${lng}`;
  var encoded = encodeURIComponent(message);
  if (shareType === 'copy') { navigator.clipboard.writeText(message); alert("Đã sao chép nội dung!"); }
  else if (shareType === 'sms') window.open(`sms:?&body=${encoded}`, '_blank');
  else if (shareType === 'viber') window.open(`viber://forward?text=${encoded}`, '_blank');
}

function timViTriDut() {
  var kcOtdrKm = parseFloat(document.getElementById('txtKcOtdr').value), kcOtdrMeters = kcOtdrKm * 1000; 
  var heSo = parseFloat(document.getElementById('txtDoChung').value) || 1.05;
  if (isNaN(kcOtdrMeters) || kcOtdrMeters <= 0) { alert("Nhập cự ly đo hợp lệ!"); return; }
  
  var pts = getPointsCuaTuyenHienTai();
  if (pts.length < 2) { alert("Tuyến cáp chưa đủ dữ liệu!"); return; }

  var tuyenVal = document.getElementById('selectTuyen').value;
  var mxList = globalDataPoints.filter(p => isMangXong(p) && p.idTuyen == tuyenVal);
  
  var routeStops = [];
  pts.forEach(p => routeStops.push({ pt: p, dist: getDistanceAlongRoute(p, pts), duTru: 0, isMX: false }));
  mxList.forEach(m => routeStops.push({ pt: m, dist: getDistanceAlongRoute(m, pts), duTru: m.duTru || 0, isMX: true }));
  routeStops.sort((a, b) => a.dist - b.dist);

  var cumDist = 0, targetLat = pts[pts.length - 1].lat, targetLng = pts[pts.length - 1].lng;
  var closestPrevMX = "Chưa xác định", closestNextMX = "Chưa xác định";

  for (var i = 0; i < routeStops.length - 1; i++) {
    if (routeStops[i].isMX) closestPrevMX = routeStops[i].pt.ten;
    var physSeg = routeStops[i+1].dist - routeStops[i].dist;
    var opticalSeg = (physSeg * heSo) + routeStops[i+1].duTru; 
    
    if (cumDist + opticalSeg >= kcOtdrMeters) {
      var ratio = (opticalSeg > 0) ? ((kcOtdrMeters - cumDist) / opticalSeg) : 0;
      targetLat = routeStops[i].pt.lat + ratio * (routeStops[i+1].pt.lat - routeStops[i].pt.lat);
      targetLng = routeStops[i].pt.lng + ratio * (routeStops[i+1].pt.lng - routeStops[i].pt.lng);
      for (var j = i + 1; j < routeStops.length; j++) { if (routeStops[j].isMX) { closestNextMX = routeStops[j].pt.ten; break; } }
      break;
    }
    cumDist += opticalSeg;
  }

  if (foundMarkerLayer) map.removeLayer(foundMarkerLayer);
  map.setView([targetLat, targetLng], 19, { animate: true });
  
  var faultIcon = L.divIcon({ html: '<div style="background:red; color:white; width:28px; height:28px; border-radius:50%; text-align:center; line-height:28px; border:2px solid #fff; box-shadow:0 0 10px red;">⚡</div>', iconSize: [28, 28] });
  var faultMarker = L.marker([targetLat, targetLng], { icon: faultIcon }).addTo(map);
  foundMarkerLayer = faultMarker;

  var shareButtons = `<div style="margin-top: 8px; border-top: 1px dashed #ccc; padding-top: 6px;"><b>Chia sẻ sự cố:</b><br><button class="btn-info" onclick="chiaSeSuCo(${targetLat.toFixed(6)}, ${targetLng.toFixed(6)}, ${kcOtdrKm.toFixed(2)}, '${closestPrevMX}', '${closestNextMX}', 'copy')">📋 Copy</button><button class="btn-info" onclick="chiaSeSuCo(${targetLat.toFixed(6)}, ${targetLng.toFixed(6)}, ${kcOtdrKm.toFixed(2)}, '${closestPrevMX}', '${closestNextMX}', 'sms')" style="background:#28a745; color:white;">📩 SMS</button><button class="btn-info" onclick="chiaSeSuCo(${targetLat.toFixed(6)}, ${targetLng.toFixed(6)}, ${kcOtdrKm.toFixed(2)}, '${closestPrevMX}', '${closestNextMX}', 'viber')" style="background:#6f42c1; color:white;">📱 Viber</button></div>`;
  var popupHtml = `<b>⚡ VỊ TRÍ SỰ CỐ OTDR</b><br>Cự ly: <b>${kcOtdrKm.toFixed(2)} km</b><br>MX trước: <b>${closestPrevMX}</b><br>MX sau: <b>${closestNextMX}</b><br>🏛️ Địa chỉ: <span id='fault-addr'>Đang tra cứu...</span><br><a href='https://maps.google.com/?q=${targetLat},${targetLng}' target='_blank' class='gmaps-btn'>🗺️ Dẫn đường</a>${shareButtons}`;
  
  faultMarker.bindPopup(popupHtml).openPopup();
  fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${targetLat}&lon=${targetLng}&accept-language=vi`)
    .then(res => res.json()).then(data => faultMarker.setPopupContent(popupHtml.replace("Đang tra cứu...", data.display_name || "Không rõ")));
}

// ---------------- TÌM NHANH LÝ TRÌNH (QL) ----------------
function parseLyTrinh(str) {
  if (!str) return null;
  var match = str.match(/(?:km\s*)?(\d+)\s*\+\s*(\d+)/i);
  return match ? (parseInt(match[1]) * 1000 + parseInt(match[2])) : null;
}

function timLyTrinhBanDo() {
  var txt = document.getElementById('txtTimLyTrinh').value.trim();
  var targetMeters = parseLyTrinh(txt);
  if (targetMeters === null) { alert("Sai định dạng lý trình (VD: 54+100)"); return; }
  
  var pts = getPointsCuaTuyenHienTai();
  if (pts.length === 0) { alert("Không có dữ liệu tuyến."); return; }

  var heSo = parseFloat(document.getElementById('txtDoChung').value) || 1.05;
  var bestPt = null;
  var minDiff = Infinity;

  pts.forEach(p => {
    var pMeters = parseLyTrinh(p.lyTrinh);
    if (pMeters !== null) {
      var diff = Math.abs(pMeters - targetMeters);
      if (diff < minDiff) { minDiff = diff; bestPt = p; }
    }
  });

  if (!bestPt || minDiff > 5000) {
    var baseMeters = 0;
    pts.forEach(p => { let m = parseLyTrinh(p.lyTrinh); if (m !== null && baseMeters === 0) baseMeters = m; });
    minDiff = Infinity;
    pts.forEach(p => {
      var distToA = getDistanceAlongRoute(p, pts) * heSo;
      var estimated = baseMeters + distToA;
      var diff = Math.abs(estimated - targetMeters);
      if (diff < minDiff) { minDiff = diff; bestPt = p; }
    });
  }

  if (!bestPt) { alert("Không tìm thấy lý trình phù hợp!"); return; }

  var distToA = getDistanceAlongRoute(bestPt, pts) * heSo;
  var distStr = (distToA >= 1000) ? (distToA / 1000).toFixed(2) + " km" : Math.round(distToA) + " m";

  if (foundMarkerLayer) map.removeLayer(foundMarkerLayer);
  map.setView([bestPt.lat, bestPt.lng], 19, { animate: true });
  
  foundMarkerLayer = L.marker([bestPt.lat, bestPt.lng], { icon: L.divIcon({ html: '<div style="background:#fd7e14; font-size:24px;">📍</div>', className: '' }) }).addTo(map);
  
  var popupContent = `<b>Lý trình tìm kiếm: ${txt}</b><br>Điểm mốc: ${bestPt.ten} (LT: ${bestPt.lyTrinh||'Chưa nhập'})<br>📏 Cự ly cáp quang tới Trạm A: <b>${distStr}</b><br>🏛️ <span id='lt-addr'>Đang tra cứu...</span>`;
  foundMarkerLayer.bindPopup(popupContent).openPopup();
  
  fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${bestPt.lat}&lon=${bestPt.lng}&accept-language=vi`)
    .then(r => r.json()).then(data => foundMarkerLayer.setPopupContent(popupContent.replace("Đang tra cứu...", data.display_name || "Không rõ")));
}

// ---------------- QUẢN TRỊ HỆ THỐNG & DANH MỤC ----------------
async function loadAdminMasterData() {
  if (currentUser.role !== 'sys_admin' && currentUser.role !== 'dai_admin') return;
  var query = supabaseClient.from('tai_khoan').select('*');
  if (currentUser.role === 'dai_admin') query = query.eq('id_dai', currentUser.idDai);
  
  const { data: accs } = await query;
  var accHtml = '';
  (accs || []).forEach(a => {
    var daiObj = rawDaiList.find(d => d.id_dai == a.id_dai);
    var tramObj = rawTramList.find(t => t.id_tram == a.id_tram);
    accHtml += `<tr><td><b>${a.email}</b></td><td>${a.role}</td><td>${daiObj ? daiObj.ten_dai : '-'}</td><td>${tramObj ? tramObj.ten_tram : '-'}</td><td>${a.can_edit_map ? '✅' : '❌'}</td><td><button class="btn-small" onclick="moFormSuaTaiKhoan(${a.id},'${a.email}','${a.role}',${a.id_dai || 'null'},${a.id_tram || 'null'},${a.can_edit_map})">✏️</button> ${currentUser.role === 'sys_admin' ? `<button class="btn-small del" onclick="xoaTaiKhoan(${a.id})">🗑️</button>` : ''}</td></tr>`;
  });
  document.getElementById('masterAccountTableBody').innerHTML = accHtml;
  
  var taoNutXoa = (tbl, col, val) => currentUser.role === 'sys_admin' ? `<button class="btn-small del" onclick="xoaAuxRecord('${tbl}','${col}',${val})">🗑️</button>` : '⛔';
  
  document.getElementById('masterDaiTableBody').innerHTML = rawDaiList.map(d => `<tr><td>${d.id_dai}</td><td>${d.ten_dai}</td><td>${taoNutXoa('dai_vt','id_dai',d.id_dai)}</td></tr>`).join('');
  document.getElementById('masterTramTableBody').innerHTML = rawTramList.map(t => {
    var d = rawDaiList.find(x => x.id_dai == t.id_dai); return `<tr><td>${t.id_tram}</td><td>${t.ten_tram}</td><td>${d ? d.ten_dai : '-'}</td><td>${taoNutXoa('tram_vt','id_tram',t.id_tram)}</td></tr>`;
  }).join('');
  document.getElementById('masterTuyenTableBody').innerHTML = rawTuyenList.map(t => `<tr><td>${t.id_tuyen_cap}</td><td>${t.ma_tuyencap}</td><td>${t.ten_tuyencap || ''}</td><td>${taoNutXoa('tuyen_cap','id_tuyen_cap',t.id_tuyen_cap)}</td></tr>`).join('');
  document.getElementById('masterDoanTableBody').innerHTML = rawDoanCapList.map(d => {
    var ty = rawTuyenList.find(x => x.id_tuyen_cap == d.id_tuyen); return `<tr><td>${d.id_doan_cap}</td><td>${d.ma_doancap}</td><td>${ty ? ty.ma_tuyencap : '-'}</td><td>${taoNutXoa('doan_cap','id_doan_cap',d.id_doan_cap)}</td></tr>`;
  }).join('');
}

function populateDropdown(selId, list, idProp, nameProp, selectedVal) {
  var sel = document.getElementById(selId);
  sel.innerHTML = '<option value="">-- Chọn --</option>';
  list.forEach(item => sel.innerHTML += `<option value="${item[idProp]}" ${item[idProp] == selectedVal ? 'selected' : ''}>${item[nameProp]}</option>`);
}

function chuanBiFormThemThanhVien() {
  document.getElementById('editingAccountId').value = '';
  document.getElementById('newMemberCanEdit').checked = false;
  document.getElementById('newMemberEmail').value = ''; document.getElementById('newMemberPass').value = '';
  populateDropdown('newMemberDai', rawDaiList, 'id_dai', 'ten_dai', null);
  populateDropdown('newMemberTram', rawTramList, 'id_tram', 'ten_tram', null);
  openModal('addMemberModal');
}

function moFormSuaTaiKhoan(id, email, role, dai, tram, canEdit) {
  document.getElementById('editingAccountId').value = id;
  document.getElementById('newMemberEmail').value = email; document.getElementById('newMemberPass').value = '';
  document.getElementById('newMemberRole').value = role; document.getElementById('newMemberCanEdit').checked = (canEdit === true);
  populateDropdown('newMemberDai', rawDaiList, 'id_dai', 'ten_dai', dai);
  populateDropdown('newMemberTram', rawTramList, 'id_tram', 'ten_tram', tram);
  openModal('addMemberModal');
}

async function saveAccountAction() {
  var id = document.getElementById('editingAccountId').value;
  var payload = {
    email: document.getElementById('newMemberEmail').value.trim(),
    role: document.getElementById('newMemberRole').value,
    can_edit_map: document.getElementById('newMemberCanEdit').checked,
    id_dai: document.getElementById('newMemberDai').value ? parseInt(document.getElementById('newMemberDai').value) : null,
    id_tram: document.getElementById('newMemberTram').value ? parseInt(document.getElementById('newMemberTram').value) : null
  };
  var pass = document.getElementById('newMemberPass').value;
  if (pass) payload.password = pass;
  
  showLoading("Đang lưu...");
  try {
    if (!id) await supabaseClient.from('tai_khoan').insert([payload]);
    else await supabaseClient.from('tai_khoan').update(payload).eq('id', id);
    alert("Lưu thành công!"); openModal('adminMasterModal', 'tab-accounts');
  } catch (err) { alert("Lỗi: " + err.message); } finally { hideLoading(); }
}

async function xoaTaiKhoan(id) {
  if (confirm("Xóa tài khoản này?")) { await supabaseClient.from('tai_khoan').delete().eq('id', id); loadAdminMasterData(); }
}

function moFormThemDai() { document.getElementById('auxTableType').value = 'dai_vt'; document.getElementById('auxFormFields').innerHTML = '<label>Tên đài:</label><input type="text" id="auxName" class="form-group">'; openModal('genericAuxModal'); }
function moFormThemTram() { document.getElementById('auxTableType').value = 'tram_vt'; document.getElementById('auxFormFields').innerHTML = '<label>Tên trạm:</label><input type="text" id="auxName" class="form-group"><label>Thuộc Đài:</label><select id="auxRefId" class="form-group"></select>'; populateDropdown('auxRefId', rawDaiList, 'id_dai', 'ten_dai', null); openModal('genericAuxModal'); }
function moFormThemTuyen() { document.getElementById('auxTableType').value = 'tuyen_cap'; document.getElementById('auxFormFields').innerHTML = '<label>Mã Tuyến:</label><input type="text" id="auxName" class="form-group">'; openModal('genericAuxModal'); }
function moFormThemDoan() { document.getElementById('auxTableType').value = 'doan_cap'; document.getElementById('auxFormFields').innerHTML = '<label>Mã Đoạn:</label><input type="text" id="auxName" class="form-group"><label>Thuộc Tuyến:</label><select id="auxRefId" class="form-group"></select>'; populateDropdown('auxRefId', rawTuyenList, 'id_tuyen_cap', 'ma_tuyencap', null); openModal('genericAuxModal'); }

async function saveAuxRecord() {
  var tbl = document.getElementById('auxTableType').value, nameVal = document.getElementById('auxName').value;
  showLoading("Đang lưu...");
  try {
    if (tbl === 'dai_vt') await supabaseClient.from('dai_vt').insert([{ ten_dai: nameVal }]);
    else if (tbl === 'tram_vt') await supabaseClient.from('tram_vt').insert([{ ten_tram: nameVal, id_dai: parseInt(document.getElementById('auxRefId').value) }]);
    else if (tbl === 'tuyen_cap') await supabaseClient.from('tuyen_cap').insert([{ ma_tuyencap: nameVal }]);
    else if (tbl === 'doan_cap') await supabaseClient.from('doan_cap').insert([{ ma_doancap: nameVal, id_tuyen: parseInt(document.getElementById('auxRefId').value) }]);
    alert("Lưu thành công!"); closeModals(); taiDuLieuSupabase(); openModal('adminMasterModal');
  } catch (err) { alert("Lỗi: " + err.message); } finally { hideLoading(); }
}

async function xoaAuxRecord(tbl, col, val) {
  if (confirm("Xóa mục này?")) { await supabaseClient.from(tbl).delete().eq(col, val); loadAdminMasterData(); taiDuLieuSupabase(); }
}

// ---------------- CRUD ĐỐI TƯỢNG BẢN ĐỒ ----------------
function moFormCrud(act, id, name, lat, lng) {
  document.getElementById('crudActionType').value = act; document.getElementById('crudObjectId').value = id || '';
  document.getElementById('crudObjectName').value = name || ''; document.getElementById('crudObjectLat').value = lat; document.getElementById('crudObjectLng').value = lng;
  populateDropdown('crudObjectLoai', rawLoaiDiemList, 'id_loaidiem', 'ten_loaidiem', null);
  if (act === 'EDIT' && id) {
    var pt = globalDataPoints.find(p => p.id == id);
    if (pt) { document.getElementById('crudObjectLyTrinh').value = pt.lyTrinh || ''; document.getElementById('crudObjectLoai').value = pt.idLoaiDiem; }
  } else { document.getElementById('crudObjectLyTrinh').value = ''; }
  
  var btn = document.getElementById('btnConfirmCrud');
  if (act === 'DELETE') { btn.innerHTML = 'XÁC NHẬN XÓA'; btn.style.backgroundColor = '#dc3545'; }
  else { btn.innerHTML = 'XÁC NHẬN LƯU'; btn.style.backgroundColor = '#198754'; }
  openModal('crudModal');
}

async function executeCrudAction() {
  var act = document.getElementById('crudActionType').value, id = document.getElementById('crudObjectId').value;
  var payload = { ten_diem: document.getElementById('crudObjectName').value.trim(), id_loaidiem: parseInt(document.getElementById('crudObjectLoai').value), ly_trinh: document.getElementById('crudObjectLyTrinh').value };
  showLoading("Đang xử lý...");
  try {
    if (act === 'ADD') {
      payload.lat = parseFloat(document.getElementById('crudObjectLat').value); payload.long = parseFloat(document.getElementById('crudObjectLng').value);
      var tuyenH = document.getElementById('selectTuyen').value;
      if (tuyenH !== 'ALL') payload.id_tuyen_cap = parseInt(tuyenH);
      await supabaseClient.from('diem_ha_tang').insert([payload]);
    } else if (act === 'EDIT') { await supabaseClient.from('diem_ha_tang').update(payload).eq('id_diem', id); }
    else if (act === 'DELETE') { await supabaseClient.from('diem_ha_tang').delete().eq('id_diem', id); }
    alert("Thành công!"); closeModals(); taiDuLieuSupabase();
  } catch (err) { alert("Lỗi: " + err.message); } finally { hideLoading(); }
}
