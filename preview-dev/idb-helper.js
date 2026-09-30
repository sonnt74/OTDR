// ==========================================================================
// TỆP IDB-HELPER.JS - MODULE QUẢN LÝ INDEXEDDB OFFLINE CHO GIS & OTDR
// ==========================================================================

const DB_NAME = 'TNN_GIS_DB';
const DB_VERSION = 1;

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
    const tx = db.transaction('master_store', 'readwrite');
    tx.objectStore('master_store').put(masterObj, 'categories');
    tx.oncomplete = () => resolve(true);
    tx.onerror = (e) => reject(e);
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
 * 3. CÁC HÀM XỬ LÝ ĐIỂM HẠ TẦNG (DIEM_STORE)
 */
async function idbLuuDanhSachDiem(pointsArray) {
  if (!Array.isArray(pointsArray) || pointsArray.length === 0) return;
  const db = await openGISDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('diem_store', 'readwrite');
    const store = tx.objectStore('diem_store');
    
    // Đảm bảo ID không bị rỗng hoặc undefined
    pointsArray.forEach(pt => {
      if (pt && pt.id && String(pt.id) !== 'undefined') {
        store.put({
          ...pt,
          id: String(pt.id),
          idTuyen: pt.idTuyen ? String(pt.idTuyen) : 'ALL',
          idTram: pt.idTram ? String(pt.idTram) : 'ALL',
          idDoanCap: pt.idDoanCap ? String(pt.idDoanCap) : 'ALL'
        });
      }
    });

    tx.oncomplete = () => resolve(true);
    tx.onerror = (e) => reject(e);
  });
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
