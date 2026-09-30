// ==========================================================================
// TỆP SW.JS - MODULE CACHE ẢNH NỀN BẢN ĐỒ (TILE CACHING OFFLINE)
// ==========================================================================

const CACHE_NAME = 'tnn-gis-tiles-v1';
// Danh sách các máy chủ cung cấp ảnh bản đồ (OSM và ArcGIS)
const TILE_DOMAINS = ['tile.openstreetmap.org', 'arcgisonline.com'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Kiểm tra xem request hiện tại có phải là lấy ảnh tile bản đồ không
  const isTileRequest = TILE_DOMAINS.some(domain => url.hostname.includes(domain));

  if (isTileRequest) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        // Nếu đã có sẵn trong Cache (Offline hoặc Online đều ưu tiên lấy tốc độ cao)
        if (cachedResponse) {
          return cachedResponse;
        }

        // Nếu chưa có trong Cache -> Tải từ mạng về, đồng thời lưu bản sao vào Cache để dùng cho lần sau
        return fetch(event.request).then((networkResponse) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        }).catch(() => {
          // Trả về phản hồi rỗng nếu mất mạng và tile chưa từng được tải trước đó
          return new Response('', { status: 404, statusText: 'Tile Offline Not Available' });
        });
      })
    );
  }
});
