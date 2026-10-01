// ==========================================================================
// TỆP DATA.JS - QUẢN LÝ LUỒNG DỮ LIỆU (TÍCH HỢP VIEW SUPABASE & OFFLINE)
// ==========================================================================

var autoClearMarkerTimer = null; 
var rawDaiList = [], rawTramList = [], rawTuyenList = [], rawDoanCapList = [], rawLoaiDiemList = [], rawUserList = [], rawHuongList = [];
var isSyncingMaster = false; 

/**
 * 1. HÀM TIỆN ÍCH TRUY VẤN VÀ CHUẨN HÓA KHÓA ID AN TOÀN
 */
async function fetchAllRowsSafe(tableName) {
  let size = 1000, from = 0, allData = [], keep = true;
  while (keep) {
    let { data, error } = await supabaseClient.from(tableName).select('*').range(from, from + size - 1);
    if (error) throw error;
    if (data && data.length > 0) { allData = allData.concat(data); if (data.length < size) keep = false; else from += size; } else keep = false;
  }
  return allData;
}

function getSafeStrId(item, keys) {
  if (!item) return '';
  for (let k of keys) {
    if (item[k] !== undefined && item[k] !== null && item[k] !== '') {
      return String(item[k]).trim();
    }
  }
  return '';
}

async function fetchAllDiemHaTangSafe() {
  let size = 1000, from = 0, allData = [], keep = true;
  while (keep) {
    let { data, error } = await supabaseClient
      .from('v_diem_ha_tang_full')
      .select('*')
      .range(from, from + size - 1);
    if (error) throw error;
    if (data && data.length > 0) {
      allData = allData.concat(data);
      if (data.length < size) keep = false;
      else from += size;
    } else {
      keep = false;
    }
  }
  return allData;
}

/**
 * 2. TẢI VÀ ĐỒNG BỘ TOÀN BỘ DỮ LIỆU (MASTER + QUAN HỆ + ĐIỂM HẠ TẦNG)
 */
async function taiDuLieuSupabase(forceRefresh = false) {
  isSyncingMaster = true; 
  showLoading("⏳ Đang đồng bộ toàn bộ Danh mục & Điểm hạ tầng từ máy chủ, vui lòng đợi...");

  try {
    if (!navigator.onLine) {
      throw new Error("Không có kết nối Internet để tải dữ liệu mới! Hệ thống đang ở chế độ ngoại tuyến.");
    }

    if (typeof supabaseClient === 'undefined') {
      throw new Error("Chưa kết nối được với cơ sở dữ liệu Supabase!");
    }

    const safeQuery = async (queryFn) => {
      try {
        let res = await queryFn();
        return { data: res.data || [], error: res.error || null };
      } catch (err) {
        return { data: [], error: err };
      }
    };

    let [daiRes, tramRes, tuyenRes, loaiRes, userRes, huongRes] = await Promise.all([
      safeQuery(() => supabaseClient.from('dai_vt').select('*')),
      safeQuery(() => supabaseClient.from('tram_vt').select('*')),
      safeQuery(() => supabaseClient.from('tuyen_cap').select('*')),
      safeQuery(() => supabaseClient.from('loai_diem').select('*')),
      safeQuery(() => supabaseClient.from('tai_khoan').select('*')),
      safeQuery(() => supabaseClient.from('huong').select('*'))
    ]);

    let doanData = [];
    let doanCapDiemLinks = [];
    try {
      doanData = await fetchAllRowsSafe('v_doan_cap_full');
      doanCapDiemLinks = await fetchAllRowsSafe('doan_cap_diem'); // Vét cạn bảng quan hệ
    } catch (e) {
      console.warn("Lỗi tải vét cạn quan hệ:", e);
    }

    rawDaiList = daiRes.data.length ? daiRes.data : rawDaiList;
    rawTramList = tramRes.data.length ? tramRes.data : rawTramList;
    rawTuyenList = tuyenRes.data.length ? tuyenRes.data : rawTuyenList;
    rawDoanCapList = doanData.length ? doanData : rawDoanCapList;
    rawLoaiDiemList = loaiRes.data.length ? loaiRes.data : rawLoaiDiemList;
    rawUserList = userRes.data.length ? userRes.data : rawUserList;
    rawHuongList = huongRes.data.length ? huongRes.data : rawHuongList;

    if (typeof idbLuuMaster === 'function') {
      await idbLuuMaster({ 
        rawDaiList, rawTramList, rawTuyenList, rawDoanCapList, rawLoaiDiemList, rawUserList, rawHuongList 
      });
    }

    // Lưu bảng quan hệ xuống IndexedDB
    if (typeof idbLuuDoanCapDiem === 'function' && doanCapDiemLinks.length > 0) {
      let formattedLinks = doanCapDiemLinks.map(l => ({
        idDoanCap: String(l.id_doan_cap),
        idDiem: String(l.id_diem),
        thu_tu: l.thu_tu !== undefined ? Number(l.thu_tu) : 999
      }));
      await idbLuuDoanCapDiem(formattedLinks);
      console.log(`✅ Đã lưu ${formattedLinks.length} liên kết quan hệ vào IndexedDB.`);
    }

    // Tải và lưu toàn bộ điểm hạ tầng
    let allPointsRaw = await fetchAllDiemHaTangSafe();
    let formattedAllPoints = allPointsRaw.map(pt => ({
      id: String(pt.id), ten: pt.ten || '', lat: parseFloat(pt.lat), lng: parseFloat(pt.lng),
      ghiChu: pt.ghi_chu || '', idTuyen: String(pt.id_tuyen), idDoanCap: String(pt.id_doan_cap),
      idTram: String(pt.id_tram), idLoaiDiem: pt.id_loaidiem || 1, loai: pt.loai || 'Điểm',
      lyTrinh: pt.ly_trinh || '', duTru: pt.du_tru ? parseFloat(pt.du_tru) : 0,
      idHuong: pt.id_huong !== null && pt.id_huong !== undefined ? Number(pt.id_huong) : '',
      ngayPs: pt.ngay_ps || '', ghichu_an: pt.ghichu_an || '', stt: pt.stt !== undefined && pt.stt !== null ? Number(pt.stt) : 1
    }));

    if (typeof idbLuuTatCaDiem === 'function' && formattedAllPoints.length > 0) {
      await idbLuuTatCaDiem(formattedAllPoints);
      console.log(`✅ Đã lưu ${formattedAllPoints.length} điểm hạ tầng vào IndexedDB.`);
    }

    AppStore.setState({
      daiList: rawDaiList, tramList: rawTramList, tuyenList: rawTuyenList, doanCapList: rawDoanCapList,
      rawDaiList: rawDaiList, rawTramList: rawTramList, rawTuyenList: rawTuyenList, rawDoanList: rawDoanCapList, rawUserList: rawUserList
    });

    if (typeof xuLyPhanQuyenDoanTuyenUser === 'function') xuLyPhanQuyenDoanTuyenUser();
    if (typeof renderAllAdminTables === 'function') renderAllAdminTables();
    
    if (forceRefresh) {
      showToast("✅ Đã đồng bộ toàn bộ dữ liệu thành công!", "success");
    }

  } catch (err) {
    console.error("Lỗi đồng bộ dữ liệu:", err.message);
    showToast("❌ Lỗi: " + err.message, "error");
  } finally {
    isSyncingMaster = false; 
    hideLoading();
    if (typeof map !== 'undefined' && map) map.invalidateSize();
    
    var selectTuyen = document.getElementById('selectTuyen');
    var initTuyenVal = selectTuyen ? (String(selectTuyen.value).trim() || 'ALL') : 'ALL';
    if (typeof taiDiemTheoTuyen === 'function') {
        await taiDiemTheoTuyen(initTuyenVal, forceRefresh);
    }
  }
}

