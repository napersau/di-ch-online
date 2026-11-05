'use strict';

// Cầu nối TikTok Live -> game: đọc bình luận, quà, follow, share của phiên live và chuyển thành sự kiện game.
// Dùng thư viện không chính thức "tiktok-live-connector" (cài bằng: npm install). Server vẫn chạy được khi chưa cài,
// chỉ riêng phần TikTok báo lỗi.

const KINDS = ['member', 'chat', 'gift', 'follow', 'share'];

// "@ten_kenh", "ten_kenh" hoặc link https://www.tiktok.com/@ten_kenh/live -> "ten_kenh". Sai định dạng -> "".
function cleanUsername(raw) {
  let s = String(raw ?? '').trim();
  const m = s.match(/tiktok\.com\/@([^/?#]+)/i);
  if (m) s = m[1];
  s = s.replace(/^@/, '');
  return /^[A-Za-z0-9._]{2,24}$/.test(s) ? s : '';
}

function userOf(data) {
  const u = data?.user;
  if (!u) return null;
  const handle = u.uniqueId || u.displayId || '';
  const id = [u.userId, u.id, handle].map(value => String(value ?? '').trim()).find(value => value && value !== '0');
  if (!id) return null;
  // Tiền tố "tt-" để không trùng với người test/giả lập.
  return { id: `tt-${id}`, name: String(u.nickname ?? '').trim() || handle };
}

// Quà combo (type 1) bắn nhiều sự kiện khi đang nhấn liên tục; chỉ tính một lần lúc combo kết thúc.
function giftCoins(data) {
  const g = data.gift || data.giftDetails || {};
  const type = Number(g.type ?? g.giftType);
  const ended = data.repeatEnd === true || Number(data.repeatEnd) === 1;
  if (type === 1 && !ended) return 0;
  const diamonds = Number(g.diamondCount ?? data.extendedGiftInfo?.diamond_count) || 0;
  return diamonds * Math.max(1, Number(data.repeatCount) || 1);
}

// Chuyển dữ liệu thô của thư viện thành sự kiện game. Trả về null nếu bỏ qua.
function toEvent(kind, data) {
  const user = userOf(data);
  if (!user) return null;
  switch (kind) {
    case 'member':
      return { type: 'join', user };
    case 'chat':
      return { type: 'chat', user, text: String(data.comment ?? '') };
    case 'gift': {
      const coins = giftCoins(data);
      return coins > 0 ? { type: 'gift', user, coins } : null;
    }
    case 'follow':
    case 'share':
      return { type: kind, user };
    default:
      return null;
  }
}

class TikTokBridge {
  constructor(dispatch, { signApiKey = '', onStatus = () => {} } = {}) {
    this.dispatch = dispatch;
    this.signApiKey = signApiKey;
    this.onStatus = onStatus;
    this.conn = null;
    this.timer = null;
    this.wanted = false;
    this.failures = 0;
    this.eventsReceived = 0;
    this.lastEventAt = 0;
    this.seen = new Set(); // msgId đã xử lý, chống nhận trùng
    this.state = { state: 'off', username: '', message: 'Chưa kết nối.', since: Date.now() };
  }

  status() {
    return { ...this.state, eventsReceived: this.eventsReceived, lastEventAt: this.lastEventAt };
  }

  start(username) {
    this.stop();
    this.wanted = true;
    this.failures = 0;
    this.state.username = username;
    this.eventsReceived = 0;
    this.lastEventAt = 0;
    this._connect();
  }

  stop() {
    this.wanted = false;
    clearTimeout(this.timer);
    this._drop();
    this._set('off', 'Chưa kết nối.');
  }

  async _connect() {
    clearTimeout(this.timer);
    this._set('connecting', `Đang vào phòng live @${this.state.username}…`);
    let lib;
    try {
      lib = await import('tiktok-live-connector');
    } catch {
      this.wanted = false;
      this._set('error', 'Chưa cài thư viện TikTok. Mở Terminal trong VS Code và chạy: npm install');
      return;
    }
    if (!this.wanted) return;

    let conn;
    try {
      conn = new lib.TikTokLiveConnection(this.state.username, {
        processInitialData: false,
        ...(this.signApiKey ? { signApiKey: this.signApiKey } : {}),
      });
    } catch (err) {
      this._retry(`Không khởi tạo được kết nối: ${err?.message || err}`, this._backoff());
      return;
    }
    this.conn = conn;
    for (const kind of KINDS) conn.on(kind, (data) => {
      if (this.conn === conn && this.wanted) this._forward(kind, data);
    });
    conn.on('disconnected', () => {
      if (this.conn === conn) this._retry('Mất kết nối, đang thử lại…', this._backoff());
    });
    conn.on('streamEnd', () => {
      if (this.conn === conn) this._retry('Live đã kết thúc. Tự kết nối lại khi bạn lên live.', 30_000);
    });
    conn.on('error', (err) => console.error('TikTok:', err?.info || err?.exception?.message || err));

    try {
      const state = await conn.connect();
      if (this.conn !== conn) return void conn.disconnect().catch(() => {});
      this.failures = 0;
      this._set('live', `Đã vào phòng live @${this.state.username} (room ${state?.roomId ?? '?'}).`);
    } catch (err) {
      if (this.conn !== conn) return;
      if (err instanceof lib.UserOfflineError) {
        this._retry(`@${this.state.username} chưa lên live. Tự thử lại sau 30 giây.`, 30_000);
      } else {
        this._retry(`Không kết nối được: ${err?.message || err}. Đang thử lại…`, this._backoff());
      }
    }
  }

  _forward(kind, data) {
    // Đừng đánh dấu msgId của thông báo combo chưa kết thúc là đã tính quà.
    const ev = toEvent(kind, data);
    if (!ev) return;
    const msgId = data?.common?.msgId;
    if (msgId && String(msgId) !== '0') {
      const key = `${kind}:${msgId}`;
      if (this.seen.has(key)) return;
      this.seen.add(key);
      if (this.seen.size > 2000) this.seen.delete(this.seen.values().next().value);
    }
    this.eventsReceived++;
    this.lastEventAt = Date.now();
    this.dispatch(ev);
  }

  _backoff() {
    return Math.min(60_000, 5_000 * 2 ** this.failures++);
  }

  _retry(message, ms) {
    this._drop();
    if (!this.wanted) return;
    this._set('retrying', message);
    this.timer = setTimeout(() => this._connect(), ms);
  }

  _drop() {
    const conn = this.conn;
    this.conn = null; // sự kiện "disconnected" của kết nối cũ sẽ bị bỏ qua
    if (conn) conn.disconnect().catch(() => {});
  }

  _set(state, message) {
    this.state = { ...this.state, state, message, since: Date.now() };
    this.onStatus(this.status());
  }
}

module.exports = { TikTokBridge, toEvent, cleanUsername };
