// data.js - Đồng bộ dữ liệu Supabase, quản lý ComboBox qua AppStore, phân tích OTDR và tìm lý trình

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

    // Cập nhật trạng thái tập trung vào AppStore
    AppStore.setState({
      daiList: rawDaiList,
      tramList: rawTramList,
      tuyenList: rawTuyenList,
      doanCapList: rawDoanCapList,
      dataPoints: globalDataPoints
    });

    khoiTaoComboDaiTheoPhanCap();
    capNhatComboDiemA();
    if (forceRefresh) showToast("Đã làm mới dữ liệu!");
  } catch (err) { 
    showToast("Lỗi: " + err.message); 
  } finally { 
    hideLoading(); 
    if (map) map.invalidateSize(); 
  }
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
  
  AppStore.setState({ selectedDai: daiVal });

  if (currentUser.role !== 'tram_admin' && selectTram) {
    selectTram.innerHTML = '<option value="ALL">-- Tất cả Trạm --</option>';
    rawTramList.filter(tram => daiVal === 'ALL' || tram.id_dai == daiVal)
               .forEach(tram => selectTram.innerHTML += `<option value="${tram.id_tram}">${tram.ten_tram}</option>`);
  }
  updateTuyenOptions();
}

function onTramChange() { 
  var tramVal = document.getElementById('selectTram').value;
  AppStore.setState({ selectedTram: tramVal });
  updateTuyenOptions(); 
}

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
  
  AppStore.setState({ selectedTuyen: tuyenVal });

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

function onDoanCapChange() { 
  var doanVal = document.getElementById('selectDoanCap').value;
  AppStore.setState({ selectedDoanCap: doanVal });
  veLaiTuyenAB(); 
}

function onDiemAChange() { 
  veLaiTuyenAB(); 
}

function capNhatComboDiemA() {
  var tuyenVal = document.getElementById('selectTuyen').value;
  var combo = document.getElementById('comboDiemA');
  if (!combo) return;
  combo.innerHTML = '<option value="DEFAULT">📍 Trạm Gốc (TNN)</option>';
  globalDataPoints.filter(pt => isMangXong(pt) && (tuyenVal === 'ALL' || pt.idTuyen == tuyenVal)).forEach(mx => {
    combo.innerHTML += `<option value="${mx.ten}">🔀 ${mx.ten}</option>`;
  });
}

// --- CÁC HÀM PHÂN TÍCH SỰ CỐ OTDR VÀ TÌM LÝ TRÌNH ĐẦY ĐỦ ---
function chiaSeSuCo(lat, lng, khoangCachKm, prevMX, nextMX, shareType) {
  var message = `[TNN NET1] THÔNG BÁO SỰ CỐ CÁP QUANG\n- Tọa độ: ${lat}, ${lng}\n- Cự ly đo OTDR: ${khoangCachKm} km\n- Vị trí: Nằm giữa [${prevMX}] và [${nextMX}]\n- Bản đồ: https://maps.google.com/?q=${lat},${lng}`;
  var encoded = encodeURIComponent(message);
  if (shareType === 'copy') { navigator.clipboard.writeText(message); showToast("Đã sao chép nội dung!"); }
  else if (shareType === 'sms') window.open(`sms:?&body=${encoded}`, '_blank');
  else if (shareType === 'viber') window.open(`viber://forward?text=${encoded}`, '_blank');
}