function capNhatComboDiemA() {
  var combo = document.getElementById('comboDiemA');
  if (!combo) return;
  combo.innerHTML = '<option value="DEFAULT">📍 Trạm VT A </option>';
  globalDataPoints.filter(pt => isMangXong(pt)).forEach(mx => {
    combo.innerHTML += `<option value="${mx.ten}">🔀 ${mx.ten}</option>`;
  });
}
/**
 * 3. TẢI ĐIỂM HẠ TẦNG THEO VÙNG XEM MÀN HÌNH
 */
async function taiDiemTheoVungXem(forceRefresh = false) {
  if (isSyncingMaster) return;
  if (typeof map === 'undefined' || !map) return;
  
  var checkedDoan = typeof getCheckedDoanIds === 'function' ? getCheckedDoanIds() : [];
  if (checkedDoan.length > 0) return; 

  var bounds = map.getBounds();
  var minLat = bounds.getSouth(), maxLat = bounds.getNorth();
  var minLng = bounds.getWest(), maxLng = bounds.getEast();

  try {
    if (!forceRefresh && typeof idbDocDiemTheoVungXem === 'function') {
      let localPts = await idbDocDiemTheoVungXem(minLat, maxLat, minLng, maxLng);
      if (localPts && localPts.length > 0) {
        globalDataPoints = localPts;
      }
    }
  } catch (err) {
    console.warn("Lỗi tải điểm vùng xem:", err.message);
  } finally {
    AppStore.setState({ dataPoints: globalDataPoints });
    if (typeof veLaiTuyenAB === 'function') veLaiTuyenAB();
  }
}

/**
 * 4. TẢI ĐIỂM HẠ TẦNG THEO TUYẾN
 */
async function taiDiemTheoTuyen(idTuyen, forceRefresh = false) {
  if (!idTuyen || idTuyen === 'ALL' || idTuyen === 'undefined') {
    await taiDiemTheoVungXem(forceRefresh); return;
  }
  await taiDiemTheoVungXem(forceRefresh);
}

/**
 * 5. TẢI ĐIỂM ĐA TUYẾN THEO CÂY CHECKLIST (ĐÃ TÍCH HỢP QUAN HỆ CHUẨN SUPABASE)
 */
