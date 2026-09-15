// admin.js - Quản lý CRUD đối tượng hạ tầng và bảng điều khiển Quản trị
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

function loadAdminMasterData() {
  if (currentUser.role !== 'sys_admin' && currentUser.role !== 'dai_admin') return;
  var query = supabaseClient.from('tai_khoan').select('*');
  if (currentUser.role === 'dai_admin') query = query.eq('id_dai', currentUser.idDai);
  
  query.then(({ data: accs }) => {
    var accHtml = '';
    (accs || []).forEach(a => {
      var daiObj = rawDaiList.find(d => d.id_dai == a.id_dai);
      var tramObj = rawTramList.find(t => t.id_tram == a.id_tram);
      accHtml += `<tr><td><b>${a.email}</b></td><td>${a.role}</td><td>${daiObj ? daiObj.ten_dai : '-'}</td><td>${tramObj ? tramObj.ten_tram : '-'}</td><td>${a.can_edit_map ? '✅' : '❌'}</td><td><button class="btn-small" onclick="moFormSuaTaiKhoan(${a.id},'${a.email}','${a.role}',${a.id_dai || 'null'},${a.id_tram || 'null'},${a.can_edit_map})">✏️</button></td></tr>`;
    });
    document.getElementById('masterAccountTableBody').innerHTML = accHtml;
  });
}

function populateDropdown(selId, list, idProp, nameProp, selectedVal) {
  var sel = document.getElementById(selId);
  sel.innerHTML = '<option value="">-- Chọn --</option>';
  list.forEach(item => sel.innerHTML += `<option value="${item[idProp]}" ${item[idProp] == selectedVal ? 'selected' : ''}>${item[nameProp]}</option>`);
}

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
