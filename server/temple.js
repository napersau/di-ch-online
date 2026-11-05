'use strict';

const crypto = require('node:crypto');

const BLESSINGS = [
  'Nguyện bạn và gia đình luôn bình an, thân tâm an lạc.',
  'Chúc bạn một ngày nhẹ lòng, mọi điều đều thuận duyên.',
  'Nguyện những điều lành đến với bạn, hôm nay và mỗi ngày.',
  'Chúc bạn đủ bình tĩnh trước khó khăn, đủ niềm vui trong hiện tại.',
  'Nguyện gia đình bạn mạnh khỏe, hạnh phúc và yêu thương nhau.',
  'Chúc bạn ngủ ngon, lòng thanh thản, ngày mai nhiều niềm vui.'
];
const PHASES = [
  { name: 'Một niệm an lành', command: 'nam mô', description: 'Gõ “nam mô” để cùng chắp tay niệm Phật.', duration: 120 },
  { name: 'Gửi lời bình an', command: 'bình an', description: 'Gõ “bình an” để gửi một lời lành đến mọi người.', duration: 120 },
  { name: 'Thắp một nén tâm hương', command: 'thắp hương', description: 'Gõ “thắp hương” để dâng một nén tâm hương.', duration: 120 },
  { name: 'Một tiếng chuông lành', command: 'chuông', description: 'Gõ “chuông” để cùng lắng lòng trong giây lát.', duration: 90 }
];
const normalize = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();
const text = (s, max = 80) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);

class Temple {
  constructor({ now = () => Date.now(), demo = true } = {}) {
    this.now = now;
    this.settings = { title: 'Tịnh Tâm Viên', subtitle: 'Một niệm lành · Vạn sự an', goal: 1000, bannerEnabled: true, bannerInterval: 60, giftSeconds: 9 };
    this.reset(demo ? 'demo' : 'offline');
  }

  reset(mode = 'offline') {
    this.mode = mode;
    this.startedAt = this.now();
    this.players = new Map();
    this.activitySequence = 0;
    this.guests = new Map();
    this.seatOwners = Array(24).fill(null);
    this.guestSequence = 0;
    this.totalCoins = 0;
    this.merits = 0;
    this.feed = [];
    this.gifts = [];
    this.banned = new Set();
    this.phaseIndex = 0;
    this.phaseAt = this.now();
    this.lastBannerAt = this.now();
    this.blessingIndex = 0;
    if (mode === 'demo') this.seed();
  }

  seed() {
    const names = ['An Nhiên', 'Minh Tâm', 'Hương Sen', 'Thiện Duyên', 'Ngọc Anh', 'Thanh Trúc', 'Bình Minh', 'Tâm An', 'Mây Trắng', 'Diệu Linh', 'Hải Yến', 'Tuệ An', 'Thảo Nguyên', 'Gia Hân', 'Đức Phúc', 'Hoài Thương', 'Khánh Linh', 'Tịnh Liên', 'Thu Hà', 'Như Ý', 'Quang Minh', 'Bảo Châu', 'Ngọc Mai', 'Thiên Ân'];
    names.forEach((name, i) => {
      const p = this.join({ id: `demo-${i}`, name });
      p.coins = [288, 168, 99, 68, 39][i] || 0;
      p.merits = (i % 4) + 1;
      this.totalCoins += p.coins;
      if (p.coins) this.gifts.push({ id: `demo-gift-${i}`, userId: p.id, name: p.name, coins: p.coins, blessing: BLESSINGS[i % BLESSINGS.length], at: this.now() - (i + 1) * 60000, seconds: this.settings.giftSeconds });
    });
    this.merits = 76;
    this.log('welcome', 'Chánh điện đã mở cửa', 'Dữ liệu trải nghiệm · Mời bạn thử gửi một lời chúc.');
    this.log('gift', 'An Nhiên', 'Gửi 288 xu cùng một lời nguyện an lành.');
    this.log('prayer', 'Minh Tâm', 'Nam mô A Di Đà Phật 🙏');
  }

  join(user) {
    const id = text(user?.id, 100);
    if (!id || this.banned.has(id)) return null;
    let p = this.players.get(id);
    if (!p) {
      if (this.players.size >= 400) {
        const oldest = [...this.players.values()].filter(v => !v.coins).sort((a, b) => a.activeAt - b.activeAt || (a.activeOrder || 0) - (b.activeOrder || 0))[0];
        if (!oldest) return null;
        this.players.delete(oldest.id);
      }
      p = { id, name: text(user.name, 32) || 'Khách hữu duyên', coins: 0, merits: 0, joinedAt: this.now(), activeAt: this.now(), prayer: '', prayerAt: 0, phaseKey: -1, hue: parseInt(crypto.createHash('md5').update(id).digest('hex').slice(0, 6), 16) % 6 };
      this.players.set(id, p);
    }
    const incomingName = text(user?.name, 32);
    if (incomingName) p.name = incomingName;
    p.activeAt = this.now();
    p.activeOrder = ++this.activitySequence;
    return p;
  }