async function taiDiemDaTuyen(forceRefresh = false) {
  var selectedDoanIds = getCheckedDoanIds();
  
  if (selectedDoanIds.length === 0) {
    globalDataPoints = []; window.segmentPointsCache = {}; window.cacheThuTuDoanCap = {}; window.cacheChiTietDiemDoanCap = {};
    AppStore.setState({ dataPoints: [] });
    if (typeof veLaiTuyenAB === 'function') veLaiTuyenAB();
    return;
  }

  try {
    window.segmentPointsCache = {}; window.cacheThuTuDoanCap = {}; window.cacheChiTietDiemDoanCap = {};
    let hasLocalData = false;

    // ĐỌC DỮ LIỆU TỪ INDEXEDDB THEO MÔ HÌNH QUAN HỆ (JOIN MÔ PHỎNG SUPABASE)
    if (!forceRefresh && typeof idbDocDoanCapDiem === 'function') {
       let allLocalPts = [];
       let segmentPointsCacheMap = {};
       let cacheThuTuMap = {};
       let cacheChiTietMap = {};
       const db = await openGISDatabase();

       for (let dId of selectedDoanIds) {
          let links = await idbDocDoanCapDiem(dId);
          if (links && links.length > 0) {
             let diemIds = links.map(l => String(l.idDiem));
             links.forEach(l => {
                cacheThuTuMap[Number(l.idDiem)] = l.thu_tu;
             });

             const tx = db.transaction('diem_store', 'readonly');
             const store = tx.objectStore('diem_store');

             for (let dIdPt of diemIds) {
                await new Promise(resolvePt => {
                   const req = store.get(dIdPt);
                   req.onsuccess = () => {
                      if (req.result) {
                         let pt = { ...req.result, thu_tu: cacheThuTuMap[Number(req.result.id)] || 999 };
                         if (!allLocalPts.some(p => String(p.id) === String(pt.id))) {
                            allLocalPts.push(pt);
                         }
                         cacheChiTietMap[Number(pt.id)] = pt;
                         if (!segmentPointsCacheMap[dId]) segmentPointsCacheMap[dId] = [];
                         if (!segmentPointsCacheMap[dId].some(p => String(p.id) === String(pt.id))) {
                            segmentPointsCacheMap[dId].push(pt);
                         }
                      }
                      resolvePt();
                   };
                   req.onerror = () => resolvePt();
                });
             }
          }
       }

       if (allLocalPts.length > 0) {
          hasLocalData = true;
          window.cacheThuTuDoanCap = cacheThuTuMap;
          window.cacheChiTietDiemDoanCap = cacheChiTietMap;

          for (let dId in segmentPointsCacheMap) {
             segmentPointsCacheMap[dId].sort((a, b) => a.thu_tu - b.thu_tu);
             window.segmentPointsCache[dId] = segmentPointsCacheMap[dId];
          }
          globalDataPoints = allLocalPts;
       }
    }

    if ((forceRefresh || !hasLocalData) && navigator.onLine && typeof supabaseClient !== 'undefined') {
      if (forceRefresh || !hasLocalData) showLoading("Đang nạp dữ liệu bản đồ...");
      let allCombinedPts = [];

      for (let i = 0; i < selectedDoanIds.length; i++) {
        let dId = selectedDoanIds[i];

        let segmentLinks = []; let offset = 0; let fetchMore = true;
        while (fetchMore) {
          let { data: chunk, error } = await supabaseClient.from('doan_cap_diem').select('id_diem, thu_tu').eq('id_doan_cap', Number(dId)).range(offset, offset + 999);
          if (error) throw error;
          if (chunk && chunk.length > 0) { segmentLinks = segmentLinks.concat(chunk); offset += 1000; if (chunk.length < 1000) fetchMore = false; } else { fetchMore = false; }
        }
        if (segmentLinks.length === 0) continue;
        
        segmentLinks.forEach(row => { window.cacheThuTuDoanCap[Number(row.id_diem)] = row.thu_tu; });

        let allIds = segmentLinks.map(l => Number(l.id_diem));
        let segmentPointObjects = []; const batchSize = 500;
        
        for (let b = 0; b < allIds.length; b += batchSize) {
          let batchIds = allIds.slice(b, b + batchSize);
          if (batchIds.length === 0) continue;

          const { data: batchData, error: errBatch } = await supabaseClient.from('v_diem_ha_tang_full').select('*').in('id', batchIds);
          if (errBatch) throw errBatch;
          if (batchData) segmentPointObjects = segmentPointObjects.concat(batchData);
        }

        let formattedPts = segmentPointObjects.map(pt => {
          let pId = Number(pt.id); let tVal = window.cacheThuTuDoanCap[pId];
          let formattedPt = {
            id: String(pt.id), ten: pt.ten || '', lat: parseFloat(pt.lat), lng: parseFloat(pt.lng),
            ghiChu: pt.ghi_chu || '', idTuyen: String(pt.id_tuyen), idDoanCap: String(pt.id_doan_cap || dId),
            idTram: String(pt.id_tram), idLoaiDiem: pt.id_loaidiem || 1, loai: pt.loai || 'Điểm',
            lyTrinh: pt.ly_trinh || '', idHuong: pt.id_huong || null, ngayPs: pt.ngay_ps || '',
            duTru: pt.du_tru ? parseFloat(pt.du_tru) : 0, stt: pt.stt !== undefined && pt.stt !== null ? Number(pt.stt) : 1,
            ghichu_an: pt.ghichu_an || '', thu_tu: (tVal !== undefined && tVal !== null) ? Number(tVal) : 9999
          };
          window.cacheChiTietDiemDoanCap[pId] = formattedPt;
          return formattedPt;
        });

        formattedPts.sort((a, b) => a.thu_tu - b.thu_tu);
        window.segmentPointsCache[String(dId)] = formattedPts;
        allCombinedPts = allCombinedPts.concat(formattedPts);
      }

      globalDataPoints = allCombinedPts;
    }
  } catch (err) {
    console.warn("Lỗi tải điểm đa tuyến:", err.message);
    showToast("❌ Không thể tải điểm: " + err.message, "error");
  } finally {
    AppStore.setState({ dataPoints: globalDataPoints });
    capNhatComboDiemA();
    hideLoading();
    if (typeof veLaiTuyenAB === 'function') veLaiTuyenAB();
  }
}

function onDiemAChange() { 
  if (typeof veLaiTuyenAB === 'function') veLaiTuyenAB(); 
}

async function dongBoDuLieuTonDong() {
  if (typeof idbLayHangDoiSync !== 'function') return;
  let queue = await idbLayHangDoiSync();
  if (!queue || queue.length === 0) return;

  if (!navigator.onLine) return;

  showLoading(`Đang đẩy ${queue.length} thao tác ngoại tuyến lên máy chủ...`);
  for (let i = 0; i < queue.length; i++) {
    let task = queue[i];
    try {
      if (task.actionType === 'UPDATE_COORD') {
         await supabaseClient.from('diem_ha_tang').update({ lat: task.payload.lat, long: task.payload.lng }).eq('id_diem', task.payload.id_diem);
      } else if (task.actionType === 'DELETE_POINT') {
         await supabaseClient.from('diem_ha_tang').delete().eq('id_diem', task.payload.id_diem);
      } else if (task.actionType === 'ADD_POINT' || task.actionType === 'EDIT_POINT') {
         let p = task.payload;
         let doanIds = p.doan_ids || [];
         let isAdd = (task.actionType === 'ADD_POINT');
         let targetId = p.id_diem;
         
         delete p.doan_ids;
         if (isAdd) delete p.id_diem;

         if (isAdd) {
           const { data, error } = await supabaseClient.from('diem_ha_tang').insert([p]).select();
           if (error) throw error;
           
           if (data && data[0] && doanIds.length > 0) {
             let newId = data[0].id_diem;
             let links = doanIds.map(dId => ({ id_doan_cap: Number(dId), id_diem: newId, thu_tu: 999 }));
             await supabaseClient.from('doan_cap_diem').upsert(links, { onConflict: 'id_doan_cap,id_diem' });
           }
         } else {
           const { error } = await supabaseClient.from('diem_ha_tang').update(p).eq('id_diem', targetId);
           if (error) throw error;
         }
      }
      await idbXoaHangDoiSync(task.id);
    } catch (err) {
      console.error("Lỗi đồng bộ tác vụ ID " + task.id, err);
    }
  }
  hideLoading();
  showToast("✅ Đã đồng bộ toàn bộ dữ liệu ngoại tuyến lên máy chủ thành công!", "success");
  if (typeof taiDuLieuSupabase === 'function') taiDuLieuSupabase(true);
}

