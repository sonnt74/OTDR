// ==========================================================================
// TỆP IDB-HELPER.JS - MODULE QUẢN LÝ INDEXEDDB OFFLINE CHO GIS & OTDR
// ==========================================================================

const DB_NAME = 'TNN_GIS_DB';
const DB_VERSION = 2;

/**
 * 1. KHỞI TẠO VÀ MỞ KẾT NỐI INDEXEDDB
 */
function openGISDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Kho 1: Danh mục Master (Đài, Trạm, Tuyến, Đoạn, Loại điểm)
      if (!db.objectStoreNames.contains('master_store')) {
        db.createObjectStore('master_store');
      }

      // Kho 2: Điểm hạ tầng (Có đánh chỉ mục ID để tìm kiếm tốc độ cao)
      if (!db.objectStoreNames.contains('diem_store')) {
        const diemStore = db.createObjectStore('diem_store', { keyPath: 'id' });
        diemStore.createIndex('idTuyen', 'idTuyen', { unique: false });
        diemStore.createIndex('idTram', 'idTram', { unique: false });
        diemStore.createIndex('idDoanCap', 'idDoanCap', { unique: false });
      }

      // Kho 3: Lưu phiên đăng nhập & Tài khoản phục vụ Offline Mode
      if (!db.objectStoreNames.contains('auth_store')) {
        db.createObjectStore('auth_store', { keyPath: 'account' });
      }

      // Kho 4: Hàng đợi lưu thay đổi khi mất mạng (Auto sync khi Online)
      if (!db.objectStoreNames.contains('sync_queue_store')) {
        db.createObjectStore('sync_queue_store', { keyPath: 'id', autoIncrement: true });
      }

      // Kho 5: Lưu mối quan hệ Đoạn cáp - Điểm hạ tầng (Mô phỏng bảng doan_cap_diem của Supabase)
      if (!db.objectStoreNames.contains('doan_cap_diem_store')) {
        const linkStore = db.createObjectStore('doan_cap_diem_store', { keyPath: ['idDoanCap', 'idDiem'] });
        linkStore.createIndex('idDoanCap', 'idDoanCap', { unique: false });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject("Lỗi mở IndexedDB: " + event.target.error);
  });
}

/**
 * 2. CÁC HÀM XỬ LÝ DANH MỤC MASTER (MASTER_STORE)
 */
async function idbLuuMaster(masterObj) {
  const db = await openGISDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('master_store', 'readwrite');
    const store = transaction.objectStore('master_store');
    
    // Xóa sạch danh mục cũ để tránh tồn đọng dữ liệu rác khi làm mới
    store.clear();
    store.put(masterObj, 'categories');

    transaction.oncomplete = () => resolve(true);
    transaction.onerror = (event) => reject("Lỗi lưu Master vào IndexedDB: " + event.target.error);
  });
}

async function idbDocMaster() {
  const db = await openGISDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('master_store', 'readonly');
    const req = tx.objectStore('master_store').get('categories');
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = (e) => reject(e);
  });
}

/**
 * 3. CÁC HÀM XỬ LÝ ĐIỂM HẠ TẦNG (DIEM_STORE) - ĐÃ TỐI ƯU XÓA RÁC CŨ
 */
/**
 * 3. CÁC HÀM XỬ LÝ ĐIỂM HẠ TẦNG (DIEM_STORE) - ĐỒNG BỘ THÔNG MINH, KHÔNG GÂY RÁC
 */
async function idbLuuDanhSachDiemTheoDoan(idDoanCap, pointsArray) {
  if (!idDoanCap) return;
  const db = await openGISDatabase();
  const targetDoanStr = String(idDoanCap);
  
  // Lấy danh sách ID mới từ Supabase của đoạn này để đối chiếu
  const newIds = new Set((pointsArray || []).map(pt => String(pt.id)));

  return new Promise((resolve, reject) => {
    const tx = db.transaction('diem_store', 'readwrite');
    const store = tx.objectStore('diem_store');
    const index = store.index('idDoanCap');
    const req = index.getAll(targetDoanStr);

    req.onsuccess = () => {
      const existingLocalPts = req.result || [];
      
      // Bước 1: Xóa các điểm cũ thuộc đoạn này nhưng KHÔNG CÒN tồn tại trên Supabase (dọn rác triệt để)
      existingLocalPts.forEach(localPt => {
        if (!newIds.has(String(localPt.id))) {
          store.delete(localPt.id);
        }
      });

      // Bước 2: Thêm mới hoặc cập nhật các điểm hiện tại bằng .put()
      if (Array.isArray(pointsArray)) {
        pointsArray.forEach(pt => {
          if (pt && pt.id && String(pt.id) !== 'undefined') {
            store.put({
              ...pt,
              id: String(pt.id),
              idTuyen: pt.idTuyen ? String(pt.idTuyen) : 'ALL',
              idTram: pt.idTram ? String(pt.idTram) : 'ALL',
              idDoanCap: targetDoanStr
            });
          }
        });
      }
    };

    tx.oncomplete = () => resolve(true);
    tx.onerror = (e) => reject("Lỗi đồng bộ thông minh điểm đoạn cáp: " + e.target.error);
  });
}