  log(type, name, message) {
    const item = { id: crypto.randomUUID(), type, name, message, at: this.now() };
    this.feed.unshift(item);
    this.feed.length = Math.min(this.feed.length, 40);
    return item;
  }

  handle(event) {
    if (!event || !['join', 'chat', 'gift', 'follow', 'share', 'like'].includes(event.type)) return { ok: false, error: 'Sự kiện không hợp lệ.' };
    const coins = Number(event.coins);
    if (event.type === 'gift' && (!Number.isSafeInteger(coins) || coins < 1 || coins > 100000)) return { ok: false, error: 'Quà tặng phải từ 1 đến 100.000 xu.' };
    if (this.guests.has(String(event.user?.id))) return { ok: false, error: 'Khách phụ không tạo quà tặng hoặc công đức.' };
    const existed = this.players.has(text(event.user?.id, 100));
    const p = this.join(event.user);
    if (!p) return { ok: false, error: 'Không thể thêm người xem.' };
    if (event.type === 'join' && !existed) {
      this.log('welcome', p.name, 'Vừa vào chánh điện và nhận một đệm ngồi.');
      return { ok: true, arrival: { id: p.id, name: p.name } };
    }
    if (event.type === 'gift') {
      p.coins += coins;
      this.totalCoins += coins;
      const gift = { id: crypto.randomUUID(), userId: p.id, name: p.name, hue: p.hue, coins, blessing: text(event.blessing, 180) || this.nextBlessing(), at: this.now(), seconds: this.settings.giftSeconds };
      this.gifts.unshift(gift);
      this.gifts.length = Math.min(100, this.gifts.length);
      this.log('gift', p.name, `Gửi ${coins.toLocaleString('vi-VN')} xu · ${gift.blessing}`);
      return { ok: true, gift };
    }
    if (event.type === 'chat') {
      const message = text(event.text, 140);
      if (!message) return { ok: true };
      p.prayer = message;
      p.prayerAt = this.now();
      const n = normalize(message);
      const phase = PHASES[this.phaseIndex];
      const matched = [normalize(phase.command), 'a di da phat', 'nam mo', 'binh an', 'thap huong', 'chuong'].some(k => n.includes(k));
      if (matched && p.phaseKey !== this.phaseAt) {
        p.merits++;
        p.phaseKey = this.phaseAt;
        this.merits++;
      }
      this.log(matched ? 'prayer' : 'chat', p.name, message);
      return { ok: true, prayer: matched, bell: n.includes('chuong') };
    }
    if (event.type === 'follow' || event.type === 'share') this.log('welcome', p.name, event.type === 'follow' ? 'Vừa theo dõi · Thêm một người hữu duyên.' : 'Vừa chia sẻ một khoảng bình an.');
    return { ok: true };
  }

  nextBlessing() { return BLESSINGS[this.blessingIndex++ % BLESSINGS.length]; }

  addGuests(count = crypto.randomInt(2, 4)) {
    if (![2, 3].includes(count)) throw new Error('Mỗi lượt thêm 2 hoặc 3 khách phụ.');
    if (this.guests.size + count > 12) throw new Error('Chánh điện đã đủ khách phụ. Bấm Dọn khách phụ trước khi thêm lượt mới.');
    const names = ['Tâm An', 'Mây Lành', 'Hương Sen', 'Thanh Tịnh', 'An Nhiên', 'Tuệ Minh', 'Diệu Tâm', 'Thiện Duyên', 'Tịnh Liên', 'Bình Yên', 'Minh An', 'Thiện Tâm'];
    const added = [];
    for (let i = 0; i < count; i++) {
      const order = this.guestSequence++;
      const guest = { id: `npc-${crypto.randomUUID()}`, name: names[order % names.length], hue: order % 6, isNpc: true, coins: 0, merits: 0, joinedAt: this.now(), activeAt: this.now(), prayer: '', prayerAt: 0 };
      this.guests.set(guest.id, guest);
      added.push({ id: guest.id, name: guest.name, hue: guest.hue, isNpc: true });
    }
    this.log('ambient', 'Khách phụ', `Thêm ${count} nhân vật mô phỏng vào dâng hương.`);
    return { id: crypto.randomUUID(), source: 'npc', participants: added, at: this.now(), seconds: 8 };
  }

  clearGuests() {
    this.guests.clear();
    this.seatOwners = this.seatOwners.map(id => id?.startsWith('npc-') ? null : id);
  }

  banner(message) {
    this.lastBannerAt = this.now();
    return { id: crypto.randomUUID(), message: text(message, 180) || this.nextBlessing(), at: this.now() };
  }