function datLichTuXoaMarkerTimKiem() {
  if (autoClearMarkerTimer) {
    clearTimeout(autoClearMarkerTimer);
  }

  autoClearMarkerTimer = setTimeout(function() {
    if (typeof foundMarkerLayer !== 'undefined' && foundMarkerLayer && map) {
      map.removeLayer(foundMarkerLayer);
      foundMarkerLayer = null;
      showToast("⏱️ Đã tự động xóa mốc tìm kiếm (Sau 30s)", "info");
    }
  }, 30000);
}

function chiaSeSuCo(lat, lng, khoangCachKm, lyTrinhText, prevMXInfo, nextMXInfo, shareType) {
  var message = `[NET1] THÔNG BÁO SỰ CỐ CÁP QUANG\n` +
                `- Tọa độ: ${lat}, ${lng}\n` +
                `- Cự ly đo OTDR: ${khoangCachKm} km\n` +
                `- Lý trình QL: ${lyTrinhText}\n` +
                `- MX trước: ${prevMXInfo}\n` +
                `- MX sau: ${nextMXInfo}\n` +
                `- Bản đồ: https://maps.google.com/?q=${lat},${lng}`;
  
  if (shareType === 'copy') { 
    navigator.clipboard.writeText(message); 
    showToast("📋 Đã sao chép nội dung sự cố!", "success"); 
  } else if (shareType === 'zalo') {
    navigator.clipboard.writeText(message);
    showToast("📋 Đã sao chép! Đang mở ứng dụng Zalo...", "success");
    setTimeout(function() { window.location.href = 'zalo://'; }, 500);
  } else if (shareType === 'viber') {
    var encoded = encodeURIComponent(message);
    window.open(`viber://forward?text=${encoded}`, '_blank');
  }
}

function timViTriDut() {
  var kcOtdrKm = parseFloat(document.getElementById('txtKcOtdr').value);
  var kcOtdrMeters = kcOtdrKm * 1000; 
  if (isNaN(kcOtdrMeters) || kcOtdrMeters <= 0) { showToast("Nhập cự ly đo hợp lệ!", "error"); return; }
  
  var checkedDoan = typeof getCheckedDoanIds === 'function' ? getCheckedDoanIds() : [];
  if (checkedDoan.length === 0) {
    showToast("Vui lòng tích chọn ít nhất 1 đoạn cáp trên cây Checklist!", "error");
    return;
  }

  if (checkedDoan.length > 1) {
    chonDoanCapPhanTich(function(selectedDoanId) {
      thucHienTinhToanOtdr(kcOtdrKm, kcOtdrMeters, selectedDoanId);
    });
    return;
  }

  thucHienTinhToanOtdr(kcOtdrKm, kcOtdrMeters, checkedDoan[0]);
}

function thucHienTinhToanOtdr(kcOtdrKm, kcOtdrMeters, doanVal) {
  var backbone = getFullRouteBackboneForSegment(doanVal);
  precalculateRouteDataForPoints(backbone, backbone);

  if (backbone.length < 2) { showToast("Tuyến cáp chưa đủ dữ liệu!", "error"); return; }

  var routeStops = [];
  backbone.forEach(p => routeStops.push({ pt: p, dist: p.distanceFromAMeters, duTru: p.duTru || 0, isMX: isMangXong(p) }));
  routeStops.sort((a, b) => a.dist - b.dist);

  var targetLat = backbone[backbone.length - 1].lat, targetLng = backbone[backbone.length - 1].lng;
  var prevMXName = "Chưa xác định", nextMXName = "Chưa xác định";
  var prevMXDistText = "", nextMXDistText = "";
  var interpolatedLyTrinhText = "Đang xác định...";

  for (var i = 0; i < routeStops.length - 1; i++) {
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

      for (var j = i; j >= 0; j--) {
        if (routeStops[j].isMX) {
          prevMXName = routeStops[j].pt.ten;
          var distPrev = Math.round(kcOtdrMeters - routeStops[j].dist);
          prevMXDistText = (distPrev >= 1000) ? (distPrev / 1000).toFixed(2) + " km" : distPrev + " m";
          break;
        }
      }

      for (var k = i + 1; k < routeStops.length; k++) { 
        if (routeStops[k].isMX) { 
          nextMXName = routeStops[k].pt.ten;
          var distNext = Math.round(routeStops[k].dist - kcOtdrMeters);
          nextMXDistText = (distNext >= 1000) ? (distNext / 1000).toFixed(2) + " km" : distNext + " m";
          break; 
        } 
      }
      break;
    }
  }

  if (typeof foundMarkerLayer !== 'undefined' && foundMarkerLayer && map) map.removeLayer(foundMarkerLayer);
  map.setView([targetLat, targetLng], 19, { animate: true });
  
  var faultIcon = L.divIcon({ html: '<div style="background:red; color:white; width:28px; height:28px; border-radius:50%; text-align:center; line-height:28px; border:2px solid #fff; box-shadow:0 0 10px red;">⚡</div>', iconSize: [28, 28] });
  var faultMarker = L.marker([targetLat, targetLng], { icon: faultIcon }).addTo(map);
  foundMarkerLayer = faultMarker;

  var prevMXFullInfo = prevMXName + (prevMXDistText ? ` (cách ${prevMXDistText})` : '');
  var nextMXFullInfo = nextMXName + (nextMXDistText ? ` (cách ${nextMXDistText})` : '');

  var shareButtonsHtml = `
    <div style="margin-top: 8px; border-top: 1px dashed #ccc; padding-top: 6px;">
      <b>Chia sẻ sự cố nhanh:</b><br>
      <button class="btn-info" onclick="chiaSeSuCo(${targetLat.toFixed(6)}, ${targetLng.toFixed(6)}, ${kcOtdrKm.toFixed(2)}, '${interpolatedLyTrinhText}', '${prevMXFullInfo}', '${nextMXFullInfo}', 'copy')">📋 Copy</button>
      <button class="btn-info" onclick="chiaSeSuCo(${targetLat.toFixed(6)}, ${targetLng.toFixed(6)}, ${kcOtdrKm.toFixed(2)}, '${interpolatedLyTrinhText}', '${prevMXFullInfo}', '${nextMXFullInfo}', 'zalo')" style="background:#0068ff; color:white;">💬 Zalo App</button>
      <button class="btn-info" onclick="chiaSeSuCo(${targetLat.toFixed(6)}, ${targetLng.toFixed(6)}, ${kcOtdrKm.toFixed(2)}, '${interpolatedLyTrinhText}', '${prevMXFullInfo}', '${nextMXFullInfo}', 'viber')" style="background:#6f42c1; color:white;">📱 Viber</button>
    </div>`;
  
  var popupHtml = `<b>⚡ VỊ TRÍ SỰ CỐ OTDR</b><br>` +
                  `Cự đoạn đo: <b>${kcOtdrKm.toFixed(2)} km</b><br>` +
                  `📍 Lý trình QL: <b>${interpolatedLyTrinhText}</b><br>` +
                  `🔀 MX trước: <b>${prevMXFullInfo}</b><br>` +
                  `🔀 MX sau: <b>${nextMXFullInfo}</b><br>` +
                  `<a href='https://maps.google.com/?q=${targetLat},${targetLng}' target='_blank' class='btn-info' style='background:#0d6efd; color:white;'>🗺️ Dẫn đường GMaps</a>` +
                  shareButtonsHtml;
  
  faultMarker.bindPopup(popupHtml).openPopup();
  var panel = document.getElementById('control-panel');
  if (panel) panel.style.display = 'none';
  datLichTuXoaMarkerTimKiem();
}

