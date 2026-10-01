const DB_NAME = 'TNN_GIS_DB';
const DB_VERSION = 3; // Nâng version lên 3 để tối ưu cấu trúc quan hệ chuẩn

function openGISDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Kho 1: Danh mục Master
      if (!db.objectStoreNames.contains('master_store')) {
        db.createObjectStore('master_store');
      }

      // Kho 2: Kho chứa toàn bộ điểm hạ tầng duy nhất (KeyPath: id)
      if (!db.objectStoreNames.contains('diem_store')) {
        const diemStore = db.createObjectStore('diem_store', { keyPath: 'id' });
        diemStore.createIndex('idTuyen', 'idTuyen', { unique: false });
        diemStore.createIndex('idTram', 'idTram', { unique: false });
      }

      // Kho 3: Lưu phiên đăng nhập
      if (!db.objectStoreNames.contains('auth_store')) {
        db.createObjectStore('auth_store', { keyPath: 'account' });
      }

      // Kho 4: Hàng đợi đồng bộ offline
      if (!db.objectStoreNames.contains('sync_queue_store')) {
        db.createObjectStore('sync_queue_store', { keyPath: 'id', autoIncrement: true });
      }

      // Kho 5: Kho quan hệ Đoạn cáp - Điểm hạ tầng (Mô phỏng bảng doan_cap_diem)
      if (!db.objectStoreNames.contains('doan_cap_diem_store')) {
        const linkStore = db.createObjectStore('doan_cap_diem_store', { keyPath: ['idDoanCap', 'idDiem'] });
        linkStore.createIndex('idDoanCap', 'idDoanCap', { unique: false });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject("Lỗi mở IndexedDB: " + event.target.error);
  });
}

async function idbLuuMaster(masterObj) {
  const db = await openGISDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('master_store', 'readwrite');
    const store = tx.objectStore('master_store');
    store.clear();
    store.put(masterObj, 'categories');
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

// Lưu toàn bộ danh sách điểm hạ tầng một cách an toàn (Upsert hàng loạt)
async function idbLuuTatCaDiem(pointsArray) {
  if (!Array.isArray(pointsArray) || pointsArray.length === 0) return;
  const db = await openGISDatabase();
  const batchSize = 500;

  for (let i = 0; i < pointsArray.length; i += batchSize) {
    let chunk = pointsArray.slice(i, i + batchSize);
    await new Promise((resolve, reject) => {
      const tx = db.transaction('diem_store', 'readwrite');
      const store = tx.objectStore('diem_store');
      chunk.forEach(pt => {
        if (pt && pt.id) {
          store.put({
            ...pt,
            id: String(pt.id),
            idTuyen: pt.idTuyen ? String(pt.idTuyen) : 'ALL',
            idTram: pt.idTram ? String(pt.idTram) : 'ALL'
          });
        }
      });
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e);
    });
    await new Promise(r => setTimeout(r, 10));
  }
  return true;
}

// Tương thích ngược với hàm cũ
async function idbLuuDanhSachDiem(pointsArray) {
  return await idbLuuTatCaDiem(pointsArray);
}

async function idbDocDiemTheoVungXem(minLat, maxLat, minLng, maxLng) {
  const db = await openGISDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('diem_store', 'readonly');
    const req = tx.objectStore('diem_store').getAll();
    req.onsuccess = () => {
      const allPts = req.result || [];
      const filtered = allPts.filter(p => p.lat >= minLat && p.lat <= maxLat && p.lng >= minLng && p.lng <= maxLng);
      resolve(filtered);
    };
    req.onerror = (e) => reject(e);
  });
}

async function idbLuuDoanCapDiem(linksArray) {
  if (!Array.isArray(linksArray) || linksArray.length === 0) return;
  const db = await openGISDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('doan_cap_diem_store', 'readwrite');
    const store = tx.objectStore('doan_cap_diem_store');
    store.clear(); // Làm sạch quan hệ cũ trước khi nạp mới từ Supabase
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
    tx.onerror = (e) => reject(e);
  });
}

async function idbDocDoanCapDiem(idDoanCap) {
  const db = await openGISDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('doan_cap_diem_store', 'readonly');
    const index = tx.objectStore('doan_cap_diem_store').index('idDoanCap');
    const req = index.getAll(String(idDoanCap));
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e);
  });
}

async function idbThemVaoHangDoiSync(actionType, payload) {
  const db = await openGISDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sync_queue_store', 'readwrite');
    tx.objectStore('sync_queue_store').add({ actionType: actionType, payload: payload, timestamp: Date.now() });
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
