// data_2.js - Xử lý phân quyền, đồng bộ AppStore chuẩn xác và tự động vẽ bản đồ GIS cáp quang

async function fetchAllRowsSafe(tableName) {
  let size = 1000, from = 0, allData = [], keep = true;
  while (keep) {
    let { data, error } = await supabaseClient.from(tableName).select('*').range(from, from + size - 1);
    if (error) throw error;
    if (data && data.length > 0) { allData = allData.concat(data); if (data.length < size) keep = false; else from += size; } else keep = false;
  }
  return allData;
}

/**
 * HÀM PHỤ TRỢ: Lấy ID chuẩn dạng chuỗi (String) để so sánh tuyệt đối chính xác
 */
function getStandardId(item, primaryKeyName) {
  if (!item) return '';
  if (item[primaryKeyName] !== undefined && item[primaryKeyName] !== null) return String(item[primaryKeyName]);
  if (item.id !== undefined && item.id !== null) return String(item.id);
  return '';
}

/**
 * 1. HÀM TẢI DỮ LIỆU TỪ SUPABASE
 */
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
    diemRes.forEach(d => diemMap[getStandardId(d, 'id_diem')] = d);
    rawDoanCapList.forEach(dc => doanCapMap[getStandardId(dc, 'id_doan_cap')] = dc);
    rawLoaiDiemList.forEach(l => loaiDiemMap[getStandardId(l, 'id_loaidiem')] = l.ten_loaidiem);

    globalDataPoints = [];
    dcdRes.forEach(item => {
      var pt = diemMap[String(item.id_diem || item.diem_id)], dc = doanCapMap[String(item.id_doan_cap || item.doan_cap_id)];
      if (!pt || isNaN(parseFloat(pt.lat))) return;
      var idLoai = pt.id_loaidiem || 1, loaiName = loaiDiemMap[String(idLoai)] || 'Điểm';
      var isMx = (Number(idLoai) === 4 || loaiName.toLowerCase().includes('mx') || loaiName.toLowerCase().includes('măng xông'));
      
      globalDataPoints.push({
        id: getStandardId(pt, 'id_diem'), 
        ten: pt.ten_diem || pt.ten, 
        lat: parseFloat(pt.lat), 
        lng: parseFloat(pt.long || pt.lng),
        ghiChu: pt.ghi_chu || '', 
        idTuyen: dc ? getStandardId(dc, 'id_tuyen') : null,
        idDoanCap: String(item.id_doan_cap || item.doan_cap_id), 
        idTram: String(pt.id_tram || 2), 
        idLoaiDiem: idLoai,
        loai: loaiName, 
        lyTrinh: pt.ly_trinh || '', 
        duTru: pt.du_tru ? parseFloat(pt.du_tru) : 0, 
        stt: isMx ? 9999 : (item.thu_tu || 1)
      });
    });

    // Cập nhật AppStore ban đầu
    AppStore.setState({
      daiList: rawDaiList,
      tramList: rawTramList,
      tuyenList: rawTuyenList,
      doanCapList: rawDoanCapList,
      dataPoints: globalDataPoints
    });

    // Thực hiện luồng xử lý phân quyền và đồng bộ trạng thái AppStore
    xuLyPhanQuyenDoanTuyenUser();

    if (forceRefresh) showToast("Đã làm mới dữ liệu!");
  } catch (err) { 
    showToast("Lỗi tải dữ liệu: " + err.message); 
  } finally { 
    hideLoading(); 
    if (map) map.invalidateSize(); 
  }
}

/**
 * 2. LUỒNG XỬ LÝ PHÂN QUYỀN & ĐỒNG BỘ TRẠNG THÁI APPSTORE
 */