function timLyTrinhBanDo() {
  var txt = document.getElementById('txtTimLyTrinh').value.trim();
  var parsedTarget = parseLyTrinhWithSuffix(txt);
  var targetMeters = parsedTarget ? parsedTarget.meters : null;
  
  if (targetMeters === null || isNaN(targetMeters)) {
    showToast("Sai định dạng lý trình! Vui lòng nhập theo mẫu: 54+100 hoặc km 54+100", "error");
    return;
  }
  
  var checkedDoan = typeof getCheckedDoanIds === 'function' ? getCheckedDoanIds() : [];
  if (checkedDoan.length === 0) {
    showToast("Vui lòng tích chọn ít nhất 1 đoạn cáp trên cây Checklist trước khi tìm kiếm!", "error");
    return;
  }

  if (checkedDoan.length > 1) {
    chonDoanCapPhanTich(function(selectedDoanId) {
      thucHienTimLyTrinh(txt, targetMeters, selectedDoanId);
    });
    return;
  }

  thucHienTimLyTrinh(txt, targetMeters, checkedDoan[0]);
}

function thucHienTimLyTrinh(txt, targetMeters, doanVal) {
  var pts = getPointsCuaTuyenHienTaiChoDoan(doanVal);
  if (pts.length < 2) {
    showToast("Đoạn cáp chưa đủ dữ liệu điểm để tìm lý trình!", "error");
    return;
  }

  var isNghichHuong = (pts.length >= 2 && pts[1].calculatedLyTrinhMeters < pts[0].calculatedLyTrinhMeters);
  var sortedPts = [...pts].sort((a, b) => isNghichHuong ? b.calculatedLyTrinhMeters - a.calculatedLyTrinhMeters : a.calculatedLyTrinhMeters - b.calculatedLyTrinhMeters);

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
    var closest = sortedPts.reduce((prev, curr) => Math.abs(curr.calculatedLyTrinhMeters - targetMeters) < Math.abs(prev.calculatedLyTrinhMeters - targetMeters) ? curr : prev);
    var deviationMeters = Math.abs(closest.calculatedLyTrinhMeters - targetMeters);
    if (deviationMeters > 100) {
      showToast(`Không tìm thấy vị trí lý trình ${txt} chính xác (Sai số quá ${Math.round(deviationMeters)}m).`, "error");
      return;
    }
    foundLat = closest.lat;
    foundLng = closest.lng;
    bestDescription = `Gần điểm mốc: ${closest.ten} (Sai số ~${Math.round(deviationMeters)}m)`;
  }

  var backbone = getFullRouteBackboneForSegment(doanVal);
  var distToA = getDistanceAlongRoute({lat: foundLat, lng: foundLng}, backbone);
  var distStr = (distToA >= 1000) ? (distToA / 1000).toFixed(2) + " km" : Math.round(distToA) + " m";

  if (typeof foundMarkerLayer !== 'undefined' && foundMarkerLayer && map) map.removeLayer(foundMarkerLayer);
  map.setView([foundLat, foundLng], 19, { animate: true });
  
  var markerHtml = '<div style="background:#fd7e14; color:white; width:28px; height:28px; border-radius:50%; text-align:center; line-height:28px; border:2px solid #fff; box-shadow:0 0 10px #fd7e14; font-size:14px;">📍</div>';
  foundMarkerLayer = L.marker([foundLat, foundLng], { icon: L.divIcon({ html: markerHtml, className: '', iconSize: [28, 28], iconAnchor: [14, 14] }) }).addTo(map);
  
  var popupContent = `<b>🔍 KẾT QUẢ TÌM LÝ TRÌNH: ${txt}</b><br>` +
                     `- Vị trí: <b>${bestDescription}</b><br>` +
                     `- Cự ly cáp tới Trạm VT A: <b>${distStr}</b><br>`;
                     
  foundMarkerLayer.bindPopup(popupContent).openPopup();
  datLichTuXoaMarkerTimKiem();
  var panel = document.getElementById('control-panel');
  if (panel) panel.style.display = 'none';
}

function xoaTatCaDoiTuongMap() {
  if (typeof polylinesLayer !== 'undefined' && polylinesLayer) polylinesLayer.clearLayers();
  if (typeof markersLayer !== 'undefined' && markersLayer) markersLayer.clearLayers();
  if (typeof mxLayer !== 'undefined' && mxLayer) mxLayer.clearLayers();
  
  if (typeof foundMarkerLayer !== 'undefined' && foundMarkerLayer && map) {
    map.removeLayer(foundMarkerLayer);
    foundMarkerLayer = null;
  }

  if (autoClearMarkerTimer) {
    clearTimeout(autoClearMarkerTimer);
    autoClearMarkerTimer = null;
  }

  showToast("🧹 Đã xóa sạch tất cả đối tượng trên bản đồ!", "info");
}

function toggleGISPanel() {
  var panel = document.getElementById('control-panel');
  if (panel) {
    panel.classList.toggle('collapsed');
  }
}

