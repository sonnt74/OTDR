// ==========================================================================
// TỆP ADMIN.JS - QUẢN TRỊ 5 TAB, KÍCH HOẠT MỞ BẢNG & PHÂN QUYỀN RBAC
// ==========================================================================

// Biến toàn cục lưu trữ trạng thái Quản trị
var currentAdminTab = 'tab_dai'; // Mặc định hiển thị Tab Đài Viễn Thông
var currentAdminUser = null;     // Thông tin tài khoản đang đăng nhập

/**
 * 1. HÀM MỞ VÀ ĐÓNG BẢNG QUẢN TRỊ (MODAL CONTROLLER)
 */
async function moBangQuanTri() {
  var modal = document.getElementById('admin-modal');
  if (modal) {
    modal.style.display = 'flex'; // Hiển thị khung quản trị
    await khoiTaoAdminModule();  // Tự động nạp dữ liệu và phân quyền
  } else {
    alert("❌ Không tìm thấy phần tử #admin-modal trong tệp index.html!");
  }
}

function dongBangQuanTri() {
  var modal = document.getElementById('admin-modal');
  if (modal) {
    modal.style.display = 'none'; // Ẩn khung quản trị
  }
}

/**
 * 2. KHỞI TẠO MODULE QUẢN TRỊ
 */
async function khoiTaoAdminModule() {
  // Lấy thông tin tài khoản đang đăng nhập từ AppStore hoặc LocalStorage
  var state = AppStore.getState();
  currentAdminUser = state.currentUser || JSON.parse(localStorage.getItem('TNN_USER_INFO')) || {
    username: 'guest',
    role: 'nhan_vien',
    id_dai: null,
    id_tram: null
  };

  console.log("🛠️ Khởi tạo Admin Module | Người dùng:", currentAdminUser.username, " | Vai trò:", currentAdminUser.role);

  // Lắng nghe sự kiện click trên các nút Tab
  ganSuKienChuyenTab();

  // Nạp dữ liệu và hiển thị Tab hiện tại
  await hienThiAdminTab(currentAdminTab);
}

/**
 * 3. CHUYỂN ĐỔI TAB QUẢN TRỊ (KHÔNG LÀM TẢI LẠI TRANG)
 */
function ganSuKienChuyenTab() {
  var tabButtons = document.querySelectorAll('.admin-tab-btn');
  tabButtons.forEach(function(btn) {
    btn.removeEventListener('click', xuLySuKienTabClick);
    btn.addEventListener('click', xuLySuKienTabClick);
  });
}

function xuLySuKienTabClick(e) {
  e.preventDefault();
  var targetTab = this.getAttribute('data-tab');
  if (targetTab) {
    hienThiAdminTab(targetTab);
  }
}

async function hienThiAdminTab(tabName) {
  currentAdminTab = tabName;

  // Cập nhật trạng thái Active trên giao diện nút Tab
  var tabButtons = document.querySelectorAll('.admin-tab-btn');
  tabButtons.forEach(function(btn) {
    if (btn.getAttribute('data-tab') === tabName) {
      btn.classList.add('active');
      btn.style.background = '#fff';
      btn.style.fontWeight = 'bold';
    } else {
      btn.classList.remove('active');
      btn.style.background = '#e9ecef';
      btn.style.fontWeight = 'normal';
    }
  });

  // Tải lại nội dung bảng dữ liệu tương ứng
  await renderBangDuLieuAdmin(tabName);
}

/**
 * 4. KIỂM TRA QUYỀN THAO TÁC CỦA NGƯỜI DÙNG (RBAC 4 CẤP)
 */
