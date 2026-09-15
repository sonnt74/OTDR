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

// =========================================================================
// 1. HÀM TÍNH VỊ TRÍ SỰ CỐ OTDR (Chạy hoàn toàn trên Client )
// =========================================================================
function timViTriDut() {
  var kcOtdrKm = parseFloat(document.getElementById('txtKcOtdr').value);
  var kcOtdrMeters = kcOtdrKm * 1000; 
  var heSoDoChung = parseFloat(document.getElementById('txtDoChung')?.value) || 1.075;

  if (isNaN(kcOtdrMeters) || kcOtdrMeters <= 0) {
    showToast("Vui lòng nhập cự ly đo OTDR hợp lệ!");
    return;
  }
  
  var tuyenVal = document.getElementById('selectTuyen').value;
  if (tuyenVal === 'ALL') {
    showToast("Vui lòng chọn tuyến cáp cần đo sự cố!");
    return;
  }

  // 1. Lấy dữ liệu backbone tuyến chuẩn OK4
  var tramVal = document.getElementById('selectTram').value;
  var doanVal = document.getElementById('selectDoanCap').value;
  var backbone = getMasterRouteBackbone(tuyenVal, tramVal, doanVal);
  
  if (!backbone || backbone.length < 2) {
    showToast("Tuyến cáp chưa đủ dữ liệu để tính toán OTDR!");
    return;
  }

  precalculateRouteDataForPoints(backbone, backbone);
  var pts = getPointsCuaTuyenHienTai();

  if (pts.length < 2) {
    showToast("Không đủ điểm dữ liệu trên tuyến!");
    return;
  }

  var targetLat = null;
  var targetLng = null;
  var closestPrevMX = "Trạm gốc (Trạm A)";
  var closestNextMX = "Chưa xác định";
  var quyHoachLyTrinh = "Đang cập nhật";
  var foundSegment = false;

  // 2. Duyệt tìm đoạn tuyến chứa cự ly OTDR
  for (var i = 0; i < pts.length - 1; i++) {
    var p1 = pts[i];
    var p2 = pts[i + 1];

    var isMx1 = (p1.loaiDiem && (p1.loaiDiem.toUpperCase().includes('MX') || p1.loaiDiem.toUpperCase().includes('MĂNG XÔNG'))) || p1.idLoaiDiem == 4;
    if (isMx1) {
      closestPrevMX = p1.tenDiem || "Măng xông";
    }

    var startDist = p1.distanceFromAMeters || 0;
    var endDist = p2.distanceFromAMeters || 0;

    if (kcOtdrMeters >= startDist && kcOtdrMeters <= endDist) {
      var segLen = endDist - startDist;
      var ratio = (segLen > 0) ? (kcOtdrMeters - startDist) / segLen : 0;

      targetLat = p1.lat + ratio * (p2.lat - p1.lat);
      targetLng = p1.lng + ratio * (p2.lng - p1.lng);

      var lt1Meters = parseLyTrinhWithSuffix(p1.lyTrinh || "0+000")?.meters || 0;
      var lt2Meters = parseLyTrinhWithSuffix(p2.lyTrinh || "0+000")?.meters || 0;
      var interpolatedLtMeters = lt1Meters + ratio * (lt2Meters - lt1Meters);
      
      var kmVal = Math.floor(interpolatedLtMeters / 1000);
      var mVal = Math.round(interpolatedLtMeters % 1000);
      quyHoachLyTrinh = kmVal + "+" + (mVal < 100 ? "0" : "") + (mVal < 10 ? "0" : "") + mVal;

      for (var j = i + 1; j < pts.length; j++) {
        var pj = pts[j];
        var isMxJ = (pj.loaiDiem && (pj.loaiDiem.toUpperCase().includes('MX') || pj.loaiDiem.toUpperCase().includes('MĂNG XÔNG'))) || pj.idLoaiDiem == 4;
        if (isMxJ) {
          closestNextMX = pj.tenDiem || "Măng xông";
          break;
        }
      }

      foundSegment = true;
      break;
    }
  }

  if (!foundSegment) {
    var lastPt = pts[pts.length - 1];
    targetLat = lastPt.lat;
    targetLng = lastPt.lng;
    quyHoachLyTrinh = lastPt.lyTrinh || "Cuối tuyến";
    closestPrevMX = pts[pts.length - 2]?.tenDiem || closestPrevMX;
    closestNextMX = "Điểm cuối tuyến";
  }

  var distStr = (kcOtdrMeters >= 1000) ? (kcOtdrMeters / 1000).toFixed(2) + " km" : Math.round(kcOtdrMeters) + " m";

  // 3. Hàm tạo nội dung HTML cho Popup (tái sử dụng khi API trả về giá trị)
  function buildPopupContent(addressText) {
    var shareTextOtdr = `[TNN NET1] THÔNG BÁO SỰ CỐ CÁP QUANG\n- Cự ly đo OTDR: ${kcOtdrKm.toFixed(2)} km\n- Lý trình: ${quyHoachLyTrinh}\n- MX trước: ${closestPrevMX}\n- MX sau: ${closestNextMX}\n- Địa chỉ: ${addressText}\n- Tọa độ: ${targetLat.toFixed(6)}, ${targetLng.toFixed(6)}`;
    var encodedOtdr = encodeURIComponent(shareTextOtdr);

    var shareButtons = `<div style="margin-top: 8px; border-top: 1px dashed #ccc; padding-top: 6px;">` +
                       `<b>Chia sẻ sự cố:</b><br>` +
                       `<button class="btn-info" onclick="navigator.clipboard.writeText(\`${shareTextOtdr}\`); showToast('Đã sao chép nội dung!');">📋 Copy</button> ` +
                       `<button class="btn-info" onclick="window.open('sms:?&body=${encodedOtdr}', '_blank')" style="background:#28a745; color:white;">📩 SMS</button> ` +
                       `<button class="btn-info" onclick="window.open('viber://forward?text=${encodedOtdr}', '_blank')" style="background:#6f42c1; color:white;">📱 Viber</button>` +
                       `</div>`;

    return `<b>⚡ VỊ TRÍ SỰ CỐ OTDR (CHUẨN OK4)</b><br>` +
           `- Cự ly đo từ Trạm A: <b>${distStr}</b><br>` +
           `- Lý trình quy hoạch: <b>${quyHoachLyTrinh}</b><br>` +
           `- MX trước: <b>${closestPrevMX}</b><br>` +
           `- MX sau: <b>${closestNextMX}</b><br>` +
           `- Địa chỉ: <b>${addressText}</b><br>` +
           `<a href='https://maps.google.com/?q=${targetLat},${targetLng}' target='_blank' class='gmaps-btn'>🗺️ Dẫn đường</a>${shareButtons}`;
  }

  // 4. Hiển thị marker và Popup ban đầu (trạng thái đang đợi API)
  if (foundMarkerLayer) map.removeLayer(foundMarkerLayer);
  map.setView([targetLat, targetLng], 19, { animate: true });
  
  var faultIcon = L.divIcon({ html: '<div style="background:red; color:white; width:28px; height:28px; border-radius:50%; text-align:center; line-height:28px; border:2px solid #fff; box-shadow:0 0 10px red;">⚡</div>', iconSize: [28, 28] });
  foundMarkerLayer = L.marker([targetLat, targetLng], { icon: faultIcon }).addTo(map);

  var initialPopupHtml = buildPopupContent("Đang đợi API Nominatim trả về địa chỉ...");
  foundMarkerLayer.bindPopup(initialPopupHtml).openPopup();
  
  // 5. Đợi API Nominatim trả về giá trị rồi cập nhật lại nội dung Popup
  fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${targetLat}&lon=${targetLng}&accept-language=vi`)
    .then(res => res.json())
    .then(resData => {
      var resolvedAddress = resData.display_name || "Không rõ địa chỉ chi tiết";
      
      // Cập nhật lại nội dung popup ngay sau khi có kết quả trả về từ API
      var updatedPopupHtml = buildPopupContent(resolvedAddress);
      if (foundMarkerLayer.isPopupOpen()) {
        foundMarkerLayer.setPopupContent(updatedPopupHtml);
      } else {
        foundMarkerLayer.bindPopup(updatedPopupHtml);
      }
    })
    .catch(() => {
      var errorPopupHtml = buildPopupContent("Không thể kết nối dịch vụ địa danh");
      if (foundMarkerLayer.isPopupOpen()) {
        foundMarkerLayer.setPopupContent(errorPopupHtml);
      }
    });

  showToast("Đã định vị thành công vị trí sự cố chuẩn OK4!", "success");
}


// =========================================================================
// 2. HÀM TÌM KIẾM VÀ NỘI SUY LÝ TRÌNH (Chạy hoàn toàn trên Client )
// =========================================================================
function timLyTrinhBanDo() {
  var txt = document.getElementById('txtTimLyTrinh').value.trim();
  var parsedTarget = parseLyTrinhWithSuffix(txt);
  var targetMeters = parsedTarget ? parsedTarget.meters : null;
  
  if (targetMeters === null || isNaN(targetMeters)) {
    showToast("Sai định dạng lý trình! Vui lòng nhập theo mẫu: 54+100 hoặc km 54+100");
    return;
  }
  
  var tuyenVal = document.getElementById('selectTuyen').value;
  if (tuyenVal === 'ALL') {
    showToast("Vui lòng chọn tuyến cáp trước khi tìm kiếm lý trình!");
    return;
  }

  var tramVal = document.getElementById('selectTram').value;
  var doanVal = document.getElementById('selectDoanCap').value;
  var backbone = getMasterRouteBackbone(tuyenVal, tramVal, doanVal);
  
  if (!backbone || backbone.length < 2) {
    showToast("Tuyến cáp chưa đủ dữ liệu để nội suy lý trình!");
    return;
  }

  // Tính toán trước khoảng cách tích lũy thực tế từ Trạm A và lý trình mốc
  precalculateRouteDataForPoints(backbone, backbone);

  var routePoints = backbone.map(pt => {
    var parsedPtLt = parseLyTrinhWithSuffix(pt.lyTrinh || "0+000");
    return {
      ...pt,
      lyTrinhMeters: parsedPtLt ? parsedPtLt.meters : 0,
      distFromA: pt.distanceFromAMeters || 0
    };
  });

  // Sắp xếp các mốc theo thứ tự lý trình tăng dần
  routePoints.sort((a, b) => a.lyTrinhMeters - b.lyTrinhMeters);

  var foundLat = null;
  var foundLng = null;
  var exactDistFromA = 0;
  var foundSegment = false;

  // Thuật toán nội suy tuyến tính giữa 2 mốc chứa giá trị lý trình mục tiêu
  for (var i = 0; i < routePoints.length - 1; i++) {
    var p1 = routePoints[i];
    var p2 = routePoints[i + 1];
    var lt1 = p1.lyTrinhMeters;
    var lt2 = p2.lyTrinhMeters;

    if (targetMeters >= Math.min(lt1, lt2) && targetMeters <= Math.max(lt1, lt2)) {
      var span = lt2 - lt1;
      var ratio = (span !== 0) ? (targetMeters - lt1) / span : 0;

      foundLat = p1.lat + ratio * (p2.lat - p1.lat);
      foundLng = p1.lng + ratio * (p2.lng - p1.lng);
      exactDistFromA = p1.distFromA + ratio * (p2.distFromA - p1.distFromA);

      foundSegment = true;
      break;
    }
  }

  // Nếu lý trình nằm ngoài biên, lấy mốc biên gần nhất
  if (!foundSegment) {
    var closest = routePoints.reduce((prev, curr) => 
      Math.abs(curr.lyTrinhMeters - targetMeters) < Math.abs(prev.lyTrinhMeters - targetMeters) ? curr : prev
    );
    foundLat = closest.lat;
    foundLng = closest.lng;
    exactDistFromA = closest.distFromA;
  }

  var distStr = (exactDistFromA >= 1000) ? (exactDistFromA / 1000).toFixed(2) + " km" : Math.round(exactDistFromA) + " m";

  if (foundMarkerLayer) map.removeLayer(foundMarkerLayer);
  map.setView([foundLat, foundLng], 19, { animate: true });
  
  var markerHtml = '<div style="background:#fd7e14; color:white; width:28px; height:28px; border-radius:50%; text-align:center; line-height:28px; border:2px solid #fff; box-shadow:0 0 10px #fd7e14; font-size:14px;">📍</div>';
  foundMarkerLayer = L.marker([foundLat, foundLng], { icon: L.divIcon({ html: markerHtml, className: '', iconSize: [28, 28], iconAnchor: [14, 14] }) }).addTo(map);
  
  var shareTextLt = `[TNN NET1] TÌM KIẾM LÝ TRÌNH: ${txt}\n- Cự ly từ Trạm A: ${distStr}\n- Tọa độ: ${foundLat.toFixed(6)}, ${foundLng.toFixed(6)}\n- Bản đồ: https://maps.google.com/?q=${foundLat},${foundLng}`;
  var encodedShareLt = encodeURIComponent(shareTextLt);

  var shareButtonsLt = `<div style="margin-top: 8px; border-top: 1px dashed #ccc; padding-top: 6px;">` +
                       `<b>Chia sẻ vị trí:</b><br>` +
                       `<button class="btn-info" onclick="navigator.clipboard.writeText(\`${shareTextLt}\`); showToast('Đã sao chép nội dung!');">📋 Copy</button> ` +
                       `<button class="btn-info" onclick="window.open('sms:?&body=${encodedShareLt}', '_blank')" style="background:#28a745; color:white;">📩 SMS</button> ` +
                       `<button class="btn-info" onclick="window.open('viber://forward?text=${encodedShareLt}', '_blank')" style="background:#6f42c1; color:white;">📱 Viber</button>` +
                       `</div>`;

  var popupContent = `<b>🔍 KẾT QUẢ TÌM LÝ TRÌNH: ${txt} ()</b><br>` +
                     `- Lý trình quy hoạch: <b>${txt}</b><br>` +
                     `- Cự ly cáp từ Trạm A: <b>${distStr}</b><br>` +
                     `- Tọa độ: <b>${foundLat.toFixed(6)}, ${foundLng.toFixed(6)}</b><br>` +
                     `🏛️ Địa chỉ: <span id='lt-addr'>Đang tra cứu tọa độ...</span><br>` +
                     `<a href='https://maps.google.com/?q=${foundLat},${foundLng}' target='_blank' class='gmaps-btn'>🗺️ Dẫn đường</a>${shareButtonsLt}`;
                       
  foundMarkerLayer.bindPopup(popupContent).openPopup();
  
  fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${foundLat}&lon=${foundLng}&accept-language=vi`)
    .then(r => r.json())
    .then(resData => {
      var addrEl = document.getElementById('lt-addr');
      if (addrEl) addrEl.innerText = resData.display_name || "Không rõ địa chỉ chi tiết";
    })
    .catch(() => {
      var addrEl = document.getElementById('lt-addr');
      if (addrEl) addrEl.innerText = "Không thể kết nối dịch vụ địa danh";
    });

  showToast("Đã nội suy lý trình  thành công!", "success");
}
