// admin.js - Quản lý CRUD phân quyền danh mục Hệ thống và Render 5 Tab Quản trị

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

  // 1. TAB TÀI KHOẢN
  var queryAcc = supabaseClient.from('tai_khoan').select('*');
  if (userRole === 'dai_admin') queryAcc = queryAcc.eq('id_dai', myDaiId);
  else if (userRole === 'tram_admin') queryAcc = queryAcc.eq('id_tram', myTramId);

  queryAcc.then(({ data: accs }) => {
    var accHtml = '';
    (accs || []).forEach(a => {
      var daiObj = rawDaiList.find(d => String(d.id_dai || d.id).trim() == String(a.id_dai).trim());
      var tramObj = rawTramList.find(t => String(t.id_tram || t.id).trim() == String(a.id_tram).trim());
      
      var canEdit = (userRole === 'sys_admin') || (userRole === 'dai_admin' && String(a.id_dai) === myDaiId);
      var btnSua = canEdit ? `<button class="btn-small" onclick="moFormSuaTaiKhoan(${a.id},'${a.email}','${a.role}',${a.id_dai || 'null'},${a.id_tram || 'null'},${a.can_edit_map})">✏️ Sửa</button>` : `<span class="badge bg-secondary">Chỉ xem</span>`;

      accHtml += `<tr><td><b>${a.email}</b></td><td><span class="badge bg-info text-dark">${a.role}</span></td><td>${daiObj ? (daiObj.ten_dai || daiObj.ten) : '-'}</td><td>${tramObj ? (tramObj.ten_tram || tramObj.ten) : '-'}</td><td>${a.can_edit_map ? '✅' : '❌'}</td><td>${btnSua}</td></tr>`;
    });
    var tbodyAcc = document.getElementById('masterAccountTableBody');
    if (tbodyAcc) tbodyAcc.innerHTML = accHtml || '<tr><td colspan="6" class="text-center text-muted">Không có dữ liệu</td></tr>';
  });

  // 2. TAB ĐÀI VT
  var daiHtml = '';
  rawDaiList.forEach(d => {
    var dId = d.id_dai || d.id;
    var canEdit = (userRole === 'sys_admin') || (userRole === 'dai_admin' && String(dId) === myDaiId);
    var btnCmd = canEdit ? `<button class="btn-small" onclick="moFormSuaAux('dai_vt', '${dId}', '${d.ten_dai || d.ten}')">✏️ Sửa</button>` : `<span class="badge bg-secondary">Chỉ xem</span>`;
    daiHtml += `<tr><td>${dId}</td><td><b>${d.ten_dai || d.ten}</b></td><td>${btnCmd}</td></tr>`;
  });
  var tbodyDai = document.getElementById('masterDaiTableBody');
  if (tbodyDai) tbodyDai.innerHTML = daiHtml || '<tr><td colspan="3" class="text-center text-muted">Không có dữ liệu Đài VT</td></tr>';

  // 3. TAB TRẠM VT
  var tramFiltered = rawTramList;
  if (userRole === 'dai_admin') tramFiltered = rawTramList.filter(t => String(t.id_dai || t.dai_id).trim() === myDaiId);
  else if (userRole === 'tram_admin') tramFiltered = rawTramList.filter(t => String(t.id_tram || t.id).trim() === myTramId);

  var tramHtml = '';
  tramFiltered.forEach(t => {
    var tId = t.id_tram || t.id;
    var dObj = rawDaiList.find(d => String(d.id_dai || d.id).trim() == String(t.id_dai || t.dai_id).trim());
    var canEdit = (userRole === 'sys_admin') || (userRole === 'dai_admin' && String(t.id_dai) === myDaiId);
    var btnCmd = canEdit ? `<button class="btn-small" onclick="moFormSuaAux('tram_vt', '${tId}', '${t.ten_tram || t.ten}')">✏️ Sửa</button>` : `<span class="badge bg-secondary">Chỉ xem</span>`;

    tramHtml += `<tr><td>${tId}</td><td><b>${t.ten_tram || t.ten}</b></td><td>${dObj ? (dObj.ten_dai || dObj.ten) : '-'}</td><td>${btnCmd}</td></tr>`;
  });
  var tbodyTram = document.getElementById('masterTramTableBody');
  if (tbodyTram) tbodyTram.innerHTML = tramHtml || '<tr><td colspan="4" class="text-center text-muted">Không có dữ liệu Trạm VT</td></tr>';

  // 4. TAB TUYẾN CÁP
  var tuyenHtml = '';
  rawTuyenList.forEach(t => {
    var tId = t.id_tuyen_cap || t.id_tuyen || t.id;
    var btnCmd = (userRole === 'sys_admin' || userRole === 'dai_admin') ? `<button class="btn-small" onclick="moFormSuaAux('tuyen_cap', '${tId}', '${t.ten_tuyen || t.ten}')">✏️ Sửa</button>` : `<span class="badge bg-secondary">Chỉ xem</span>`;
    tuyenHtml += `<tr><td>${tId}</td><td><b>${t.ma_tuyencap || '-'}</b></td><td>${t.ten_tuyen || t.ten}</td><td>${btnCmd}</td></tr>`;
  });
  var tbodyTuyen = document.getElementById('masterTuyenTableBody');
  if (tbodyTuyen) tbodyTuyen.innerHTML = tuyenHtml || '<tr><td colspan="4" class="text-center text-muted">Không có dữ liệu Tuyến Cáp</td></tr>';

  // 5. TAB ĐOẠN TUYẾN
  var doanHtml = '';
  rawDoanCapList.forEach(d => {
    var dId = d.id_doan_cap || d.id;
    var tObj = rawTuyenList.find(t => String(t.id_tuyen_cap || t.id_tuyen || t.id).trim() == String(d.id_tuyen || d.id_tuyen_cap).trim());
    var btnCmd = (userRole === 'sys_admin' || userRole === 'dai_admin' || userRole === 'tram_admin') ? `<button class="btn-small" onclick="moFormSuaAux('doan_cap', '${dId}', '${d.ma_doancap || d.ten_doancap}')">✏️ Sửa</button>` : `<span class="badge bg-secondary">Chỉ xem</span>`;
    doanHtml += `<tr><td>${dId}</td><td><b>${d.ma_doancap || '-'}</b></td><td>${tObj ? (tObj.ten_tuyen || tObj.ma_tuyencap) : '-'}</td><td>${btnCmd}</td></tr>`;
  });
  var tbodyDoan = document.getElementById('masterDoanTableBody');
  if (tbodyDoan) tbodyDoan.innerHTML = doanHtml || '<tr><td colspan="4" class="text-center text-muted">Không có dữ liệu Đoạn Tuyến</td></tr>';
}

