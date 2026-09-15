// store.js - Quản lý trạng thái tập trung (Centralized State Management)
class ApplicationStore {
  constructor() {
    // Trạng thái gốc của toàn bộ ứng dụng
    this.state = {
      selectedDai: 'ALL',
      selectedTram: 'ALL',
      selectedTuyen: 'ALL',
      selectedDoanCap: 'ALL',
      daiList: [],
      tramList: [],
      tuyenList: [],
      doanCapList: [],
      dataPoints: [] // Danh sách điểm hạ tầng trên RAM
    };
    
    // Danh sách các hàm lắng nghe sự thay đổi trạng thái
    this.listeners = [];
  }

  // Lấy toàn bộ hoặc một phần trạng thái hiện tại
  getState() {
    return this.state;
  }

  // Cập nhật trạng thái mới và tự động thông báo cho các giao diện đăng ký
  setState(updater) {
    if (typeof updater === 'function') {
      this.state = { ...this.state, ...updater(this.state) };
    } else {
      this.state = { ...this.state, ...updater };
    }
    this.notifyListeners();
  }

  // Đăng ký một hàm lắng nghe khi trạng thái thay đổi
  subscribe(listener) {
    this.listeners.push(listener);
  }

  // Thông báo cho tất cả các thành phần giao diện cập nhật theo dữ liệu mới
  notifyListeners() {
    this.listeners.forEach(listener => listener(this.state));
  }
}

// Khởi tạo một thể hiện duy nhất (Singleton Store) cho toàn ứng dụng
const AppStore = new ApplicationStore();
