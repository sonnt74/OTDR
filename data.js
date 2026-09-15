// data.js - Tải dữ liệu từ Supabase, quản lý ComboBox và phân tích OTDR
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
    capNhatComboDiemA();
    if (forceRefresh) showToast("Đã làm mới dữ liệu!");
  } catch (err) { showToast("Lỗi: " + err.message); } finally { hideLoading(); if (map) map.invalidateSize(); }
}

function khoiTaoComboDaiTheoPhanCap() {
  var selectDai = document.getElementById('selectDai');
  var groupDai = selectDai ? selectDai.closest('.form-group') : null;
  var selectTram = document.getElementById('selectTram');
  var groupTram = selectTram ? selectTram.closest('.form-group') : null;

  if (currentUser.role === 'tram_admin') {
    if (groupDai) groupDai.style.display = 'none';
    if (groupTram) groupTram.style.display = 'none';
    if (currentUser.idDai) selectDai.value = currentUser.idDai;
    if (currentUser.idTram) selectTram.value = currentUser.idTram;
  } else {
    if (groupDai) groupDai.style.display = 'block';
    if (groupTram) groupTram.style.display = 'block';
    
    selectDai.innerHTML = '<option value="ALL">-- Tất cả Đài --</option>';
    rawDaiList.forEach(dai => selectDai.innerHTML += `<option value="${dai.id_dai}">${dai.ten_dai}</option>`);
    
    if (currentUser.role === 'dai_admin' && currentUser.idDai) { 
      selectDai.value = currentUser.idDai; 
      selectDai.disabled = true; 
    }
  }
  onDaiChange();
}

function onDaiChange() {
  var daiVal = document.getElementById('selectDai').value;
  var selectTram = document.getElementById('selectTram');
  
  if (currentUser.role !== 'tram_admin' && selectTram) {
    selectTram.innerHTML = '<option value="ALL">-- Tất cả Trạm --</option>';
    rawTramList.filter(tram => daiVal === 'ALL' || tram.id_dai == daiVal)
               .forEach(tram => selectTram.innerHTML += `<option value="${tram.id_tram}">${tram.ten_tram}</option>`);
  }
  updateTuyenOptions();
}

function onTramChange() { updateTuyenOptions(); }

function updateTuyenOptions() {
  var selectTuyen = document.getElementById('selectTuyen');
  if (!selectTuyen) return;
  
  selectTuyen.innerHTML = '<option value="ALL">-- Chọn tuyến cáp --</option>';
  rawTuyenList.forEach(tuyen => selectTuyen.innerHTML += `<option value="${tuyen.id_tuyen_cap}">${tuyen.ma_tuyencap}</option>`);
  onTuyenChange();
}

function onTuyenChange() {
  var tuyenVal = document.getElementById('selectTuyen').value;
  var selectDoanCap = document.getElementById('selectDoanCap');
  if (selectDoanCap) {
    selectDoanCap.innerHTML = '<option value="ALL">-- Tất cả đoạn cáp --</option>';
    if (tuyenVal !== 'ALL') {
      rawDoanCapList.filter(doan => doan.id_tuyen == tuyenVal)
                    .forEach(doan => selectDoanCap.innerHTML += `<option value="${doan.id_doan_cap}">${doan.ma_doancap}</option>`);
    }
  }
  capNhatComboDiemA();
  veLaiTuyenAB();
}

function onDoanCapChange() { veLaiTuyenAB(); }
function onDiemAChange() { veLaiTuyenAB(); }

function capNhatComboDiemA() {
  var tuyenVal = document.getElementById('selectTuyen').value;
  var combo = document.getElementById('comboDiemA');
  if (!combo) return;
  
  combo.innerHTML = '<option value="DEFAULT">📍 Trạm Gốc (TNN)</option>';
  globalDataPoints.filter(pt => isMangXong(pt) && (tuyenVal === 'ALL' || pt.idTuyen == tuyenVal)).forEach(mx => {
    combo.innerHTML += `<option value="${mx.ten}">🔀 ${mx.ten}</option>`;
  });
}

function timViTriDut() {
  var kcOtdrKm = parseFloat(document.getElementById('txtKcOtdr').value), kcOtdrMeters = kcOtdrKm * 1000; 
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

  var shareButtons = `<div style="margin-top: 8px; border-top: 1px dashed #ccc; padding-top: 6px;"><b>Chia sẻ sự cố:</b><br><button class="btn-info" onclick="chiaSeSuCo(${targetLat.toFixed(6)}, ${targetLng.toFixed(6)}, ${kcOtdrKm.toFixed(2)}, '${closestPrevMX}', '${closestNextMX}', 'copy')">📋 Copy</button><button class="btn-info" onclick="chiaSeSuCo(${targetLat.toFixed(6)}, ${targetLng.toFixed(6)}, ${kcOtdrKm.toFixed(2)}, '${closestPrevMX}', '${closestNextMX}', 'sms')" style="background:#28a745; color:white;">📩 SMS</button></div>`;
  var popupHtml = `<b>⚡ VỊ TRÍ SỰ CỐ OTDR</b><br>Cự ly đo: <b>${kcOtdrKm.toFixed(2)} km</b><br>📍 Lý trình QL: <b>${interpolatedLyTrinhText}</b><br>MX trước: <b>${closestPrevMX}</b><br>MX sau: <b>${closestNextMX}</b>${shareButtons}`;
  
  faultMarker.bindPopup(popupHtml).openPopup();
}

function timLyTrinhBanDo() {
  var txt = document.getElementById('txtTimLyTrinh').value.trim();
  var parsedTarget = parseLyTrinhWithSuffix(txt);
  var targetMeters = parsedTarget ? parsedTarget.meters : null;
  
  if (targetMeters === null || isNaN(targetMeters)) {
    showToast("Sai định dạng lý trình! VD: 54+100");
    return;
  }
  
  var pts = getPointsCuaTuyenHienTai();
  if (pts.length < 2) { showToast("Vui chọn tuyến cáp trước!"); return; }

  var closest = pts.reduce((prev, curr) => 
    Math.abs(curr.calculatedLyTrinhMeters - targetMeters) < Math.abs(prev.calculatedLyTrinhMeters - targetMeters) ? curr : prev
  );

  map.setView([closest.lat, closest.lng], 19, { animate: true });
  showToast(`Đã tìm thấy điểm gần lý trình ${txt}`);
}