function chonDoanCapPhanTich(callback) {
  var checkedDoan = typeof getCheckedDoanIds === 'function' ? getCheckedDoanIds() : [];
  if (checkedDoan.length === 0) { 
    showToast("Vui lòng tích chọn ít nhất 1 đoạn cáp!", "error"); 
    return; 
  }
  if (checkedDoan.length === 1) { 
    callback(checkedDoan[0]); 
    return; 
  }

  var doanCapList = (typeof AppStore !== 'undefined' && AppStore.getState().doanCapList) ? AppStore.getState().doanCapList : (window.rawDoanCapList || []);
  var matchedDoan = doanCapList.filter(d => checkedDoan.includes(String(d.id_doan_cap || d.id)));

  let overlay = document.getElementById('custom-segment-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'custom-segment-overlay';
    overlay.style.cssText = "display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(15, 23, 42, 0.7); z-index: 9999999; justify-content: center; align-items: center; backdrop-filter: blur(3px);";
    document.body.appendChild(overlay);
  }

  let optsHtml = matchedDoan.map(d => `<option value="${d.id_doan_cap || d.id}">${d.ten_doan_cap || d.ma_doancap || ('Đoạn ' + (d.id_doan_cap || d.id))}</option>`).join('');
  overlay.innerHTML = `
    <div class="confirm-box" style="width: 90%; max-width: 380px; text-align: left; background: #ffffff; padding: 20px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.3);">
      <div style="margin-bottom: 12px; font-size: 14px; font-weight: bold; color: #0d6efd;">🔀 Chọn Đoạn Cáp Phân Tích</div>
      <div style="font-size: 13px; color: #64748b; margin-bottom: 12px;">Bạn đang chọn nhiều đoạn cáp. Vui lòng chọn đoạn trục chính để tính toán:</div>
      <select id="modalSelectDoan" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; margin-bottom: 16px;">${optsHtml}</select>
      <div style="display: flex; gap: 8px;">
        <button id="btnCancelSeg" style="flex: 1; padding: 8px; border-radius: 6px; background: #64748b; color: white; border: none; font-weight: bold; cursor: pointer;">Hủy bỏ</button>
        <button id="btnConfirmSeg" style="flex: 1; padding: 8px; border-radius: 6px; background: #198754; color: white; border: none; font-weight: bold; cursor: pointer;">Xác nhận</button>
      </div>
    </div>`;
  overlay.style.display = 'flex';
  document.getElementById('btnCancelSeg').onclick = () => overlay.style.display = 'none';
  document.getElementById('btnConfirmSeg').onclick = () => { 
    overlay.style.display = 'none'; 
    callback(document.getElementById('modalSelectDoan').value); 
  };
}

