'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Temple } = require('../server/temple');
const { toEvent } = require('../server/tiktok');

test('quà nhỏ cũng nhận lời chúc, xếp hạng cộng dồn và từ chối giá trị sai', () => {
  const temple = new Temple({ demo: false });
  const user = { id: 'a', name: 'An Nhiên' };
  const first = temple.handle({ type: 'gift', user, coins: 1 });
  assert.equal(first.gift.coins, 1);
  assert.ok(first.gift.blessing.length > 10);
  temple.handle({ type: 'gift', user, coins: 99 });
  assert.equal(temple.view().donors[0].coins, 100);
  for (const coins of [-1, 0, 1.1, Infinity, 100001, 'bad']) assert.equal(temple.handle({ type: 'gift', user, coins }).ok, false);
  assert.equal(temple.totalCoins, 100);
  assert.equal(temple.gifts.length, 2);
});

test('combo TikTok chỉ được ghi nhận lúc kết thúc', () => {
  const user = { id: '123', nickname: 'Minh Tâm' };
  const gift = { user, gift: { type: 1, diamondCount: 10 }, repeatCount: 5 };
  assert.equal(toEvent('gift', { ...gift, repeatEnd: false }), null);
  const temple = new Temple({ demo: false });
  temple.handle(toEvent('gift', { ...gift, repeatEnd: true }));
  assert.equal(temple.totalCoins, 50);
});

test('niệm lành chỉ cộng một lần mỗi người mỗi vòng, chat hết hạn sau 7 giây', () => {
  let now = 100000;
  const temple = new Temple({ now: () => now, demo: false });
  const user = { id: 'a', name: 'Hương Sen' };
  temple.handle({ type: 'chat', user, text: 'Nam mô A Di Đà Phật' });
  temple.handle({ type: 'chat', user, text: 'bình an' });
  assert.equal(temple.merits, 1);
  assert.equal(temple.view().visitors[0].prayer, 'bình an');
  now += 8000;
  assert.equal(temple.view().visitors[0].prayer, '');
  now += 120000;
  temple.tick();
  temple.handle({ type: 'chat', user, text: 'bình an' });
  assert.equal(temple.merits, 2);
});

test('banner chạy theo lịch đã đặt và tắt được; cấu hình sai không ghi một phần', () => {
  let now = 0;
  const temple = new Temple({ now: () => now, demo: false });
  now = 59000;
  assert.equal(temple.tick(), null);
  now = 60000;
  assert.ok(temple.tick().message);
  temple.updateSettings({ bannerEnabled: false });
  now = 500000;
  assert.equal(temple.tick(), null);
  assert.throws(() => temple.updateSettings({ title: 'Tên mới', bannerInterval: 2 }));
  assert.equal(temple.settings.title, 'Tịnh Tâm Viên');
});

test('lưu và khôi phục phiên thật không phát lại quà; reset xóa dữ liệu mô phỏng', () => {
  const temple = new Temple();
  assert.ok(temple.view().visitorCount > 10);
  temple.reset('offline');
  assert.equal(temple.totalCoins, 0);
  assert.equal(temple.view().visitorCount, 0);
  temple.handle({ type: 'gift', user: { id: 'real', name: 'Thật' }, coins: 30 });
  const restored = new Temple();
  assert.equal(restored.restore(temple.snapshot()), true);
  assert.equal(restored.totalCoins, 30);
  assert.equal(restored.mode, 'offline');
  assert.equal(restored.view().donors[0].name, 'Thật');
});

test('giới hạn 400 người, giữ người tặng quà và người bị ẩn không tự quay lại', () => {
  const temple = new Temple({ demo: false });
  temple.handle({ type: 'gift', user: { id: 'donor', name: 'Hữu duyên' }, coins: 1 });
  for (let i = 0; i < 450; i++) temple.handle({ type: 'join', user: { id: `p-${i}`, name: `Khách ${i}` } });
  assert.equal(temple.players.size, 400);
  assert.ok(temple.players.has('donor'));
  assert.ok(temple.view().visitors.length <= 24);
  temple.banned.add('hidden');
  assert.equal(temple.handle({ type: 'chat', user: { id: 'hidden', name: 'Ẩn' }, text: 'bình an' }).ok, false);
});

test('khôi phục cấu hình trải nghiệm vào phiên thật nhưng không nhập khách hoặc xu giả', () => {
  const demo = new Temple();
  demo.updateSettings({ title: 'Chánh Điện Bình An', bannerInterval: 30, goal: 2000 });
  const live = new Temple({ demo: false });
  assert.equal(live.restore(demo.snapshot()), false);
  assert.equal(live.settings.title, 'Chánh Điện Bình An');
  assert.equal(live.settings.bannerInterval, 30);
  assert.equal(live.totalCoins, 0);
  assert.equal(live.players.size, 0);
  assert.equal(live.mode, 'offline');
});
