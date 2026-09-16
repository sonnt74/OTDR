// store.js - Quản lý trạng thái tập trung và tự động điều phối luồng trình diễn

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

// LẮNG NGHE ĐIỀU PHỐI LUỒNG TRÌNH DIỄN BẢN ĐỒ
AppStore.subscribe((state) => {
  // Tự động kích hoạt vẽ tuyến cáp khi người dùng chọn một tuyến cụ thể
  if (typeof veLaiTuyenAB === 'function' && state.selectedTuyen !== 'ALL') {
    veLaiTuyenAB();
  }
});