async function xuLyChuanHoaThuTuDoanCap() {
  var checkedDoan = typeof getCheckedDoanIds === 'function' ? getCheckedDoanIds() : [];
  if (checkedDoan.length === 0) {
    showToast("Vui lòng tích chọn 1 đoạn cáp trên cây Checklist!", "warning");
    return;
  }
  if (checkedDoan.length > 1) {
    showToast("Vui lòng chỉ tích chọn MỘT đoạn cáp để thực hiện!", "warning");
    return;
  }

  let doanVal = checkedDoan[0];

  let keywordInput = await showPromptDialog("Nhập từ khóa tìm kiếm Măng Xông cần gán thêm (Bỏ trống nếu chỉ sắp xếp lại các điểm hiện có):", "");
  if (keywordInput === null) return;
  
  let keyword = keywordInput.trim();

  showLoading("Đang xử lý chuẩn hóa thứ tự đoạn cáp...");
  try {
    if (keyword) {
      let matchedPtsRaw = [];
      let offset = 0;
      let fetchMore = true;
      
      while (fetchMore) {
        const { data: chunk, error } = await supabaseClient
          .from('diem_ha_tang')
          .select('*')
          .ilike('ten_diem', `%${keyword}%`)
          .range(offset, offset + 999);

        if (error) throw error;
        
        if (chunk && chunk.length > 0) {
          matchedPtsRaw = matchedPtsRaw.concat(chunk);
          offset += 1000;
          if (chunk.length < 1000) fetchMore = false;
        } else {
          fetchMore = false;
        }
      }

      if (matchedPtsRaw.length > 0) {
        let assignedIds = [];
        let aOffset = 0;
        let aFetchMore = true;
        
        while (aFetchMore) {
          const { data: aChunk } = await supabaseClient
            .from('doan_cap_diem')
            .select('id_diem')
            .range(aOffset, aOffset + 999);

          if (aChunk && aChunk.length > 0) {
            assignedIds = assignedIds.concat(aChunk.map(l => Number(l.id_diem)));
            aOffset += 1000;
            if (aChunk.length < 1000) aFetchMore = false;
          } else {
            aFetchMore = false;
          }
        }

        let matchedPts = matchedPtsRaw.filter(p => !assignedIds.includes(Number(p.id_diem || p.id)));

        if (matchedPts.length > 0) {
          let newInserts = matchedPts.map(pt => ({
            id_doan_cap: Number(doanVal),
            id_diem: Number(pt.id_diem || pt.id),
            thu_tu: 999
          }));
          
          const { error: insErr } = await supabaseClient
            .from('doan_cap_diem')
            .insert(newInserts);
          if (insErr) throw insErr;
        }
      }
    }

    let segmentLinks = [];
    let segOffset = 0;
    let segFetchMore = true;
    
    while (segFetchMore) {
      const { data: chunk, error: errSegLink } = await supabaseClient
        .from('doan_cap_diem')
        .select('id_diem, thu_tu')
        .eq('id_doan_cap', Number(doanVal))
        .range(segOffset, segOffset + 999);

      if (errSegLink) throw errSegLink;
      
      if (chunk && chunk.length > 0) {
        segmentLinks = segmentLinks.concat(chunk);
        segOffset += 1000;
        if (chunk.length < 1000) segFetchMore = false;
      } else {
        segFetchMore = false;
      }
    }

    if (!segmentLinks || segmentLinks.length === 0) {
      throw new Error("Đoạn cáp này chưa có điểm nào được gán! Hãy nhập từ khóa để gán điểm.");
    }

    let existingThuTuMap = {};
    segmentLinks.forEach(l => {
      existingThuTuMap[Number(l.id_diem)] = Number(l.thu_tu);
    });

    let segmentPointIds = segmentLinks.map(l => Number(l.id_diem));

    let segmentPointObjects = [];
    const batchSize = 500;
    
    for (let i = 0; i < segmentPointIds.length; i += batchSize) {
      let batchIds = segmentPointIds.slice(i, i + batchSize);
      if (batchIds.length === 0) continue;

      const { data: batchData, error: errBatch } = await supabaseClient
        .from('diem_ha_tang')
        .select('*')
        .in('id_diem', batchIds);

      if (errBatch) throw errBatch;
      if (batchData) {
        segmentPointObjects = segmentPointObjects.concat(batchData);
      }
    }

    let validPoints = [];
    segmentPointObjects.forEach(pt => {
      let parsedLat = parseFloat(pt.lat || pt.latitude);
      let parsedLng = parseFloat(pt.lng || pt.longitude || pt.long);
      
      if (!isNaN(parsedLat) && !isNaN(parsedLng) && parsedLat !== 0 && parsedLng !== 0) {
        pt._lat = parsedLat;
        pt._lng = parsedLng;
        validPoints.push(pt);
      }
    });

    if (validPoints.length === 0) {
       throw new Error("Tất cả các điểm trong đoạn cáp đều bị lỗi hoặc không có tọa độ hợp lệ!");
    }

    let startIdx = 0;
    let minThuTu = Infinity;

    for (let i = 0; i < validPoints.length; i++) {
      let pId = Number(validPoints[i].id_diem || validPoints[i].id);
      let tVal = existingThuTuMap[pId] !== undefined ? existingThuTuMap[pId] : 9999;
      if (tVal < minThuTu) {
        minThuTu = tVal;
        startIdx = i;
      }
    }

    let sortedChain = [validPoints[startIdx]];
    let remaining = validPoints.filter((_, idx) => idx !== startIdx);

    while (remaining.length > 0) {
      let lastPt = sortedChain[sortedChain.length - 1];
      let nearestIdx = 0;
      let minNutDist = Infinity;

      for (let i = 0; i < remaining.length; i++) {
        let dist = calculateHaversine(lastPt._lat, lastPt._lng, remaining[i]._lat, remaining[i]._lng);
        
        if (dist < minNutDist) {
          minNutDist = dist;
          nearestIdx = i;
        }
      }
      sortedChain.push(remaining[nearestIdx]);
      remaining.splice(nearestIdx, 1);
    }

    const updateBatchSize = 100;
    let totalBatches = Math.ceil(sortedChain.length / updateBatchSize);

    for (let i = 0; i < sortedChain.length; i += updateBatchSize) {
      let currentBatchNumber = Math.floor(i / updateBatchSize) + 1;
      showLoading(`Đang lưu dữ liệu: Gói ${currentBatchNumber}/${totalBatches}...`);

      let chunkChain = sortedChain.slice(i, i + updateBatchSize);
      let updateBatch = chunkChain.map((pt, idx) => ({
        id_doan_cap: Number(doanVal),
        id_diem: Number(pt.id_diem || pt.id),
        thu_tu: i + idx + 1
      }));

      const { error: errUpdateOrder } = await supabaseClient
        .from('doan_cap_diem')
        .upsert(updateBatch, { onConflict: 'id_doan_cap,id_diem' });

      if (errUpdateOrder) throw new Error(`Lỗi khi lưu gói ${currentBatchNumber}: ` + errUpdateOrder.message);

      await new Promise(resolve => setTimeout(resolve, 150));
    }

    hideLoading();
    showToast(`✅ Chuẩn hóa thành công ${sortedChain.length} điểm liên tục từ điểm gốc!`, "success");

    if (window.segmentPointsCache && window.segmentPointsCache[doanVal]) {
      delete window.segmentPointsCache[doanVal];
    }
    if (window.cacheThuTuDoanCap) window.cacheThuTuDoanCap = {};

    if (typeof taiDiemDaTuyen === 'function') {
      await taiDiemDaTuyen(false);
    }

  } catch (err) {
    hideLoading();
    showToast("❌ Lỗi chuẩn hóa: " + err.message, "error");
    console.error(err);
  }
}

function xuLyPhanQuyenDoanTuyenUser() {
  var selectDai = document.getElementById('selectDai');
  var groupDai = selectDai ? selectDai.closest('.form-group') : null;
  var selectTram = document.getElementById('selectTram');
  var groupTram = selectTram ? selectTram.closest('.form-group') : null;

  var access = (typeof getRoleAccess === 'function') ? getRoleAccess() : { isSys: true };
  
  var filteredDai = (typeof getFilteredDaiList === 'function') ? getFilteredDaiList() : rawDaiList;
  var filteredTram = (typeof getFilteredTramList === 'function') ? getFilteredTramList() : rawTramList;

  if (selectDai) {
    selectDai.innerHTML = '<option value="ALL">-- Tất cả Đài --</option>';
    filteredDai.forEach(d => {
      selectDai.innerHTML += `<option value="${d.id_dai || d.id}">${d.ten_dai || d.ten}</option>`;
    });
  }

  if (selectTram) {
    selectTram.innerHTML = '<option value="ALL">-- Tất cả Trạm --</option>';
    filteredTram.forEach(t => {
      selectTram.innerHTML += `<option value="${t.id_tram || t.id}">${t.ten_tram || t.ten}</option>`;
    });
  }

  var selectedDaiVal = 'ALL';
  var selectedTramVal = 'ALL';

  if (access.isMember || access.isTram) {
    if (groupDai) groupDai.style.display = 'none';
    if (groupTram) groupTram.style.display = 'none';
    
    selectedDaiVal = access.idDai || 'ALL';
    selectedTramVal = access.idTram || 'ALL';
    
    if (selectDai) selectDai.value = selectedDaiVal;
    if (selectTram) selectTram.value = selectedTramVal;
    
  } else if (access.isDai) {
    if (groupDai) groupDai.style.display = 'block';
    if (groupTram) groupTram.style.display = 'block';
    
    selectedDaiVal = access.idDai || 'ALL';
    
    if (selectDai) { selectDai.value = selectedDaiVal; selectDai.disabled = true; }
    if (selectTram) selectTram.disabled = false;
    
  } else {
    if (groupDai) { groupDai.style.display = 'block'; if (selectDai) selectDai.disabled = false; }
    if (groupTram) { groupTram.style.display = 'block'; if (selectTram) selectTram.disabled = false; }
  }

  AppStore.setState({ selectedDai: selectedDaiVal, selectedTram: selectedTramVal });

  if (selectedTramVal === 'ALL' && selectTram && selectTram.options.length > 1) {
    selectTram.selectedIndex = 1;
    selectedTramVal = selectTram.value;
    AppStore.setState({ selectedTram: selectedTramVal });
  }

  onTramChange();
}