// Giữ lại hàm cũ để tương thích ngược nếu các phần khác gọi đến
async function idbLuuDanhSachDiem(pointsArray) {
  if (!Array.isArray(pointsArray) || pointsArray.length === 0) return;
  // Nếu truyền mảng chung, gom nhóm theo đoạn cáp để gọi hàm thông minh ở trên
  let grouped = {};
  pointsArray.forEach(pt => {
    let dId = pt.idDoanCap ? String(pt.idDoanCap) : 'ALL';
    if (!grouped[dId]) grouped[dId] = [];
    grouped[dId].push(pt);
  });

  for (let dId in grouped) {
    await idbLuuDanhSachDiemTheoDoan(dId, grouped[dId]);
  }
  return true;
}

async function idbDocDiemTheoTuyen(idTuyen) {
  const db = await openGISDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('diem_store', 'readonly');
    const index = tx.objectStore('diem_store').index('idTuyen');
    const req = index.getAll(String(idTuyen));
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e);
  });
}

async function idbDocDiemTheoVungXem(minLat, maxLat, minLng, maxLng) {
  const db = await openGISDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('diem_store', 'readonly');
    const req = tx.objectStore('diem_store').getAll();

    req.onsuccess = () => {
      const allPts = req.result || [];
      const filtered = allPts.filter(p => 
        p.lat >= minLat && p.lat <= maxLat && 
        p.lng >= minLng && p.lng <= maxLng
      );
      resolve(filtered);
    };
    req.onerror = (e) => reject(e);
  });
}

/**
 * 4. CÁC HÀM XỬ LÝ TÀI KHOẢN (AUTH_STORE)
 */
async function idbLuuTaiKhoan(accObj) {
  if (!accObj || !accObj.email) return;
  const db = await openGISDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('auth_store', 'readwrite');
    tx.objectStore('auth_store').put(accObj);
    tx.oncomplete = () => resolve(true);
    tx.onerror = (e) => reject(e);
  });
}

async function idbDocTaiKhoan(email) {
  const db = await openGISDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('auth_store', 'readonly');
    const req = tx.objectStore('auth_store').get(email);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = (e) => reject(e);
  });
}

/**
 * 5. CÁC HÀM HÀNG ĐỔI ĐỒNG BỘ OFFLINE (SYNC_QUEUE_STORE)
 */
async function idbThemVaoHangDoiSync(actionType, payload) {
  const db = await openGISDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sync_queue_store', 'readwrite');
    tx.objectStore('sync_queue_store').add({
      actionType: actionType,
      payload: payload,
      timestamp: Date.now()
    });
    tx.oncomplete = () => resolve(true);
    tx.onerror = (e) => reject(e);
  });
}

async function idbLayHangDoiSync() {
  const db = await openGISDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sync_queue_store', 'readonly');
    const req = tx.objectStore('sync_queue_store').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e);
  });
}

async function idbXoaHangDoiSync(id) {
  const db = await openGISDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sync_queue_store', 'readwrite');
    tx.objectStore('sync_queue_store').delete(id);
    tx.oncomplete = () => resolve(true);
    tx.onerror = (e) => reject(e);
  });
}
/**
 * 6. CÁC HÀM QUẢN LÝ QUAN HỆ ĐOẠN CÁP - ĐIỂM (DOAN_CAP_DIEM_STORE)
 */
async function idbLuuDoanCapDiem(linksArray) {
  if (!Array.isArray(linksArray) || linksArray.length === 0) return;
  const db = await openGISDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('doan_cap_diem_store', 'readwrite');
    const store = tx.objectStore('doan_cap_diem_store');
    
    linksArray.forEach(link => {
      if (link && link.idDoanCap && link.idDiem) {
        store.put({
          idDoanCap: String(link.idDoanCap),
          idDiem: String(link.idDiem),
          thu_tu: link.thu_tu !== undefined ? Number(link.thu_tu) : 999
        });
      }
    });

    tx.oncomplete = () => resolve(true);
    tx.onerror = (e) => reject("Lỗi lưu quan hệ đoạn cáp - điểm: " + e.target.error);
  });
}

async function idbDocDoanCapDiem(idDoanCap) {
  const db = await openGISDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('doan_cap_diem_store', 'readonly');
    const index = tx.objectStore('doan_cap_diem_store').index('idDoanCap');
    const req = index.getAll(String(idDoanCap));
    
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject("Lỗi đọc quan hệ đoạn cáp - điểm: " + e.target.error);
  });
}