function xuLyPhanQuyenDoanTuyenUser() {
  var selectDai = document.getElementById('selectDai');
  var groupDai = selectDai ? selectDai.closest('.form-group') : null;
  var selectTram = document.getElementById('selectTram');
  var groupTram = selectTram ? selectTram.closest('.form-group') : null;

  var selectTuyen = document.getElementById('selectTuyen');
  var selectDoanCap = document.getElementById('selectDoanCap');

  var userRole = (typeof currentUser !== 'undefined' && currentUser.role) ? currentUser.role : '';

  // BƯỚC 1: LỌC DANH SÁCH ĐOẠN CÁP CỦA USER
  var allowedDoanList = rawDoanCapList;
  
  if (userRole === 'tram_admin' || userRole === 'member' || userRole === 'tram_user') {
    if (currentUser && currentUser.idTram) {
      allowedDoanList = rawDoanCapList.filter(d => 
        String(d.id_tram || d.tram_id) === String(currentUser.idTram)
      );
    } else if (currentUser && currentUser.idDoanCap) {
      allowedDoanList = rawDoanCapList.filter(d => 
        getStandardId(d, 'id_doan_cap') === String(currentUser.idDoanCap)
      );
    }
  } else if (userRole === 'dai_admin' && currentUser.idDai) {
    var tramIdsOfDai = rawTramList.filter(t => String(t.id_dai || t.dai_id) === String(currentUser.idDai))
                                 .map(t => getStandardId(t, 'id_tram'));
    allowedDoanList = rawDoanCapList.filter(d => 
      tramIdsOfDai.includes(String(d.id_tram || d.tram_id))
    );
  }

  // BƯỚC 2: RÚT RA DANH SÁCH TUYẾN CÁP
  var allowedTuyenIds = [...new Set(allowedDoanList.map(d => String(d.id_tuyen || d.tuyen_cap_id)))];
  var userTuyenList = rawTuyenList.filter(t => allowedTuyenIds.includes(getStandardId(t, 'id_tuyen_cap')));

  // BƯỚC 3: ĐỔ DỮ LIỆU VÀO COMBOBOX TUYẾN CÁP
  if (selectTuyen) {
    selectTuyen.innerHTML = '<option value="ALL">-- Chọn tuyến cáp --</option>';
    userTuyenList.forEach(t => {
      var tId = getStandardId(t, 'id_tuyen_cap');
      var tName = t.ma_tuyencap || t.ten_tuyen;
      selectTuyen.innerHTML += `<option value="${tId}">${tName}</option>`;
    });
  }

  // BƯỚC 4: AN/HIỂN THỊ ĐÀI/TRẠM VA TRUY VẤN NGUỢC ID
  var finalDaiVal = 'ALL';
  var finalTramVal = 'ALL';

  if (userRole === 'tram_admin' || userRole === 'member' || userRole === 'tram_user') {
    if (groupDai) groupDai.style.display = 'none';
    if (groupTram) groupTram.style.display = 'none';
    
    if (allowedDoanList.length > 0) {
      var firstDoan = allowedDoanList[0];
      finalTramVal = String(firstDoan.id_tram || firstDoan.tram_id);
      var matchedTram = rawTramList.find(t => getStandardId(t, 'id_tram') === finalTramVal);
      if (matchedTram) finalDaiVal = String(matchedTram.id_dai || matchedTram.dai_id);

      if (selectTram) selectTram.value = finalTramVal;
      if (selectDai) selectDai.value = finalDaiVal;
    }
  } else {
    if (groupDai) groupDai.style.display = 'block';
    if (groupTram) groupTram.style.display = 'block';
    
    if (selectDai) {
      selectDai.innerHTML = '<option value="ALL">-- Tất cả Đài --</option>';
      rawDaiList.forEach(d => selectDai.innerHTML += `<option value="${getStandardId(d, 'id_dai')}">${d.ten_dai}</option>`);
      if (userRole === 'dai_admin' && currentUser.idDai) {
        finalDaiVal = String(currentUser.idDai);
        selectDai.value = finalDaiVal;
        selectDai.disabled = true;
      }
    }
  }

  // BƯỚC 5: TỰ ĐỘNG CHỌN TUYẾN 1, ĐOẠN 1 VÀ CẬP NHẬT TRẠNG THÁI APPSTORE
  var finalTuyenVal = 'ALL';
  var finalDoanVal = 'ALL';

  if (selectTuyen && selectTuyen.options.length > 1) {
    selectTuyen.selectedIndex = 1; 
    finalTuyenVal = selectTuyen.value;
    
    if (selectDoanCap) {
      selectDoanCap.innerHTML = '<option value="ALL">-- Tất cả đoạn cáp --</option>';
      var matchedDoanOfSelectedTuyen = allowedDoanList.filter(d => String(d.id_tuyen || d.tuyen_cap_id) === String(finalTuyenVal));
      
      matchedDoanOfSelectedTuyen.forEach(d => {
        var dId = getStandardId(d, 'id_doan_cap');
        var dName = d.ma_doancap || d.ten_doancap;
        selectDoanCap.innerHTML += `<option value="${dId}">${dName}</option>`;
      });

      if (selectDoanCap.options.length > 1) {
        selectDoanCap.selectedIndex = 1;
        finalDoanVal = selectDoanCap.value;
      }
    }
  }

  // ĐỒNG BỘ TRẠNG THÁI APPSTORE CHÍNH XÁC (KHÔNG ĐỂ BỊ LỖI 'ALL')
  AppStore.setState({
    selectedDai: finalDaiVal,
    selectedTram: finalTramVal,
    selectedTuyen: finalTuyenVal,
    selectedDoanCap: finalDoanVal
  });

  // KÍCH HOẠT VẼ BẢN ĐỒ
  capNhatComboDiemA();
  veLaiTuyenAB();
}