function onDaiChange() {
  var selectDai = document.getElementById('selectDai');
  var daiVal = selectDai ? selectDai.value : 'ALL';
  var selectTram = document.getElementById('selectTram');

  AppStore.setState({ selectedDai: String(daiVal), selectedTram: 'ALL' });

  var filteredTram = (typeof getFilteredTramList === 'function') ? getFilteredTramList() : rawTramList;

  if (selectTram) {
    selectTram.innerHTML = '<option value="ALL">-- Tất cả Trạm --</option>';
    filteredTram.filter(t => daiVal === 'ALL' || getSafeStrId(t, ['id_dai', 'dai_id']) === String(daiVal))
                .forEach(t => {
                  var tId = getSafeStrId(t, ['id_tram', 'id']);
                  selectTram.innerHTML += `<option value="${tId}">${t.ten_tram || t.ten}</option>`;
                });
    selectTram.value = 'ALL';
  }

  onTramChange();
}

function toggleTuyenGroup(tuyenId, isChecked) {
  var container = document.getElementById('khayTreeChecklist');
  if(!container) return;
  var childCbs = container.querySelectorAll('.chk-doan-' + tuyenId);
  childCbs.forEach(cb => cb.checked = isChecked);
  taiDiemDaTuyen(); 
}

function checkDoanChild(tuyenId) {
  var container = document.getElementById('khayTreeChecklist');
  if(!container) return;
  var childCbs = container.querySelectorAll('.chk-doan-' + tuyenId);
  var parentCb = container.querySelector('#chkTuyen_' + tuyenId);
  if(!parentCb) return;

  var allChecked = Array.from(childCbs).every(cb => cb.checked);
  var someChecked = Array.from(childCbs).some(cb => cb.checked);
  
  parentCb.checked = allChecked;
  parentCb.indeterminate = !allChecked && someChecked; 
  
  taiDiemDaTuyen(); 
}

function getCheckedDoanIds() {
  var container = document.getElementById('khayTreeChecklist');
  if(!container) return [];
  var checkboxes = container.querySelectorAll('input.chk-doan:checked');
  return Array.from(checkboxes).map(cb => cb.value);
}

function updateTuyenOptions() { onTramChange(); }

function onTramChange() {
  var selectTram = document.getElementById('selectTram');
  var tramVal = selectTram ? String(selectTram.value).trim() : 'ALL';
  
  AppStore.setState({ selectedTram: tramVal, selectedDai: document.getElementById('selectDai') ? document.getElementById('selectDai').value : 'ALL' });

  var tuyenList = AppStore.getState().tuyenList || rawTuyenList || [];
  var doanCapList = AppStore.getState().doanCapList || rawDoanCapList || [];

  var filteredTuyen = [];
  if (tramVal === 'ALL') {
    filteredTuyen = tuyenList;
  } else {
    var matchedTuyenIds = doanCapList
      .filter(d => getSafeStrId(d, ['id_tram', 'tram_id', 'id_tram_vt', 'tram_ql']) === tramVal)
      .map(d => getSafeStrId(d, ['id_tuyen', 'tuyen_cap_id', 'id_tuyen_cap']));
    
    filteredTuyen = tuyenList.filter(t => {
      var tId = getSafeStrId(t, ['id_tuyen_cap', 'id_tuyen', 'id']);
      return matchedTuyenIds.includes(tId);
    });
  }

  var khayTree = document.getElementById('khayTreeChecklist');
  if (khayTree) {
    if (filteredTuyen.length === 0) {
      khayTree.innerHTML = '<div style="color: #94a3b8; font-style: italic; font-size: 11px;">Không có tuyến cáp nào thuộc trạm này</div>';
    } else {
      let html = '';
      filteredTuyen.forEach(t => {
        var tId = getSafeStrId(t, ['id_tuyen_cap', 'id_tuyen', 'id']);
        var tName = t.ten_tuyen || t.ten_tuyencap || t.ten || ("Tuyến " + tId);
        
        var doanCon = doanCapList.filter(d => {
          var dTuyenId = getSafeStrId(d, ['id_tuyen', 'tuyen_id', 'id_tuyen_cap']);
          var dTramId = getSafeStrId(d, ['id_tram', 'tram_id', 'id_tram_vt', 'tram_ql']);
          var isMatchTuyen = (dTuyenId === String(tId));
          var isMatchTram = (tramVal === 'ALL' || dTramId === tramVal);
          return isMatchTuyen && isMatchTram;
        });
        
        if(doanCon.length > 0) {
          html += `
          <div style="margin-bottom: 5px; border: 1px solid #e2e8f0; border-radius: 5px; padding: 4px 6px; background: #f8fafc;">
            <label style="font-weight:bold; color:#0d6efd; display: flex; align-items: center; cursor: pointer; font-size: 11px;">
              <input type="checkbox" id="chkTuyen_${tId}" style="margin-right: 6px; width:13px; height:13px;" onchange="toggleTuyenGroup('${tId}', this.checked)"> 
              [-] ${tName}
            </label>
            <div style="margin-left: 18px; margin-top: 4px; display: flex; flex-direction: column; gap: 3px;">`;
          
          doanCon.forEach(d => {
            var dId = d.id_doan_cap || d.id;
            var dName = d.ten_doan_cap || d.ma_doancap || ("Đoạn " + dId);
            html += `
              <label style="display: flex; align-items: center; cursor: pointer; color: #334155; font-size: 11px;">
                <input type="checkbox" value="${dId}" class="chk-doan chk-doan-${tId}" style="margin-right: 5px;" onchange="checkDoanChild('${tId}')"> 
                ${dName}
              </label>`;
          });
          html += `</div></div>`;
        }
      });
      khayTree.innerHTML = html || '<div style="color: #94a3b8; font-style: italic; font-size: 11px;">Không có tuyến/đoạn cáp nào thuộc trạm này</div>';
    }
  }
  
  if (!isSyncingMaster) {
    taiDiemDaTuyen();
  }
}
