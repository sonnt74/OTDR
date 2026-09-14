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

window.onload = function() {
  var savedEmail = localStorage.getItem('tnn_saved_email');
  var savedPass = localStorage.getItem('tnn_saved_pass');
  if (savedEmail && savedPass) {
    document.getElementById('loginEmail').value = savedEmail;
    document.getElementById('loginPass').value = savedPass;
    document.getElementById('chkRememberMe').checked = true;
  }

  var savedSession = localStorage.getItem('tnn_user');
  if (savedSession) {
    currentUser = JSON.parse(savedSession);
    document.getElementById('loginModal').style.display = 'none';
    document.getElementById('sidebar-menu').style.display = 'flex';
    document.getElementById('control-panel').style.display = 'block';
    if (currentUser.role === 'sys_admin' || currentUser.role === 'dai_admin') {
      document.getElementById('adminMenuIcon').style.display = 'flex';
      var adminMob = document.getElementById('adminMobileBtn');
      if (adminMob) adminMob.style.display = 'block';
    }
    khoiTaoBanDoLeaflet();
    taiDuLieuSupabase();
  }
};

// Hàm chuyển đổi ẩn/hiện mật khẩu
function togglePasswordVisibility() {
  var passInput = document.getElementById('loginPass');
  if (passInput.type === 'password') {
    passInput.type = 'text';
  } else {
    passInput.type = 'password';
  }
}

function toggleGISPanel() {
  var panel = document.getElementById('control-panel');
  if (window.innerWidth <= 768) {
    // Trên điện thoại: Kích hoạt class thu gọn
    panel.classList.toggle('collapsed');
    panel.style.display = 'block'; 
  } else {
    // Trên máy tính: Ẩn/Hiện nguyên khối
    panel.style.display = (panel.style.display === 'none' || panel.style.display === '') ? 'block' : 'none';
  }
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

async function handleCustomLogin() {
  var email = document.getElementById('loginEmail').value.trim();
  var pass = document.getElementById('loginPass').value;
  var rememberMe = document.getElementById('chkRememberMe').checked;
  
  if (!email || !pass) { 
    showToast("Vui lòng nhập đầy đủ email và mật khẩu!"); 
    return; 
  }
  
  showLoading("Đang xác thực thông tin...");
  try {
    const { data, error } = await supabaseClient
      .from('tai_khoan')
      .select('*')
      .eq('email', email)
      .eq('password', pass)
      .limit(1);

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error("Sai thông tin tài khoản hoặc mật khẩu!");
    }

    var account = data[0];
    currentUser = { 
      isLoggedIn: true, 
      role: account.role || 'member', 
      idDai: account.id_dai, 
      idTram: account.id_tram, 
      canEditMap: account.can_edit_map === true 
    };
    
    localStorage.setItem('tnn_user', JSON.stringify(currentUser));

    // Xử lý lưu hoặc xóa thông tin nhớ mật khẩu
    if (rememberMe) {
      localStorage.setItem('tnn_saved_email', email);
      localStorage.setItem('tnn_saved_pass', pass);
    } else {
      localStorage.removeItem('tnn_saved_email');
      localStorage.removeItem('tnn_saved_pass');
    }
    
    document.getElementById('loginModal').style.display = 'none';
    document.getElementById('sidebar-menu').style.display = 'flex';
    document.getElementById('control-panel').style.display = 'block';
    
    if (currentUser.role === 'sys_admin' || currentUser.role === 'dai_admin') {
      document.getElementById('adminMenuIcon').style.display = 'flex';
      var adminMob = document.getElementById('adminMobileBtn');
      if (adminMob) adminMob.style.display = 'block';
    }
    
    khoiTaoBanDoLeaflet();
    await taiDuLieuSupabase();
  } catch (err) { 
    showToast("Lỗi đăng nhập: " + err.message); 
    hideLoading(); 
  }
}

function handleLogout() {
  localStorage.removeItem('tnn_user');
  location.reload();
}

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

