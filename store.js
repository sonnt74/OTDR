// store.js - Quản lý trạng thái tập trung và kết nối lắng nghe sự kiện
class ApplicationStore {
  constructor() {
    this.state = {
      selectedDai: 'ALL',
      selectedTram: 'ALL',
      selectedTuyen: 'ALL',
      selectedDoanCap: 'ALL',
      daiList: [],
      tramList: [],
      tuyenList: [],
      doanCapList: [],
      dataPoints: []
    };
    this.listeners = [];
  }

  getState() {
    return this.state;
  }

  setState(updater) {
    if (typeof updater === 'function') {
      this.state = { ...this.state, ...updater(this.state) };
    } else {
      this.state = { ...this.state, ...updater };
    }
    this.notifyListeners();
  }

  // Đăng ký hàm lắng nghe sự thay đổi trạng thái
  subscribe(listener) {
    this.listeners.push(listener);
  }

  // Phát thông báo đến tất cả các thành phần giao diện đã đăng ký
  notifyListeners() {
    this.listeners.forEach(listener => listener(this.state));
  }
}

const AppStore = new ApplicationStore();

// --- KẾT NỐI LẮNG NGHE SỰ KIỆN CHO BẢN ĐỒ VÀ BẢNG ĐIỀU KHIỂN ---
AppStore.subscribe((state) => {
  console.log("Trạng thái AppStore đã thay đổi:", state);
  
  // Tự động kích hoạt vẽ lại bản đồ khi các lựa chọn tuyến/đoạn thay đổi
  if (typeof veLaiTuyenAB === 'function') {
    veLaiTuyenAB();
  }
});