function kiemTraQuyenThaoTac(hanhDong, idDaiTarget, idTramTarget) {
  if (!currentAdminUser) return false;

  var role = currentAdminUser.role;

  // Cấp 1: admin_sys có full quyền toàn hệ thống
  if (role === 'admin_sys') return true;

  // Cấp 4: nhan_vien không có quyền Thêm/Sửa/Xóa dữ liệu
  if (role === 'nhan_vien') {
    if (hanhDong !== 'XEM') {
      alert("⛔ Tài khoản Nhân viên chỉ có quyền xem dữ liệu, không thể thực hiện thao tác này!");
      return false;
    }
    return true;
  }

  // Cấp 2: admin_dai chỉ có quyền trong Đài quản lý
  if (role === 'admin_dai') {
    if (idDaiTarget && String(idDaiTarget) !== String(currentAdminUser.id_dai)) {
      alert("⛔ Bạn chỉ có quyền quản lý dữ liệu thuộc Đài của mình!");
      return false;
    }
    return true;
  }

  // Cấp 3: admin_tram chỉ có quyền trong Trạm quản lý
  if (role === 'admin_tram') {
    if (idTramTarget && String(idTramTarget) !== String(currentAdminUser.id_tram)) {
      alert("⛔ Bạn chỉ có quyền quản lý dữ liệu thuộc Trạm của mình!");
      return false;
    }
    return true;
  }

  return false;
}

/**
 * 5. RÀNG BUỘC PHÂN CẤP KHI XÓA DỮ LIỆU (CASCADING CHECK CHUẨN CSDL)
 */
async function kiemTraRangBuocXoa(tenBang, idItem) {
  var state = AppStore.getState();

  // A. Kiểm tra khi xóa ĐÀI VIỄN THÔNG (dai_vt)
  if (tenBang === 'dai_vt') {
    var rawTram = state.rawTramList || [];
    var countTram = rawTram.filter(t => String(t.id_dai) === String(idItem)).length;
    if (countTram > 0) {
      alert(`⚠️ KHÔNG THỂ XÓA: Đài này đang quản lý ${countTram} Trạm viễn thông. Vui lòng di chuyển hoặc xóa các Trạm trực thuộc trước!`);
      return false;
    }
  }

  // B. Kiểm tra khi xóa TRẠM VIỄN THÔNG (tram_vt) -> Kiểm tra Đoạn cáp do Trạm quản lý
  if (tenBang === 'tram_vt') {
    var rawDoan = state.rawDoanList || [];
    var countDoan = rawDoan.filter(d => String(d.id_tram) === String(idItem)).length;
    if (countDoan > 0) {
      alert(`⚠️ KHÔNG THỂ XÓA: Trạm này đang trực tiếp quản lý ${countDoan} Đoạn cáp. Vui lòng di chuyển hoặc xóa các Đoạn cáp trước!`);
      return false;
    }
  }

  // C. Kiểm tra khi xóa TUYẾN CÁP (tuyen_cap) -> Kiểm tra các Đoạn cáp thuộc Tuyến
  if (tenBang === 'tuyen_cap') {
    var rawDoan = state.rawDoanList || [];
    var countDoan = rawDoan.filter(d => String(d.id_tuyen) === String(idItem)).length;
    if (countDoan > 0) {
      alert(`⚠️ KHÔNG THỂ XÓA: Tuyến cáp này chứa ${countDoan} Đoạn cáp. Vui lòng xóa hoặc di chuyển các Đoạn cáp trước!`);
      return false;
    }
  }

  // D. Kiểm tra khi xóa ĐOẠN CÁP (doan_cap) -> Kiểm tra các Điểm hạ tầng trên đoạn
  if (tenBang === 'doan_cap') {
    var rawDiem = state.dataPoints || globalDataPoints || [];
    var countDiem = rawDiem.filter(p => String(p.id_doan || p.idDoan) === String(idItem)).length;
    if (countDiem > 0) {
      alert(`⚠️ KHÔNG THỂ XÓA: Đoạn cáp này chứa ${countDiem} điểm hạ tầng (Cột/Bể/Măng xông). Vui lòng dọn dẹp các điểm hạ tầng trước!`);
      return false;
    }
  }

  return true;
}

