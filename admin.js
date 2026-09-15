// admin.js - Quản lý CRUD đối tượng hạ tầng và Bảng điều khiển Quản trị theo Phân quyền

function switchAdminTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
  
  var activeBtn = document.querySelector(`.tab-btn[onclick*="${tabId}"]`);
  if (activeBtn) activeBtn.classList.add('active');
  
  var activePane = document.getElementById(tabId);
  if (activePane) activePane.classList.add('active');

  loadAdminMasterData();
}

function loadAdminMasterData() {
  var userRole = (typeof currentUser !== 'undefined' && currentUser.role) ? currentUser.role : 'member';
  var myDaiId = currentUser ? String(currentUser.idDai || currentUser.id_dai).trim() : '';
  var myTramId = currentUser ? String(currentUser.idTram || currentUser.id_tram).trim() : '';

  // 1. TẢI VÀ PHÂN QUYỀN BẢNG TÀI KHOẢN (USERS)
  var queryAcc = supabaseClient.from('tai_khoan').select('*');
  if (userRole === 'dai_admin') queryAcc = queryAcc.eq('id_dai', myDaiId);
  else if (userRole === 'tram_admin') queryAcc = queryAcc.eq('id_tram', myTramId);

  queryAcc.then(({ data: accs }) => {
    var accHtml = '';
    (accs || []).forEach(a => {
      var daiObj = rawDaiList.find(d => String(d.id_dai || d.id).trim() == String(a.id_dai).trim());
      var tramObj = rawTramList.find(t => String(t.id_tram || t.id).trim() == String(a.id_tram).trim());
      
      var canEdit = (userRole === 'sys_admin') || (userRole === 'dai_admin' && String(a.id_dai) === myDaiId) || (userRole === 'tram_admin' && String(a.id_tram) === myTramId);
      var btnSua = canEdit ? `<button class="btn-small" onclick="moFormSuaTaiKhoan(${a.id},'${a.email}','${a.role}',${a.id_dai || 'null'},${a.id_tram || 'null'},${a.can_edit_map})">✏️</button>` : `<span class="badge bg-secondary">Chỉ xem</span>`;

      accHtml += `<tr><td><b>${a.email}</b></td><td>${a.role}</td><td>${daiObj ? (daiObj.ten_dai || daiObj.ten) : '-'}</td><td>${tramObj ? (tramObj.ten_tram || tramObj.ten) : '-'}</td><td>${a.can_edit_map ? '✅' : '❌'}</td><td>${btnSua}</td></tr>`;
    });
    var tbodyAcc = document.getElementById('masterAccountTableBody');
    if (tbodyAcc) tbodyAcc.innerHTML = accHtml || '<tr><td colspan="6" class="text-center text-muted">Không có dữ liệu</td></tr>';
  });

  // 2. TẢI VÀ PHÂN QUYỀN BẢNG TRẠM VT
  var tramFiltered = rawTramList;
  if (userRole === 'dai_admin') tramFiltered = rawTramList.filter(t => String(t.id_dai || t.dai_id).trim() === myDaiId);
  else if (userRole === 'tram_admin') tramFiltered = rawTramList.filter(t => String(t.id_tram || t.id).trim() === myTramId);

  var tramHtml = '';
  tramFiltered.forEach(t => {
    var dObj = rawDaiList.find(d => String(d.id_dai || d.id).trim() == String(t.id_dai || t.dai_id).trim());
    var canEdit = (userRole === 'sys_admin') || (userRole === 'dai_admin' && String(t.id_dai) === myDaiId) || (userRole === 'tram_admin' && String(t.id_tram) === myTramId);
    var btnSua = canEdit ? `<button class="btn-small" onclick="moFormSuaTramMaster('${t.id_tram || t.id}')">✏️ Sửa</button>` : `<span class="badge bg-secondary">Chỉ xem</span>`;

    tramHtml += `<tr><td>${t.id_tram || t.id}</td><td><b>${t.ma_tram || ''}</b></td><td>${t.ten_tram || t.ten}</td><td>${dObj ? (dObj.ten_dai || dObj.ten) : '-'}</td><td>${btnSua}</td></tr>`;
  });
  var tbodyTram = document.getElementById('masterTramTableBody');
  if (tbodyTram) tbodyTram.innerHTML = tramHtml || '<tr><td colspan="5" class="text-center text-muted">Không có dữ liệu Trạm VT</td></tr>';
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
      payload.lat = targetLat; payload.long = targetLng;
      var tuyenH = document.getElementById('selectTuyen').value;
      if (tuyenH !== 'ALL') payload.id_tuyen_cap = parseInt(tuyenH);
      
      const { data, error } = await supabaseClient.from('diem_ha_tang').insert([payload]).select();
      if (error) throw error;
      
      if (data && data[0]) {
        var newRec = data[0];
        globalDataPoints.push({
          id: newRec.id_diem || newRec.id, ten: newRec.ten_diem, lat: newRec.lat, lng: newRec.long,
          lyTrinh: newRec.ly_trinh || '', idTuyen: tuyenH, idLoaiDiem: loaiMoi, loai: 'Điểm mới'
        });
        await ghiNhatKyThaoTac("THEM_DIEM", `Thêm mới điểm hạ tầng: [${tenMoi}]`);
      }
    } else if (act === 'EDIT') { 
      const { error } = await supabaseClient.from('diem_ha_tang').update(payload).eq('id_diem', id);
      if (error) throw error;
      var localPt = globalDataPoints.find(p => p.id == id);
      if (localPt) { localPt.ten = tenMoi; localPt.idLoaiDiem = loaiMoi; localPt.lyTrinh = ltMoi; targetLat = localPt.lat; targetLng = localPt.lng; 
                   await ghiNhatKyThaoTac("SUA_DIEM", `Cập nhật thông tin điểm: [${tenMoi}]`);}
    } else if (act === 'DELETE') { 
      var delPt = globalDataPoints.find(p => p.id == id);
      if (delPt) { targetLat = delPt.lat; targetLng = delPt.lng; }
      const { error } = await supabaseClient.from('diem_ha_tang').delete().eq('id_diem', id);
      var tenDiemXoa = delPt ? delPt.ten : id;
      await ghiNhatKyThaoTac("XOA_DIEM", `Xóa điểm hạ tầng: [${tenDiemXoa}]`);
      if (error) throw error;
      globalDataPoints = globalDataPoints.filter(p => p.id != id);
    }
    
    closeModals();
    hideLoading();
    showToast("Thực hiện lưu dữ liệu thành công!", "success");
    veLaiTuyenAB();
    if (targetLat && targetLng && act !== 'DELETE') {
      map.setView([targetLat, targetLng], 19, { animate: true });
    }
  } catch (err) { 
    showToast("Lỗi: " + err.message, "error"); 
    hideLoading(); 
  }
}

function populateDropdown(selId, list, idProp, nameProp, selectedVal) {
  var sel = document.getElementById(selId);
  if (!sel) return;
  sel.innerHTML = '<option value="">-- Chọn --</option>';
  list.forEach(item => sel.innerHTML += `<option value="${item[idProp]}" ${item[idProp] == selectedVal ? 'selected' : ''}>${item[nameProp]}</option>`);
}

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