// data.js - Gọi hàm PostGIS xử lý định vị sự cố OTDR
// 1. Hàm định vị sự cố OTDR gọi qua PostGIS RPC
async function timViTriDut() {
  var kcOtdrKm = parseFloat(document.getElementById('txtKcOtdr').value);
  var kcOtdrMeters = kcOtdrKm * 1000; 
  
  if (isNaN(kcOtdrMeters) || kcOtdrMeters <= 0) {
    showToast("Vui lòng nhập cự ly đo OTDR hợp lệ!");
    return;
  }
  
  var tuyenVal = document.getElementById('selectTuyen').value;
  if (tuyenVal === 'ALL') {
    showToast("Vui lòng chọn tuyến cáp cần đo sự cố!");
    return;
  }

  showLoading("Đang tính toán tọa độ sự cố bằng PostGIS...");

  try {
    const { data, error } = await supabaseClient.rpc('tinh_vi_tri_otdr', {
      p_id_tuyen: parseInt(tuyenVal),
      p_kc_met: kcOtdrMeters
    });

    if (error) throw error;
    if (!data || !data.success) {
      throw new Error(data?.message || "Không thể tính toán vị trí sự cố từ cơ sở dữ liệu.");
    }

    hideLoading();
    var targetLat = data.lat;
    var targetLng = data.lng;

    if (foundMarkerLayer) map.removeLayer(foundMarkerLayer);
    map.setView([targetLat, targetLng], 19, { animate: true });
    
    var faultIcon = L.divIcon({ html: '<div style="background:red; color:white; width:28px; height:28px; border-radius:50%; text-align:center; line-height:28px; border:2px solid #fff; box-shadow:0 0 10px red;">⚡</div>', iconSize: [28, 28] });
    foundMarkerLayer = L.marker([targetLat, targetLng], { icon: faultIcon }).addTo(map);

    var popupHtml = `<b>⚡ VỊ TRÍ SỰ CỐ OTDR (POSTGIS)</b><br>` +
                    `Cự ly đo: <b>${kcOtdrKm.toFixed(2)} km</b><br>` +
                    `📍 Tọa độ: ${targetLat.toFixed(6)}, ${targetLng.toFixed(6)}<br>` +
                    `🏛️ Địa chỉ: <span id='fault-addr'>Đang tra cứu...</span><br>` +
                    `<a href='https://maps.google.com/?q=${targetLat},${targetLng}' target='_blank' class='gmaps-btn'>🗺️ Dẫn đường</a>`;
    
    foundMarkerLayer.bindPopup(popupHtml).openPopup();
    
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${targetLat}&lon=${targetLng}&accept-language=vi`)
      .then(res => res.json()).then(resData => {
        var addrEl = document.getElementById('fault-addr');
        if (addrEl) addrEl.innerText = resData.display_name || "Không rõ địa chỉ chi tiết";
      });

    showToast("Đã định vị thành công vị trí sự cố bằng PostGIS!", "success");
  } catch (err) {
    hideLoading();
    showToast("Lỗi tính toán PostGIS: " + err.message, "error");
  }
}

// 2. Hàm tìm lý trình bản đồ gọi qua PostGIS RPC
async function timLyTrinhBanDo() {
  var txt = document.getElementById('txtTimLyTrinh').value.trim();
  var parsedTarget = parseLyTrinhWithSuffix(txt);
  var targetMeters = parsedTarget ? parsedTarget.meters : null;
  
  if (targetMeters === null || isNaN(targetMeters)) {
    showToast("Sai định dạng lý trình! Vui lòng nhập theo mẫu: 54+100");
    return;
  }
  
  var tuyenVal = document.getElementById('selectTuyen').value;
  if (tuyenVal === 'ALL') {
    showToast("Vui lòng chọn tuyến cáp trước khi tìm kiếm lý trình!");
    return;
  }

  showLoading("Đang tìm kiếm lý trình bằng PostGIS...");

  try {
    const { data, error } = await supabaseClient.rpc('tim_toa_do_theo_ly_trinh', {
      p_id_tuyen: parseInt(tuyenVal),
      p_target_meters: targetMeters
    });

    if (error) throw error;
    if (!data || !data.success) {
      throw new Error(data?.message || "Không thể tìm thấy lý trình từ cơ sở dữ liệu.");
    }

    hideLoading();
    var foundLat = data.lat;
    var foundLng = data.lng;

    if (foundMarkerLayer) map.removeLayer(foundMarkerLayer);
    map.setView([foundLat, foundLng], 19, { animate: true });
    
    var markerHtml = '<div style="background:#fd7e14; color:white; width:28px; height:28px; border-radius:50%; text-align:center; line-height:28px; border:2px solid #fff; box-shadow:0 0 10px #fd7e14; font-size:14px;">📍</div>';
    foundMarkerLayer = L.marker([foundLat, foundLng], { icon: L.divIcon({ html: markerHtml, className: '', iconSize: [28, 28], iconAnchor: [14, 14] }) }).addTo(map);
    
    var popupContent = `<b>🔍 KẾT QUẢ TÌM LÝ TRÌNH: ${txt} (POSTGIS)</b><br>` +
                       `- Tọa độ: ${foundLat.toFixed(6)}, ${foundLng.toFixed(6)}<br>` +
                       `🏛️ Địa chỉ: <span id='lt-addr'>Đang tra cứu tọa độ...</span>`;
                       
    foundMarkerLayer.bindPopup(popupContent).openPopup();
    
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${foundLat}&lon=${foundLng}&accept-language=vi`)
      .then(r => r.json())
      .then(resData => {
        var addrEl = document.getElementById('lt-addr');
        if (addrEl) addrEl.innerText = resData.display_name || "Không rõ địa chỉ chi tiết";
      });

    showToast("Đã tìm thấy vị trí lý trình thành công!", "success");
  } catch (err) {
    hideLoading();
    showToast("Lỗi tìm lý trình PostGIS: " + err.message, "error");
  }
}
