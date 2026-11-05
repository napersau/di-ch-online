'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Temple } = require('../server/temple');
const { toEvent } = require('../server/tiktok');
const { createApp } = require('../server');

test('nhiều người vào trong cùng một mili giây: người mới nhất vẫn có tên và đệm ngay', () => {
  const temple = new Temple({ demo: false, now: () => 100000 });
  for (let i = 0; i < 40; i++) temple.handle({ type: 'join', user: { id: `viewer-${i}`, name: `Người xem ${i}` } });
  const state = temple.view();
  const latest = state.visitors.find(p => p.id === 'viewer-39');
  assert.ok(latest, 'Người vừa vào không được chờ vòng luân phiên');
  assert.equal(latest.name, 'Người xem 39');
  assert.ok(latest.seat >= 0 && latest.seat < 24);
  assert.equal(latest.prayer, '');
  assert.equal(latest.coins, 0);
  assert.equal(state.visitorCount, 40);
  assert.equal(new Set(state.visitors.map(p => p.seat)).size, 24);
});

test('nhận được tên TikTok mới phải cập nhật nhân vật cũ, giữ một tài khoản và một đệm', () => {
  const temple = new Temple({ demo: false });
  temple.handle({ type: 'join', user: { id: 'tt-123', name: 'ten_tai_khoan' } });
  const seat = temple.view().visitors[0].seat;
  temple.handle({ type: 'join', user: { id: 'tt-123', name: 'Hương Sen 🌸' } });
  assert.equal(temple.view().visitors[0].name, 'Hương Sen 🌸');
  assert.equal(temple.view().visitors[0].seat, seat);
  assert.equal(temple.players.size, 1);
  temple.handle({ type: 'join', user: { id: 'tt-123', name: '' } });
  assert.equal(temple.view().visitors[0].name, 'Hương Sen 🌸');
});

test('member có userId mặc định 0 vẫn dùng được id hoặc uniqueId còn hợp lệ', () => {
  const member = toEvent('member', { user: { userId: '0', id: '456', uniqueId: 'huong_sen', nickname: 'Hương Sen' } });
  assert.equal(member?.user.id, 'tt-456');
  assert.equal(member?.user.name, 'Hương Sen');
  assert.equal(toEvent('member', { user: { userId: '0', uniqueId: 'huong_sen', nickname: 'Hương Sen' } })?.user.id, 'tt-huong_sen');
  assert.equal(toEvent('member', { user: { userId: '0', id: '0' } }), null);
  assert.equal(toEvent('member', { user: { id: '17', nickname: '   ', uniqueId: 'minh_tam' } }).user.name, 'minh_tam');
});

test('khôi phục phiên rồi người mới vào cùng thời điểm vẫn được ưu tiên ngồi', () => {
  const now = () => 100000;
  const original = new Temple({ demo: false, now });
  for (let i = 0; i < 40; i++) original.handle({ type: 'join', user: { id: `viewer-${i}`, name: `Khách ${i}` } });
  const restored = new Temple({ demo: false, now });
  assert.equal(restored.restore(original.snapshot()), true);
  restored.handle({ type: 'join', user: { id: 'new-after-restore', name: 'Người mới sau khởi động' } });
  assert.ok(restored.view().visitors.some(p => p.id === 'new-after-restore' && p.seat >= 0));
});

test('nhận member là SSE gửi tên và số đệm, không cần chat hoặc quà', async t => {
  const app = createApp({ demo: false, persist: false, simulate: false, adminToken: 'arrival-test' });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const abort = new AbortController();
  t.after(() => abort.abort());
  const response = await fetch(`http://127.0.0.1:${app.server.address().port}/api/stream`, { signal: abort.signal });
  const reader = response.body.getReader();
  await reader.read();
  app.bridge._forward('member', { common: { msgId: 'arrival-e2e' }, user: { userId: '789', uniqueId: 'khach_moi', nickname: 'Tên người vừa xem LIVE' } });
  let frame = '';
  while (!frame.includes('tt-789')) frame += new TextDecoder().decode((await reader.read()).value);
  const json = frame.split('\n').find(line => line.startsWith('data: '));
  const state = JSON.parse(json.slice(6));
  assert.equal(state.visitors[0].name, 'Tên người vừa xem LIVE');
  assert.equal(state.visitors[0].seat, 0);
  assert.equal(state.visitors[0].isNpc, false);
  assert.equal(state.visitors[0].prayer, '');
  assert.equal(state.totalCoins, 0);
});