function onDaiChange() {
  xuLyPhanQuyenDoanTuyenUser();
}

function onTramChange() {
  xuLyPhanQuyenDoanTuyenUser();
}

function onTuyenChange() {
  var selectTuyen = document.getElementById('selectTuyen');
  var tuyenVal = selectTuyen ? selectTuyen.value : 'ALL';
  var selectDoanCap = document.getElementById('selectDoanCap');
  
  AppStore.setState({ selectedTuyen: tuyenVal });

  if (selectDoanCap) {
    selectDoanCap.innerHTML = '<option value="ALL">-- Tất cả đoạn cáp --</option>';
    if (tuyenVal !== 'ALL') {
      var userRole = (typeof currentUser !== 'undefined' && currentUser.role) ? currentUser.role : '';
      var matchedDoan = rawDoanCapList.filter(d => String(d.id_tuyen || d.tuyen_cap_id) === String(tuyenVal));

      if ((userRole === 'tram_admin' || userRole === 'member' || userRole === 'tram_user') && currentUser.idTram) {
        matchedDoan = matchedDoan.filter(d => String(d.id_tram || d.tram_id) === String(currentUser.idTram));
      }

      matchedDoan.forEach(d => {
        var dId = getStandardId(d, 'id_doan_cap');
        var dName = d.ma_doancap || d.ten_doancap;
        selectDoanCap.innerHTML += `<option value="${dId}">${dName}</option>`;
      });
    }
  }
  capNhatComboDiemA();
  veLaiTuyenAB();
}

function onDoanCapChange() { 
  var selectDoanCap = document.getElementById('selectDoanCap');
  var doanVal = selectDoanCap ? selectDoanCap.value : 'ALL';
  AppStore.setState({ selectedDoanCap: doanVal });
  veLaiTuyenAB(); 
}

function onDiemAChange() { 
  veLaiTuyenAB(); 
}

function capNhatComboDiemA() {
  var selectTuyen = document.getElementById('selectTuyen');
  var tuyenVal = selectTuyen ? selectTuyen.value : 'ALL';
  var combo = document.getElementById('comboDiemA');
  if (!combo) return;
  combo.innerHTML = '<option value="DEFAULT">📍 Trạm Gốc (TNN)</option>';
  globalDataPoints.filter(pt => isMangXong(pt) && (tuyenVal === 'ALL' || String(pt.idTuyen) === String(tuyenVal))).forEach(mx => {
    combo.innerHTML += `<option value="${mx.ten}">🔀 ${mx.ten}</option>`;
  });
}

