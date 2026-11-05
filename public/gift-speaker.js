(() => {
  'use strict';

  // Chỉ trang host phát tiếng. Overlay trong Studio không đọc thêm lần thứ hai.
  class GiftSpeaker {
    constructor({ synthesis = globalThis.speechSynthesis, Utterance = globalThis.SpeechSynthesisUtterance,
      onStatus = () => {}, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
      this.synthesis = synthesis;
      this.Utterance = Utterance;
      this.onStatus = onStatus;
      this.setTimer = (...args) => setTimer(...args);
      this.clearTimer = (...args) => clearTimer(...args);
      this.enabled = false;
      this.volume = 0.9;
      this.rate = 1;
      this.voiceURI = '';
      this.queue = [];
      this.current = null;
      this.timer = null;
    }

    get supported() {
      return !!(this.synthesis && this.Utterance);
    }

    voices() {
      return this.supported ? this.synthesis.getVoices().filter((v) => /^vi(?:[-_]|$)/i.test(v.lang)) : [];
    }

    enable(voiceURI) {
      if (!this.supported) throw new Error('Trình duyệt không hỗ trợ đọc loa. Hãy mở trang host bằng Edge hoặc Chrome.');
      const voice = this.voices().find((v) => v.voiceURI === voiceURI);
      if (!voice) throw new Error('Chưa có giọng tiếng Việt. Thử mở trang host bằng Microsoft Edge; chọn giọng tiếng Việt khi danh sách tải xong.');
      this.voiceURI = voice.voiceURI;
      this.enabled = true;
      this._status('Đã bật loa. Chờ quà tặng mới.');
    }

    setVolume(value) {
      const number = Number(value);
      if (Number.isFinite(number)) this.volume = Math.max(0, Math.min(1, number));
    }

    setRate(value) {
      const number = Number(value);
      if (Number.isFinite(number)) this.rate = Math.max(0.7, Math.min(1.3, number));
    }

    gift(gift) {
      if (!this.enabled || typeof gift?.name !== 'string' || !gift.name.trim() ||
          !Number.isSafeInteger(gift.coins) || gift.coins <= 0) return;
      // Gộp các quà đang chờ của cùng tên để không đọc lặp quá lâu khi tặng liên tục.
      const name = [...gift.name].slice(0, 32).join('');
      const key = gift.userId || name;
      const blessing = typeof gift.blessing === 'string' ? gift.blessing.slice(0, 180) : 'Nguyện bạn và gia đình luôn bình an, thân tâm an lạc.';
      const waiting = this.queue.find((item) => item.key === key);
      if (waiting) { waiting.coins += gift.coins; waiting.blessing = blessing; }
      else if (this.queue.length < 500) this.queue.push({ key, name, coins: gift.coins, blessing });
      if (this.current) this._status(`Đang đọc: ${this.current.text}`);
      this._next();
    }

    clear() {
      this.queue.length = 0;
      this.current = null; // Bỏ qua callback kết thúc do cancel của câu cũ.
      this.clearTimer(this.timer);
      this.timer = null;
      if (this.supported) this.synthesis.cancel();
      this._status(this.enabled ? 'Đã xóa hàng chờ. Chờ quà tặng mới.' : 'Loa đang tắt.');
    }

    stop() {
      this.enabled = false;
      this.clear();
    }

    _status(message) {
      this.onStatus({ enabled: this.enabled, speaking: !!this.current, queued: this.queue.length, message });
    }

    _fail(message) {
      this.stop();
      this._status(message);
    }

    _next() {
      if (!this.enabled || this.current || !this.queue.length) return;
      const gift = this.queue.shift();
      const voice = this.voices().find((v) => v.voiceURI === this.voiceURI);
      if (!voice) return this._fail('Giọng tiếng Việt không còn khả dụng. Chọn lại giọng rồi bật loa.');
      const text = `Cảm ơn ${gift.name} đã gửi ${gift.coins.toLocaleString('vi-VN')} xu kết duyên. ${gift.blessing}`;
      const utterance = new this.Utterance(text);
      utterance.lang = 'vi-VN';
      utterance.voice = voice;
      utterance.volume = this.volume;
      utterance.rate = this.rate;
      this.current = utterance; // Giữ tham chiếu đến khi đọc xong.
      utterance.onend = () => {
        if (this.current !== utterance) return;
        this.clearTimer(this.timer);
        this.timer = null;
        this.current = null;
        this._status('Chờ quà tặng mới.');
        this._next();
      };
      utterance.onerror = (event) => {
        if (this.current !== utterance) return;
        const message = event.error === 'not-allowed'
          ? 'Trình duyệt chặn âm thanh. Bấm Bật loa rồi Đọc thử; kiểm tra tab không bị tắt tiếng.'
          : `Không đọc được (${event.error || 'lỗi giọng đọc'}). Kiểm tra giọng tiếng Việt và thử bật loa lại.`;
        this._fail(message);
      };
      this._status(`Đang đọc: ${text}`);
      // Không để giọng bị treo làm toàn bộ hàng chờ im lặng vô thời hạn.
      this.timer = this.setTimer(() => {
        if (this.current === utterance) this._fail('Giọng đọc không phản hồi. Chọn giọng khác rồi bật loa lại.');
      }, 45000);
      try {
        this.synthesis.resume();
        this.synthesis.speak(utterance);
      } catch {
        this._fail('Không khởi động được giọng đọc. Hãy mở trang host bằng Edge hoặc Chrome và bật loa lại.');
      }
    }
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { GiftSpeaker };
  else globalThis.GiftSpeaker = GiftSpeaker;
})();