// BỔ SUNG CÁC HÀM MỞ FORM THÊM MỚI DANH MỤC
function moFormThemDai() { moFormSuaAux('dai_vt', '', ''); }
function moFormThemTram() { moFormSuaAux('tram_vt', '', ''); }
function moFormThemTuyen() { moFormSuaAux('tuyen_cap', '', ''); }
function moFormThemDoan() { moFormSuaAux('doan_cap', '', ''); }
function chuanBiFormThemThanhVien() {
  document.getElementById('editingAccountId').value = '';
  document.getElementById('newMemberEmail').value = '';
  document.getElementById('newMemberPass').value = '';
  document.getElementById('accountModalTitle').innerText = "👥 Thêm Tài Khoản Mới";
  openModal('addMemberModal');
}

function moFormSuaAux(tableType, recordId, currentName) {
  document.getElementById('auxTableType').value = tableType;
  document.getElementById('auxRecordId').value = recordId;
  document.getElementById('auxModalTitle').innerText = recordId ? "✏️ Cập Nhật Danh Mục" : "➕ Thêm Danh Mục Mới";
  document.getElementById('auxFormFields').innerHTML = `
    <div class="form-group">
      <label>Tên mục:</label>
      <input type="text" id="txtAuxName" class="form-control" value="${currentName}">
    </div>`;
  openModal('genericAuxModal');
}

async function saveAuxRecord() {
  var tableType = document.getElementById('auxTableType').value;
  var recordId = document.getElementById('auxRecordId').value;
  var newName = document.getElementById('txtAuxName').value.trim();

  if (!newName) { showToast("Vui lòng nhập tên!", "error"); return; }
  showLoading("Đang lưu thay đổi...");

  try {
    var primaryKey = (tableType === 'dai_vt') ? 'id_dai' : (tableType === 'tram_vt') ? 'id_tram' : (tableType === 'tuyen_cap') ? 'id_tuyen_cap' : 'id_doan_cap';
    var nameField = (tableType === 'dai_vt') ? 'ten_dai' : (tableType === 'tram_vt') ? 'ten_tram' : (tableType === 'tuyen_cap') ? 'ten_tuyen' : 'ten_doancap';

    var updatePayload = {}; updatePayload[nameField] = newName;
    
    if (recordId) {
      const { error } = await supabaseClient.from(tableType).update(updatePayload).eq(primaryKey, recordId);
      if (error) throw error;
    } else {
      const { error } = await supabaseClient.from(tableType).insert([updatePayload]);
      if (error) throw error;
    }

    showToast("✅ Lưu thành công!", "success");
    closeModals();
    taiDuLieuSupabase(true);
  } catch (err) {
    showToast("Lỗi: " + err.message, "error");
  } finally {
    hideLoading();
  }
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