function khoiTaoBanDoLeaflet() {
  if (map) return;
  var osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 21, maxNativeZoom: 19 });
  var satLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 21, maxNativeZoom: 19 });
  
  map = L.map('map', { center: [21.5942, 105.8481], zoom: 13, maxZoom: 21, layers: [osmLayer] });
  polylinesLayer.addTo(map); markersLayer.addTo(map); mxLayer.addTo(map); userLocationLayer.addTo(map); measureLayer.addTo(map);
  
  L.control.layers({ "Bản đồ OSM": osmLayer, "Vệ tinh": satLayer }, { "Tuyến cáp quang": polylinesLayer, "Cột/Bể cáp": markersLayer, "Măng xông": mxLayer }, { position: 'topright' }).addTo(map);
  
  map.on('contextmenu', e => {
    if (currentUser.canEditMap || currentUser.role === 'sys_admin') moFormCrud('ADD', null, '', e.latlng.lat.toFixed(6), e.latlng.lng.toFixed(6));
    else showToast("Không có quyền thêm điểm.");
  });
  map.on('click', e => { if (isMeasuring) { measurePoints.push(e.latlng); redrawMeasureLayer(); } });
}

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
    if (forceRefresh) showToast("Đã làm mới dữ liệu!");
  } catch (err) { showToast("Lỗi: " + err.message); } finally { hideLoading(); if (map) map.invalidateSize(); }
}

function khoiTaoComboDaiTheoPhanCap() {
  var selectDai = document.getElementById('selectDai');
  selectDai.innerHTML = '<option value="ALL">-- Tất cả Đài --</option>';
  rawDaiList.forEach(dai => selectDai.innerHTML += `<option value="${dai.id_dai}">${dai.ten_dai}</option>`);
  
  // Phân quyền theo Đài
  if (currentUser.role === 'dai_admin' && currentUser.idDai) { 
    selectDai.value = currentUser.idDai; 
    selectDai.disabled = true; 
  }
  onDaiChange();
}

function onDaiChange() {
  var daiVal = document.getElementById('selectDai').value;
  var selectTram = document.getElementById('selectTram');
  selectTram.innerHTML = '<option value="ALL">-- Tất cả Trạm --</option>';
  
  var validTrams = rawTramList.filter(tram => daiVal === 'ALL' || tram.id_dai == daiVal);
  validTrams.forEach(tram => selectTram.innerHTML += `<option value="${tram.id_tram}">${tram.ten_tram}</option>`);
  
  // Phân quyền theo Trạm
  if (currentUser.role === 'tram_admin' && currentUser.idTram) { 
    selectTram.value = currentUser.idTram; 
    selectTram.disabled = true; 
  } else if (validTrams.length > 0 && currentUser.role === 'tram_admin') {
    selectTram.value = validTrams[0].id_tram;
  }
  
  updateTuyenOptions();
}

function onTramChange() { updateTuyenOptions(); }