// --- CÁC HÀM PHÂN TÍCH SỰ CỐ OTDR VÀ TÌM LÝ TRÌNH ---
function chiaSeSuCo(lat, lng, khoangCachKm, prevMX, nextMX, shareType) {
  var message = `[TNN NET1] THÔNG BÁO SỰ CỐ CÁP QUANG\n- Tọa độ: ${lat}, ${lng}\n- Cự ly đo OTDR: ${khoangCachKm} km\n- Vị trí: Nằm giữa [${prevMX}] và [${nextMX}]\n- Bản đồ: https://maps.google.com/?q=${lat},${lng}`;
  var encoded = encodeURIComponent(message);
  if (shareType === 'copy') { navigator.clipboard.writeText(message); showToast("Đã sao chép nội dung!"); }
  else if (shareType === 'sms') window.open(`sms:?&body=${encoded}`, '_blank');
  else if (shareType === 'viber') window.open(`viber://forward?text=${encoded}`, '_blank');
}

function timViTriDut() {
  var kcOtdrKm = parseFloat(document.getElementById('txtKcOtdr').value), kcOtdrMeters = kcOtdrKm * 1000; 
  if (isNaN(kcOtdrMeters) || kcOtdrMeters <= 0) { showToast("Nhập cự ly đo hợp lệ!"); return; }
  
  var tuyenVal = document.getElementById('selectTuyen').value;
  var tramVal = document.getElementById('selectTram') ? document.getElementById('selectTram').value : 'ALL';
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
                  `<a href='https://maps.google.com/?q=${targetLat},${targetLng}' target='_blank' class='gmaps-btn'>🗺️ Dẫn đường</a>${shareButtons}`;
  
  faultMarker.bindPopup(popupHtml).openPopup();
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
    showToast("Vui lòng chọn tuyến cáp trước khi tìm kiếm!");
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

  var selectTuyen = document.getElementById('selectTuyen');
  var selectTram = document.getElementById('selectTram');
  var selectDoanCap = document.getElementById('selectDoanCap');
  
  var tuyenVal = selectTuyen ? selectTuyen.value : 'ALL';
  var tramVal = selectTram ? selectTram.value : 'ALL';
  var doanVal = selectDoanCap ? selectDoanCap.value : 'ALL';

  var distToA = getDistanceAlongRoute({lat: foundLat, lng: foundLng}, getMasterRouteBackbone(tuyenVal, tramVal, doanVal));
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
      foundMarkerLayer.setPopupContent(popupContent.replace("Đang tra cứu tọa độ...", "Không thể kết nối dịch vụ địa danh"));
    });
}

/**
 * 3. MODULE VẼ ĐƯỜNG TUYẾN PHÂN MÀU VÀ MỐC HẠ TẦNG TRÊN BẢN ĐỒ
 */
var routeColoredLinesGroup = L.featureGroup();
var pointsMarkersLayer = L.featureGroup();

function getColorByLoaiDiem(loaiDiemStr, idLoaiDiem) {
  var str = (loaiDiemStr || '').toLowerCase();
  if (str.includes('bể') || str.includes('be') || idLoaiDiem == 2) return '#fd7e14'; // Cam (Bể)
  if (str.includes('mốc') || str.includes('moc') || idLoaiDiem == 3) return '#795548'; // Nâu (Mốc)
  if (str.includes('cột') || str.includes('cot') || idLoaiDiem == 1) return '#28a745'; // Xanh lá (Cột)
  if (str.includes('măng xông') || str.includes('mx') || idLoaiDiem == 4) return '#dc3545'; // Đỏ (MX)
  return '#007bff';
}

