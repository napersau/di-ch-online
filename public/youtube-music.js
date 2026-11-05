(() => {
  'use strict';

  function parseYouTubeVideo(input) {
    const raw = String(input || '').trim();
    if (/^[\w-]{11}$/.test(raw)) return raw;
    let url;
    try { url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { return null; }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    const parts = url.pathname.split('/').filter(Boolean);
    let id;
    if (host === 'youtu.be') id = parts.length === 1 ? parts[0] : null;
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'www.youtube-nocookie.com'].includes(host)) {
      if (url.pathname === '/watch') id = url.searchParams.get('v');
      else if (['embed', 'shorts', 'live'].includes(parts[0]) && parts.length === 2) id = parts[1];
    }
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  }

  let apiPromise = null;
  function loadYouTubeAPI() {
    if (globalThis.YT?.Player) return Promise.resolve(globalThis.YT);
    if (apiPromise) return apiPromise;
    apiPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const fail = () => {
        clearTimeout(timer);
        script.remove();
        apiPromise = null;
        reject(new Error('Không tải được YouTube. Kiểm tra mạng hoặc trình chặn nội dung rồi bấm Phát lại.'));
      };
      const timer = setTimeout(fail, 15000);
      globalThis.onYouTubeIframeAPIReady = () => {
        clearTimeout(timer);
        resolve(globalThis.YT);
      };
      script.src = 'https://www.youtube.com/iframe_api';
      script.onerror = fail;
      document.head.append(script);
    });
    return apiPromise;
  }

  class YouTubeMusic {
    constructor({ loadAPI = loadYouTubeAPI, target = 'music-player', origin = '', onStatus = () => {} } = {}) {
      this.loadAPI = loadAPI;
      this.target = target;
      this.origin = origin;
      this.onStatus = onStatus;
      this.player = null;
      this.ready = false;
      this.loading = false;
      this.videoId = '';
      this.loadedId = '';
      this.wantPlay = false;
      this.volume = 12;
      this.loop = true;
      this.duck = true;
      this.speaking = false;
      this.destroyed = false;
    }

    _status(message) { this.onStatus(message); }

    effectiveVolume() { return Math.round(this.volume * (this.duck && this.speaking ? 0.25 : 1)); }

    _applyVolume() {
      if (this.ready) this.player.setVolume(this.effectiveVolume());
    }

    setVolume(value) {
      const number = Number(value);
      if (Number.isFinite(number)) this.volume = Math.max(0, Math.min(100, number));
      this._applyVolume();
    }

    setSpeaking(speaking) { this.speaking = !!speaking; this._applyVolume(); }
    setDucking(duck) { this.duck = !!duck; this._applyVolume(); }

    async play(input) {
      const videoId = parseYouTubeVideo(input);
      if (!videoId) throw new Error('Dán link một video YouTube (youtube.com/watch?v=… hoặc youtu.be/…). Link chỉ có playlist chưa được hỗ trợ.');
      if (this.destroyed) return;
      this.videoId = videoId;
      this.wantPlay = true;
      if (this.ready) return this._playReady();
      if (this.loading) return;
      this.loading = true;
      this._status('Đang tải trình phát YouTube…');
      try {
        const api = await this.loadAPI();
        if (this.destroyed) return;
        this.player = new api.Player(this.target, {
          width: '100%', height: '270',
          playerVars: { origin: this.origin, playsinline: 1, controls: 1, autoplay: 0 },
          events: {
            onReady: (event) => {
              if (this.destroyed) return;
              this.player = event.target;
              this.ready = true;
              this.loading = false;
              this._applyVolume();
              if (this.wantPlay) this._playReady();
              else this._status('Nhạc đã dừng. Bấm Phát nhạc để nghe.');
            },
            onStateChange: (event) => {
              if (this.destroyed) return;
              if (event.data === 1) { this.loadedId = this.videoId; this.wantPlay = true; this._applyVolume(); this._status('Đang phát nhạc YouTube.'); }
              else if (event.data === 2) this._status('Nhạc đang tạm dừng.');
              else if (event.data === 3) this._status('YouTube đang tải nhạc…');
              else if (event.data === 0) {
                if (this.loop && this.wantPlay) { this.player.seekTo(0, true); this.player.playVideo(); }
                else { this.wantPlay = false; this._status('Video đã kết thúc.'); }
              }
            },
            onAutoplayBlocked: () => this._status('Trình duyệt chặn tự phát. Bấm nút ▶ ngay trong khung YouTube hoặc bấm Phát nhạc lần nữa.'),
            onError: (event) => {
              this.wantPlay = false;
              this.loadedId = ''; // Bấm Phát lại sau lỗi sẽ nạp lại video thay vì tiếp tục player lỗi.
              const messages = {
                2: 'Link video không hợp lệ.',
                5: 'Trình duyệt không phát được video này. Thử video khác hoặc mở trang host bằng Edge/Chrome.',
                100: 'Video bị xóa, riêng tư hoặc không tồn tại. Hãy chọn video khác.',
                101: 'Chủ video không cho phát nhúng. Hãy chọn video khác.',
                150: 'Chủ video không cho phát nhúng. Hãy chọn video khác.',
                153: `YouTube không xác minh được trang nhúng. Mở ${this.origin || ''}/admin và kiểm tra tiện ích chặn Referer.`,
              };
              this._status(messages[event.data] || `YouTube báo lỗi ${event.data}. Thử video khác.`);
            },
          },
        });
      } catch (error) {
        this.loading = false;
        this.wantPlay = false;
        this._status(error.message);
        throw error;
      }
    }

    _playReady() {
      this._applyVolume();
      this.player.unMute();
      this._status('Đang yêu cầu phát nhạc…');
      if (this.loadedId !== this.videoId) {
        this.loadedId = this.videoId;
        this.player.loadVideoById(this.videoId);
      } else this.player.playVideo();
    }

    pause() {
      this.wantPlay = false;
      if (this.ready) this.player.pauseVideo();
      this._status('Nhạc đang tạm dừng.');
    }

    stop() {
      this.wantPlay = false;
      if (this.ready) this.player.stopVideo();
      this.loadedId = '';
      this._status('Đã dừng nhạc.');
    }

    destroy() {
      this.destroyed = true;
      this.wantPlay = false;
      if (this.player?.destroy) this.player.destroy();
    }
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { YouTubeMusic, parseYouTubeVideo };
  else { globalThis.YouTubeMusic = YouTubeMusic; globalThis.parseYouTubeVideo = parseYouTubeVideo; }
})();