function updateTuyenOptions() {
  var selectTuyen = document.getElementById('selectTuyen');
  selectTuyen.innerHTML = '<option value="ALL">-- Chọn tuyến cáp --</option>';
  
  rawTuyenList.forEach(tuyen => selectTuyen.innerHTML += `<option value="${tuyen.id_tuyen_cap}">${tuyen.ma_tuyencap}</option>`);
  
  // Tự động chọn tuyến cáp đầu tiên nếu danh sách có sẵn để hiển thị ngay tuyến gần nhất
  if (rawTuyenList.length > 0 && selectTuyen.value === 'ALL') {
    selectTuyen.value = rawTuyenList[0].id_tuyen_cap;
  }
  
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
  var allPts = globalDataPoints.filter(pt => pt.idTuyen == tuyenVal && (tramVal === 'ALL' || pt.idTram == tramVal) && (doanVal === 'ALL' || pt.idDoanCap == doanVal));
  
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
  
  var heSo = parseFloat(document.getElementById('txtDoChung')?.value) || 1.075;

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

    var isSegmentNghich = false;
    if (anchors.length >= 2) {
      if (anchors[1].meters < anchors[0].meters) {
        isSegmentNghich = true; 
      }
    }

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

      let effectiveLyTrinhMeters;
      if (isSegmentNghich) {
        effectiveLyTrinhMeters = segBaseMeters - (distFromA - segAnchorDistFromA);
      } else {
        let baseOffsetMeters = segBaseMeters - segAnchorDistFromA;
        effectiveLyTrinhMeters = baseOffsetMeters + distFromA;
      }

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
  var tuyenVal = document.getElementById('selectTuyen').value;
  var tramVal = document.getElementById('selectTram').value;
  var doanVal = document.getElementById('selectDoanCap').value;
  if (tuyenVal === 'ALL') return [];
  
  var backbone = getMasterRouteBackbone(tuyenVal, tramVal, doanVal);
  var nonMxPts = backbone.filter(pt => !isMangXong(pt) && pt.idLoaiDiem !== 0);
  
  var basePt = backbone.find(p => p.id === 'TNN_BASE' || Math.abs(p.lat - 21.593365) < 0.0001);
  if (basePt && !nonMxPts.includes(basePt)) nonMxPts.unshift(basePt);

  return precalculateRouteDataForPoints(nonMxPts, backbone);
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
    return isDraggable ? `<hr style="margin:4px 0;"><button class="btn-small" onclick="moFormCrud('EDIT','${id}','${ten}',${lat},${lng})">✏️ Sửa Tên</button><button class="btn-small del" onclick="moFormCrud('DELETE','${id}','${ten}',${lat},${lng})">🗑️ Xóa</button>` : '';
  }

  async function handleDragEnd(e, ptObj) {
    var newPos = e.target.getLatLng();
    
    var isConfirmed = await showConfirmDialog(`Bạn có chắc chắn muốn lưu tọa độ mới cho điểm [${ptObj.ten}] không?`);
    
    if (isConfirmed) {
      showLoading("Đang lưu tọa độ...");
      try {
        // 1. Lưu dữ liệu xuống Supabase
        const { error } = await supabaseClient.from('diem_ha_tang').update({ lat: newPos.lat, long: newPos.lng }).eq('id_diem', ptObj.id);
        if (error) throw error;
        
        // 2. Cập nhật trực tiếp trong bộ nhớ RAM (globalDataPoints)
        var localPt = globalDataPoints.find(p => p.id == ptObj.id);
        if (localPt) {
          localPt.lat = newPos.lat;
          localPt.lng = newPos.lng;
        }
        
        hideLoading();
        showToast("Đã lưu và cập nhật tọa độ thành công!", "success");
        
        // 3. Vẽ lại bản đồ và Zoom trọng tâm tới điểm vừa kéo thả
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
    
    var popupHtml = `<b>${pt.ten}</b><br>` +
                    `Loại: ${pt.loai}<br>` +
                    `📍 Lý trình QL: <b>${pt.calculatedLyTrinhText}</b><br>` +
                    `📏 Cự ly từ Trạm A: <b>${pt.distanceFromAText}</b>` + 
                    taoNutHanhDong(pt.id, pt.ten, pt.lat, pt.lng);

    marker.bindPopup(popupHtml);
    marker.on('dragend', e => handleDragEnd(e, pt));
    markersLayer.addLayer(marker);
  });

  var mxList = backbone.filter(p => isMangXong(p));
  mxList.forEach(mx => {
    bounds.push([mx.lat, mx.lng]);
    var mxMarker = L.marker([mx.lat, mx.lng], { icon: L.divIcon({ className: '', html: '<div class="mx-marker"></div>', iconSize: [12, 12], iconAnchor: [6, 6] }), draggable: isDraggable });
    var ghiChuBtn = `<button class="btn-small" style="background:#198754; margin-top:4px;" onclick="suaGhiChu('${mx.id}', '${mx.ghiChu}')">📝 Ghi chú</button>`;
    
    var popupHtml = `<b>${mx.ten}</b><br>` +
                    `📍 Lý trình QL: <b>${mx.calculatedLyTrinhText}</b><br>` +
                    `📏 Cự ly từ Trạm A: <b>${mx.distanceFromAText}</b><br>` +
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

async function suaGhiChu(id, oldGhiChu) {
  if (!currentUser.canEditMap && currentUser.role !== 'sys_admin') { showToast("Không có quyền!"); return; }
  var newVal = prompt("Nhập nội dung ghi chú:", (oldGhiChu === 'undefined' || oldGhiChu === 'null') ? '' : oldGhiChu);
  if (newVal !== null) {
    showLoading("Đang lưu...");
    await supabaseClient.from('diem_ha_tang').update({ ghi_chu: newVal }).eq('id_diem', id);
    showToast("Đã lưu!"); taiDuLieuSupabase();
  }
}

function chiaSeSuCo(lat, lng, khoangCachKm, prevMX, nextMX, shareType) {
  var message = `[TNN NET1] THÔNG BÁO SỰ CỐ CÁP QUANG\n- Tọa độ: ${lat}, ${lng}\n- Cự ly đo OTDR: ${khoangCachKm} km\n- Vị trí: Nằm giữa [${prevMX}] và [${nextMX}]\n- Bản đồ: https://maps.google.com/?q=${lat},${lng}`;
  var encoded = encodeURIComponent(message);
  if (shareType === 'copy') { navigator.clipboard.writeText(message); showToast("Đã sao chép nội dung!"); }
  else if (shareType === 'sms') window.open(`sms:?&body=${encoded}`, '_blank');
  else if (shareType === 'viber') window.open(`viber://forward?text=${encoded}`, '_blank');
}

function timViTriDut() {
  var kcOtdrKm = parseFloat(document.getElementById('txtKcOtdr').value), kcOtdrMeters = kcOtdrKm * 1000; 
  var heSo = parseFloat(document.getElementById('txtDoChung')?.value) || 1.075;
  if (isNaN(kcOtdrMeters) || kcOtdrMeters <= 0) { showToast("Nhập cự ly đo hợp lệ!"); return; }
  
  var tuyenVal = document.getElementById('selectTuyen').value;
  var tramVal = document.getElementById('selectTram').value;
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
                  `🏛️ Địa chỉ: <span id='fault-addr'>Đang tra cứu...</span><br>` +
                  `<a href='https://maps.google.com/?q=${targetLat},${targetLng}' target='_blank' class='gmaps-btn'>🗺️ Dẫn đường</a>${shareButtons}`;
  
  faultMarker.bindPopup(popupHtml).openPopup();
  fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${targetLat}&lon=${targetLng}&accept-language=vi`)
    .then(res => res.json()).then(data => faultMarker.setPopupContent(popupHtml.replace("Đang tra cứu...", data.display_name || "Không rõ")));
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
    showToast("Vui lòng chọn tuyến cáp ở bảng điều khiển bên trái trước khi tìm kiếm lý trình!");
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

  var distToA = getDistanceAlongRoute({lat: foundLat, lng: foundLng}, getMasterRouteBackbone(document.getElementById('selectTuyen').value, document.getElementById('selectTram').value, document.getElementById('selectDoanCap').value));
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
      foundMarkerLayer.setPopupContent(popupContent.replace("Đang tra cứu...", "Không thể kết nối dịch vụ địa danh"));
    });
}

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
    showToast("Lưu thành công!"); openModal('adminMasterModal', 'tab-accounts');
  } catch (err) { showToast("Lỗi: " + err.message); } finally { hideLoading(); }
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
    showToast("Lưu thành công!"); closeModals(); taiDuLieuSupabase(); openModal('adminMasterModal');
  } catch (err) { showToast("Lỗi: " + err.message); } finally { hideLoading(); }
}

async function xoaAuxRecord(tbl, col, val) {
  if (confirm("Xóa mục này?")) { await supabaseClient.from(tbl).delete().eq(col, val); loadAdminMasterData(); taiDuLieuSupabase(); }
}

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
  var act = document.getElementById('crudActionType').value;
  var id = document.getElementById('crudObjectId').value;
  var tenMoi = document.getElementById('crudObjectName').value.trim();
  var loaiMoi = parseInt(document.getElementById('crudObjectLoai').value);
  var ltMoi = document.getElementById('crudObjectLyTrinh').value;
  
  var payload = { ten_diem: tenMoi, id_loaidiem: loaiMoi, ly_trinh: ltMoi };
  showLoading("Đang xử lý...");
  
  try {
    var targetLat = null, targetLng = null;

    if (act === 'ADD') {
      targetLat = parseFloat(document.getElementById('crudObjectLat').value);
      targetLng = parseFloat(document.getElementById('crudObjectLng').value);
      payload.lat = targetLat; 
      payload.long = targetLng;
      
      var tuyenH = document.getElementById('selectTuyen').value;
      if (tuyenH !== 'ALL') payload.id_tuyen_cap = parseInt(tuyenH);
      
      // 1. Lưu điểm mới xuống Supabase và yêu cầu trả về bản ghi
      const { data, error } = await supabaseClient.from('diem_ha_tang').insert([payload]).select();
      if (error) throw error;
      
      // 2. Thêm vào mảng RAM cục bộ
      if (data && data[0]) {
        var newRec = data[0];
        globalDataPoints.push({
          id: newRec.id_diem || newRec.id,
          ten: newRec.ten_diem,
          lat: newRec.lat,
          lng: newRec.long,
          lyTrinh: newRec.ly_trinh || '',
          idTuyen: tuyenH,
          idLoaiDiem: loaiMoi,
          loai: 'Điểm mới'
        });
      }
    } else if (act === 'EDIT') { 
      // 1. Cập nhật xuống Supabase
      const { error } = await supabaseClient.from('diem_ha_tang').update(payload).eq('id_diem', id);
      if (error) throw error;
      
      // 2. Cập nhật trong mảng RAM
      var localPt = globalDataPoints.find(p => p.id == id);
      if (localPt) {
        localPt.ten = tenMoi;
        localPt.idLoaiDiem = loaiMoi;
        localPt.lyTrinh = ltMoi;
        targetLat = localPt.lat;
        targetLng = localPt.lng;
      }
    } else if (act === 'DELETE') { 
      // Lấy tọa độ trước khi xóa để có thể canh tầm nhìn nếu cần
      var delPt = globalDataPoints.find(p => p.id == id);
      if (delPt) { targetLat = delPt.lat; targetLng = delPt.lng; }

      // 1. Xóa khỏi Supabase
      const { error } = await supabaseClient.from('diem_ha_tang').delete().eq('id_diem', id);
      if (error) throw error;
      
      // 2. Xóa khỏi mảng RAM
      globalDataPoints = globalDataPoints.filter(p => p.id != id);
    }
    
    closeModals();
    hideLoading();
    showToast("Thực hiện lưu dữ liệu thành công!", "success");
    
    // 3. Vẽ lại bản đồ và Zoom vào vị trí đối tượng nếu có tọa độ hợp lệ
    veLaiTuyenAB();
    if (targetLat && targetLng && act !== 'DELETE') {
      map.setView([targetLat, targetLng], 19, { animate: true });
    }
  } catch (err) { 
    showToast("Lỗi: " + err.message, "error"); 
    hideLoading(); 
  }
}

// --- LOGIC VUỐT CẢM ỨNG (SWIPE TO COLLAPSE/EXPAND) ---
function khoiTaoVuotCamUng() {
  var panel = document.getElementById('control-panel');
  var startY = 0;
  var currentY = 0;
  
  panel.addEventListener('touchstart', function(e) {
    startY = e.touches[0].clientY;
  }, { passive: true });

  panel.addEventListener('touchmove', function(e) {
    currentY = e.touches[0].clientY;
  }, { passive: true });

  panel.addEventListener('touchend', function(e) {
    if (startY === 0 || currentY === 0) return;
    
    var diffY = currentY - startY;
    
    if (diffY > 50) {
      panel.classList.add('collapsed');
    } else if (diffY < -50 && panel.scrollTop === 0) {
      panel.classList.remove('collapsed');
    }
    
    startY = 0;
    currentY = 0;
  }, { passive: true });
}

document.addEventListener('DOMContentLoaded', khoiTaoVuotCamUng);

function showToast(message, type = 'info') {
  var container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  
  var toast = document.createElement('div');
  toast.className = `toast-msg ${type}`;
  toast.innerText = message;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s ease';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// --- HỆ THỐNG XÁC NHẬN TÙY CHỈNH (THAY THẾ CONFIRM MẶC ĐỊNH) ---
let confirmResolveCallback = null;

function showConfirmDialog(message, title = "⚠️ Xác nhận thao tác") {
  return new Promise((resolve) => {
    document.getElementById('confirmModalMessage').innerText = message;
    document.getElementById('confirmModalTitle').innerText = title;
    document.getElementById('customConfirmModal').style.display = 'flex';
    confirmResolveCallback = resolve;
  });
}

function resolveConfirm(result) {
  document.getElementById('customConfirmModal').style.display = 'none';
  if (confirmResolveCallback) {
    confirmResolveCallback(result);
    confirmResolveCallback = null;
  }
}