  tick() {
    const phase = PHASES[this.phaseIndex];
    if (this.now() - this.phaseAt >= phase.duration * 1000) {
      this.phaseIndex = (this.phaseIndex + 1) % PHASES.length;
      this.phaseAt = this.now();
    }
    if (this.settings.bannerEnabled && this.now() - this.lastBannerAt >= this.settings.bannerInterval * 1000) return this.banner();
    return null;
  }

  updateSettings(input) {
    const next = { ...this.settings };
    for (const [key, max] of [['title', 35], ['subtitle', 70]]) if (input[key] !== undefined) {
      next[key] = text(input[key], max);
      if (!next[key]) throw new Error('Tên chánh điện và lời đề tựa không được để trống.');
    }
    for (const [key, min, max] of [['goal', 10, 10000000], ['bannerInterval', 20, 600], ['giftSeconds', 5, 20]]) if (input[key] !== undefined) {
      const n = Number(input[key]);
      if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${key}: nhập số nguyên từ ${min} đến ${max}.`);
      next[key] = n;
    }
    if (typeof input.bannerEnabled === 'boolean') next.bannerEnabled = input.bannerEnabled;
    this.settings = next;
    return next;
  }

  view() {
    const people = [...this.players.values()];
    const donors = people.filter(p => p.coins > 0).sort((a, b) => b.coins - a.coins || a.joinedAt - b.joinedAt).slice(0, 10);
    const donorIds = new Set(donors.slice(0, 3).map(p => p.id));
    const visitors = people.filter(p => !donorIds.has(p.id)).sort((a, b) => b.activeAt - a.activeAt || (b.activeOrder || 0) - (a.activeOrder || 0));
    // Người mới/vừa tương tác luôn hiện; luân phiên các chỗ còn lại.
    const pinned = visitors.slice(0, 8);
    const rest = visitors.slice(8);
    const offset = rest.length ? Math.floor(this.now() / 15000) % rest.length : 0;
    const visible = pinned.concat(rest.slice(offset), rest.slice(0, offset)).slice(0, 24);
    visible.push(...[...this.guests.values()].slice(0, 24 - visible.length));
    const wanted = new Set(visible.map(p => p.id));
    this.seatOwners = this.seatOwners.map(id => wanted.has(id) ? id : null);
    for (const p of visible) if (!this.seatOwners.includes(p.id)) this.seatOwners[this.seatOwners.indexOf(null)] = p.id;
    const publicPlayer = p => ({ id: p.id, name: p.name, coins: p.coins, merits: p.merits, hue: p.hue, isNpc: !!p.isNpc, seat: this.seatOwners.indexOf(p.id), prayer: this.now() - p.prayerAt < 7000 ? p.prayer : '' });
    const phase = PHASES[this.phaseIndex];
    return { mode: this.mode, startedAt: this.startedAt, serverTime: this.now(), settings: this.settings, totalCoins: this.totalCoins, merits: this.merits, visitorCount: people.length, guestCount: this.guests.size, seatCount: 24, donors: donors.map(publicPlayer), visitors: visible.map(publicPlayer), feed: this.feed.slice(0, 15), gifts: this.gifts.slice(0, 30), phase: { ...phase, remaining: Math.max(0, phase.duration - Math.floor((this.now() - this.phaseAt) / 1000)) } };
  }

  snapshot() { return { version: 1, mode: this.mode, settings: this.settings, startedAt: this.startedAt, totalCoins: this.totalCoins, merits: this.merits, players: [...this.players.values()], feed: this.feed, gifts: this.gifts, banned: [...this.banned] }; }

  restore(data) {
    if (data?.version !== 1 || !Array.isArray(data.players)) return false;
    try { this.updateSettings(data.settings || {}); } catch { return false; }
    // Restore presentation settings, never bring simulated visitors into a real session.
    if (data.mode === 'demo') return false;
    this.players = new Map(data.players.filter(p => p && typeof p.id === 'string').slice(0, 400).map(p => [p.id, p]));
    this.activitySequence = Math.max(0, ...[...this.players.values()].map(p => Number.isSafeInteger(p.activeOrder) ? p.activeOrder : 0));
    this.totalCoins = Number(data.totalCoins) || 0;
    this.merits = Number(data.merits) || 0;
    this.startedAt = Number(data.startedAt) || this.now();
    this.feed = Array.isArray(data.feed) ? data.feed.slice(0, 40) : [];
    this.gifts = Array.isArray(data.gifts) ? data.gifts.slice(0, 100) : [];
    this.banned = new Set(Array.isArray(data.banned) ? data.banned : []);
    this.mode = 'offline';
    return true;
  }
}

module.exports = { Temple, BLESSINGS, PHASES };