function createCustomMarkerIcon(loaiDiemStr, idLoaiDiem) {
  var color = getColorByLoaiDiem(loaiDiemStr, idLoaiDiem);
  var symbol = '📍';
  var str = (loaiDiemStr || '').toLowerCase();

  if (str.includes('bể') || str.includes('be') || idLoaiDiem == 2) symbol = '📦';
  else if (str.includes('mốc') || str.includes('moc') || idLoaiDiem == 3) symbol = '🧱';
  else if (str.includes('cột') || str.includes('cot') || idLoaiDiem == 1) symbol = '💈';
  else if (str.includes('măng xông') || str.includes('mx') || idLoaiDiem == 4) symbol = '⚡';

  var htmlContent = `<div style="
    background-color: ${color};
    color: white;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    text-align: center;
    line-height: 24px;
    border: 2px solid #ffffff;
    box-shadow: 0 0 4px rgba(0,0,0,0.5);
    font-size: 11px;
  ">${symbol}</div>`;

  return L.divIcon({
    html: htmlContent,
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
}

function renderColoredRouteOnMap() {
  var selectTuyen = document.getElementById('selectTuyen');
  var tuyenVal = selectTuyen ? selectTuyen.value : 'ALL';

  if (tuyenVal === 'ALL') {
    if (map.hasLayer(routeColoredLinesGroup)) routeColoredLinesGroup.clearLayers();
    if (map.hasLayer(pointsMarkersLayer)) pointsMarkersLayer.clearLayers();
    return;
  }

  var selectTram = document.getElementById('selectTram');
  var selectDoanCap = document.getElementById('selectDoanCap');
  var tramVal = selectTram ? selectTram.value : 'ALL';
  var doanVal = selectDoanCap ? selectDoanCap.value : 'ALL';
  
  var backbone = getMasterRouteBackbone(tuyenVal, tramVal, doanVal);
  if (!backbone || backbone.length < 2) return;

  if (!map.hasLayer(routeColoredLinesGroup)) routeColoredLinesGroup.addTo(map);
  if (!map.hasLayer(pointsMarkersLayer)) pointsMarkersLayer.addTo(map);

  routeColoredLinesGroup.clearLayers();
  pointsMarkersLayer.clearLayers();

  for (var i = 0; i < backbone.length - 1; i++) {
    var p1 = backbone[i];
    var p2 = backbone[i + 1];

    if (p1.lat && p1.lng && p2.lat && p2.lng) {
      var lineColor = getColorByLoaiDiem(p1.loai || p1.loaiDiem, p1.idLoaiDiem);
      var segment = L.polyline(
        [[p1.lat, p1.lng], [p2.lat, p2.lng]],
        { color: lineColor, weight: 5, opacity: 0.85, lineJoin: 'round' }
      );
      var popupText = `<b>Đoạn cáp: ${p1.ten || p1.tenDiem} ➔ ${p2.ten || p2.tenDiem}</b><br>` +
                      `- Phân loại: <b>${p1.loai || p1.loaiDiem}</b><br>` +
                      `- Lý trình: <b>${p1.lyTrinh || '0+000'}</b>`;
      segment.bindPopup(popupText);
      routeColoredLinesGroup.addLayer(segment);
    }
  }

  backbone.forEach(function(pt) {
    if (pt.lat && pt.lng) {
      var icon = createCustomMarkerIcon(pt.loai || pt.loaiDiem, pt.idLoaiDiem);
      var marker = L.marker([pt.lat, pt.lng], { icon: icon });
      var markerPopup = `<b>📌 ${pt.ten || pt.tenDiem}</b><br>` +
                        `- Loại điểm: <b>${pt.loai || pt.loaiDiem}</b><br>` +
                        `- Lý trình: <b>${pt.lyTrinh || 'N/A'}</b><br>` +
                        `- Dự trữ cáp: <b>${pt.duTru || 0} m</b>`;
      marker.bindPopup(markerPopup);
      pointsMarkersLayer.addLayer(marker);
    }
  });

  try {
    map.fitBounds(routeColoredLinesGroup.getBounds(), { padding: [40, 40] });
  } catch(e) {}
}

function veLaiTuyenAB() {
  renderColoredRouteOnMap();
}