/**
 * 6. HÀM HIỂN THỊ BẢNG DỮ LIỆU ĐẦY ĐỦ CÁC CỘT VÀ THÔNG TIN LIÊN KẾT
 */
async function renderBangDuLieuAdmin(tabName) {
  var container = document.getElementById('admin-table-container');
  if (!container) return;

  var state = AppStore.getState();
  var html = '';

  var userRole = currentAdminUser.role;
  var userDai = currentAdminUser.id_dai;
  var userTram = currentAdminUser.id_tram;

  // Map dữ liệu để hiển thị tên liên kết thay vì chỉ hiện ID
  var listDaiMap = Object.fromEntries((state.rawDaiList || []).map(d => [d.id_dai, d.ten_dai]));
  var listTramMap = Object.fromEntries((state.rawTramList || []).map(t => [t.id_tram, t.ten_tram]));
  var listTuyenMap = Object.fromEntries((state.rawTuyenList || []).map(t => [t.id_tuyen, t.ten_tuyen]));

  // ------------------------------------------------------------------------
  // TAB 1: QUẢN LÝ ĐÀI VIỄN THÔNG
  // ------------------------------------------------------------------------
  if (tabName === 'tab_dai') {
    var listDai = state.rawDaiList || [];
    if (userRole === 'admin_dai') listDai = listDai.filter(d => String(d.id_dai) === String(userDai));

    html = `
      <div class="admin-table-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <h3 style="margin:0;">🏢 Danh sách Đài Viễn Thông (${listDai.length})</h3>
        ${(userRole === 'admin_sys') ? '<button class="btn btn-primary" onclick="moModalThemSua(\'dai\')">➕ Thêm Đài Mới</button>' : ''}
      </div>
      <div style="overflow-x:auto;">
        <table class="table-admin" style="width:100%; border-collapse:collapse; background:#fff;">
          <thead>
            <tr style="background:#f8f9fa; border-bottom:2px solid #dee2e6;">
              <th style="padding:10px; text-align:left;">ID</th>
              <th style="padding:10px; text-align:left;">Tên Đài Viễn Thông</th>
              <th style="padding:10px; text-align:left;">Mã Đài</th>
              <th style="padding:10px; text-align:left;">Ghi Chú</th>
              <th style="padding:10px; text-align:center;">Thao Tác</th>
            </tr>
          </thead>
          <tbody>
            ${listDai.map(item => `
              <tr style="border-bottom:1px solid #e9ecef;">
                <td style="padding:10px;">${item.id_dai}</td>
                <td style="padding:10px;"><b>${item.ten_dai}</b></td>
                <td style="padding:10px;">${item.ma_dai || 'N/A'}</td>
                <td style="padding:10px;">${item.ghi_chu || ''}</td>
                <td style="padding:10px; text-align:center;">
                  ${kiemTraQuyenThaoTac('SUA', item.id_dai) ? `<button class="btn-sm btn-warning" onclick="moModalThemSua('dai', ${item.id_dai})">✏️ Sửa</button>` : ''}
                  ${kiemTraQuyenThaoTac('XOA', item.id_dai) ? `<button class="btn-sm btn-danger" onclick="thucHienXoaItem('dai_vt', ${item.id_dai})">🗑️ Xóa</button>` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // ------------------------------------------------------------------------
  // TAB 2: QUẢN LÝ TRẠM VIỄN THÔNG (HIỂN THỊ ĐÀI MẸ LIÊN KẾT)
  // ------------------------------------------------------------------------
  else if (tabName === 'tab_tram') {
    var listTram = state.rawTramList || [];

    if (userRole === 'admin_dai') listTram = listTram.filter(t => String(t.id_dai) === String(userDai));
    if (userRole === 'admin_tram' || userRole === 'nhan_vien') listTram = listTram.filter(t => String(t.id_tram) === String(userTram));

    html = `
      <div class="admin-table-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <h3 style="margin:0;">🏠 Danh sách Trạm Viễn Thông (${listTram.length})</h3>
        ${(userRole === 'admin_sys' || userRole === 'admin_dai') ? '<button class="btn btn-primary" onclick="moModalThemSua(\'tram\')">➕ Thêm Trạm Mới</button>' : ''}
      </div>
      <div style="overflow-x:auto;">
        <table class="table-admin" style="width:100%; border-collapse:collapse; background:#fff;">
          <thead>
            <tr style="background:#f8f9fa; border-bottom:2px solid #dee2e6;">
              <th style="padding:10px; text-align:left;">ID</th>
              <th style="padding:10px; text-align:left;">Tên Trạm Viễn Thông</th>
              <th style="padding:10px; text-align:left;">Đài Quản Lý</th>
              <th style="padding:10px; text-align:left;">Tọa Độ GPS</th>
              <th style="padding:10px; text-align:center;">Thao Tác</th>
            </tr>
          </thead>
          <tbody>
            ${listTram.map(item => `
              <tr style="border-bottom:1px solid #e9ecef;">
                <td style="padding:10px;">${item.id_tram}</td>
                <td style="padding:10px;"><b>${item.ten_tram}</b></td>
                <td style="padding:10px;"><span style="background:#e2e3e5; padding:3px 8px; border-radius:4px;">🏢 ${listDaiMap[item.id_dai] || 'Không xác định'}</span></td>
                <td style="padding:10px;">${item.lat ? item.lat.toFixed(5) + ', ' + item.long.toFixed(5) : 'Chưa có'}</td>
                <td style="padding:10px; text-align:center;">
                  ${kiemTraQuyenThaoTac('SUA', item.id_dai, item.id_tram) ? `<button class="btn-sm btn-warning" onclick="moModalThemSua('tram', ${item.id_tram})">✏️ Sửa</button>` : ''}
                  ${kiemTraQuyenThaoTac('XOA', item.id_dai, item.id_tram) ? `<button class="btn-sm btn-danger" onclick="thucHienXoaItem('tram_vt', ${item.id_tram})">🗑️ Xóa</button>` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // ------------------------------------------------------------------------
  // TAB 3: QUẢN LÝ TUYẾN CÁP QUANG
  // ------------------------------------------------------------------------
  else if (tabName === 'tab_tuyen') {
    var listTuyen = state.rawTuyenList || [];

    html = `
      <div class="admin-table-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <h3 style="margin:0;">🔌 Danh sách Tuyến Cáp Quang (${listTuyen.length})</h3>
        ${(userRole === 'admin_sys' || userRole === 'admin_dai') ? '<button class="btn btn-primary" onclick="moModalThemSua(\'tuyen\')">➕ Thêm Tuyến Cáp</button>' : ''}
      </div>
      <div style="overflow-x:auto;">
        <table class="table-admin" style="width:100%; border-collapse:collapse; background:#fff;">
          <thead>
            <tr style="background:#f8f9fa; border-bottom:2px solid #dee2e6;">
              <th style="padding:10px; text-align:left;">ID</th>
              <th style="padding:10px; text-align:left;">Tên Tuyến Cáp</th>
              <th style="padding:10px; text-align:left;">Chiều Dài Tổng (m)</th>
              <th style="padding:10px; text-align:left;">Ghi Chú</th>
              <th style="padding:10px; text-align:center;">Thao Tác</th>
            </tr>
          </thead>
          <tbody>
            ${listTuyen.map(item => `
              <tr style="border-bottom:1px solid #e9ecef;">
                <td style="padding:10px;">${item.id_tuyen}</td>
                <td style="padding:10px;"><b>${item.ten_tuyen}</b></td>
                <td style="padding:10px;">${item.chieu_dai || 0} m</td>
                <td style="padding:10px;">${item.ghi_chu || ''}</td>
                <td style="padding:10px; text-align:center;">
                  ${kiemTraQuyenThaoTac('SUA') ? `<button class="btn-sm btn-warning" onclick="moModalThemSua('tuyen', ${item.id_tuyen})">✏️ Sửa</button>` : ''}
                  ${kiemTraQuyenThaoTac('XOA') ? `<button class="btn-sm btn-danger" onclick="thucHienXoaItem('tuyen_cap', ${item.id_tuyen})">🗑️ Xóa</button>` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // ------------------------------------------------------------------------
  // TAB 4: QUẢN LÝ ĐOẠN CÁP (HIỂN THỊ CẢ TUYẾN CÁP VÀ TRẠM QUẢN LÝ)
  // ------------------------------------------------------------------------
  else if (tabName === 'tab_doan') {
    var listDoan = state.rawDoanList || [];

    // Lọc đoạn cáp theo phân quyền Trạm
    if (userRole === 'admin_tram' || userRole === 'nhan_vien') {
      listDoan = listDoan.filter(d => String(d.id_tram) === String(userTram));
    }

    html = `
      <div class="admin-table-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <h3 style="margin:0;">✂️ Danh sách Đoạn Cáp Quang (${listDoan.length})</h3>
        ${(userRole !== 'nhan_vien') ? '<button class="btn btn-primary" onclick="moModalThemSua(\'doan\')">➕ Thêm Đoạn Cáp</button>' : ''}
      </div>
      <div style="overflow-x:auto;">
        <table class="table-admin" style="width:100%; border-collapse:collapse; background:#fff;">
          <thead>
            <tr style="background:#f8f9fa; border-bottom:2px solid #dee2e6;">
              <th style="padding:10px; text-align:left;">ID</th>
              <th style="padding:10px; text-align:left;">Tên Đoạn Cáp</th>
              <th style="padding:10px; text-align:left;">Thuộc Tuyến Cáp</th>
              <th style="padding:10px; text-align:left;">Trạm Phụ Trách</th>
              <th style="padding:10px; text-align:left;">Chiều Dài (m)</th>
              <th style="padding:10px; text-align:center;">Thao Tác</th>
            </tr>
          </thead>
          <tbody>
            ${listDoan.map(item => `
              <tr style="border-bottom:1px solid #e9ecef;">
                <td style="padding:10px;">${item.id_doan}</td>
                <td style="padding:10px;"><b>${item.ten_doan}</b></td>
                <td style="padding:10px;"><span style="background:#e8f4f8; padding:3px 8px; border-radius:4px;">🔌 ${listTuyenMap[item.id_tuyen] || 'Chưa gán'}</span></td>
                <td style="padding:10px;"><span style="background:#e2e3e5; padding:3px 8px; border-radius:4px;">🏠 ${listTramMap[item.id_tram] || 'Chưa gán'}</span></td>
                <td style="padding:10px;">${item.chieu_dai || 0} m</td>
                <td style="padding:10px; text-align:center;">
                  ${kiemTraQuyenThaoTac('SUA', null, item.id_tram) ? `<button class="btn-sm btn-warning" onclick="moModalThemSua('doan', ${item.id_doan})">✏️ Sửa</button>` : ''}
                  ${kiemTraQuyenThaoTac('XOA', null, item.id_tram) ? `<button class="btn-sm btn-danger" onclick="thucHienXoaItem('doan_cap', ${item.id_doan})">🗑️ Xóa</button>` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // ------------------------------------------------------------------------
  // TAB 5: QUẢN LÝ TÀI KHOẢN & PHÂN QUYỀN
  // ------------------------------------------------------------------------
  else if (tabName === 'tab_user') {
    var listUser = state.rawUserList || [];

    if (userRole === 'admin_dai') listUser = listUser.filter(u => String(u.id_dai) === String(userDai));
    if (userRole === 'admin_tram') listUser = listUser.filter(u => String(u.id_tram) === String(userTram));

    html = `
      <div class="admin-table-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <h3 style="margin:0;">👥 Danh sách Tài Khoản (${listUser.length})</h3>
        ${(userRole === 'admin_sys' || userRole === 'admin_dai' || userRole === 'admin_tram') ? '<button class="btn btn-primary" onclick="moModalThemSua(\'user\')">➕ Tạo Tài Khoản</button>' : ''}
      </div>
      <div style="overflow-x:auto;">
        <table class="table-admin" style="width:100%; border-collapse:collapse; background:#fff;">
          <thead>
            <tr style="background:#f8f9fa; border-bottom:2px solid #dee2e6;">
              <th style="padding:10px; text-align:left;">Tên Đăng Nhập</th>
              <th style="padding:10px; text-align:left;">Họ Và Tên</th>
              <th style="padding:10px; text-align:left;">Vai Trò</th>
              <th style="padding:10px; text-align:left;">Đài Quản Lý</th>
              <th style="padding:10px; text-align:left;">Trạm Quản Lý</th>
              <th style="padding:10px; text-align:center;">Thao Tác</th>
            </tr>
          </thead>
          <tbody>
            ${listUser.map(u => `
              <tr style="border-bottom:1px solid #e9ecef;">
                <td style="padding:10px;"><b>${u.username}</b></td>
                <td style="padding:10px;">${u.full_name || u.username}</td>
                <td style="padding:10px;"><span style="background:#0d6efd; color:#fff; padding:3px 8px; border-radius:4px;">${u.role}</span></td>
                <td style="padding:10px;">${listDaiMap[u.id_dai] || 'Toàn quyền'}</td>
                <td style="padding:10px;">${listTramMap[u.id_tram] || 'Toàn quyền'}</td>
                <td style="padding:10px; text-align:center;">
                  ${(userRole === 'admin_sys' || (userRole === 'admin_dai' && u.role !== 'admin_sys') || (userRole === 'admin_tram' && u.role === 'nhan_vien')) ? `
                    <button class="btn-sm btn-warning" onclick="moModalThemSua('user', '${u.username}')">✏️ Phân quyền</button>
                    <button class="btn-sm btn-danger" onclick="thucHienXoaItem('users', '${u.username}')">🗑️ Xóa</button>
                  ` : '<span style="color:#999;">Không có quyền</span>'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  container.innerHTML = html;
}

/**
 * 7. XỬ LÝ XÓA DỮ LIỆU AN TOÀN
 */
async function thucHienXoaItem(tenBang, idItem) {
  // Kiểm tra ràng buộc dữ liệu con trước khi xóa
  var coTheXoa = await kiemTraRangBuocXoa(tenBang, idItem);
  if (!coTheXoa) return;

  if (!confirm("❓ Bạn có chắc chắn muốn xóa bản ghi này?")) return;

  try {
    if (navigator.onLine) {
      var keyField = (tenBang === 'users') ? 'username' : 'id_' + tenBang.replace('_vt', '').replace('_cap', '');
      var { error } = await supabaseClient.from(tenBang).delete().eq(keyField, idItem);
      if (error) throw error;
      alert("✅ Đã xóa dữ liệu thành công trên máy chủ!");
    } else {
      // Lưu vào hàng đợi lưu trữ ngoại tuyến IndexedDB
      await idbThemHangDoiSync({
        actionType: 'XOA_DU_LIEU',
        payload: { tenBang: tenBang, idItem: idItem }
      });
      alert("🔄 Đã lưu yêu cầu xóa vào Hàng đợi đồng bộ Offline!");
    }

    // Tải lại dữ liệu và giữ nguyên Tab hiện tại
    if (typeof taiDuLieuSupabase === 'function') {
      await taiDuLieuSupabase(true);
    }
    await hienThiAdminTab(currentAdminTab);

  } catch (err) {
    console.error("Lỗi khi thực hiện xóa:", err);
    alert("❌ Lỗi khi xóa: " + err.message);
  }
}
