// ==========================================================================
// TỆP STORE.JS - QUẢN LÝ TRẠNG THÁI TẬP TRUNG (ĐÃ BỎ LẮNG NGHE VẼ TỰ ĐỘNG)
// ==========================================================================

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

  subscribe(listener) {
    this.listeners.push(listener);
  }

  notifyListeners() {
    this.listeners.forEach(listener => listener(this.state));
  }
}

const AppStore = new ApplicationStore();
// Đã loại bỏ hoàn toàn AppStore.subscribe tự động vẽ để tránh load lặp bản đồ
