'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../server');
const { defaultHostConfig, updateHostConfig } = require('../server/host-config');

test('cấu hình host: chuẩn hóa TikTok, link nhạc và giới hạn các kênh âm thanh', () => {
  const initial = defaultHostConfig();
  const next = updateHostConfig(initial, { tiktokUsername: 'https://www.tiktok.com/@temple_test/live', music: { url: 'https://youtu.be/M7lc1UVf-VE', volume: 0, duck: false }, audio: { volume: 95, rate: 1.2, bellVolume: 0 } });
  assert.equal(next.tiktokUsername, 'temple_test');
  assert.equal(next.music.volume, 0);
  assert.equal(next.audio.volume, 95);
  assert.equal(next.audio.bellVolume, 0);
  assert.equal(initial.music.volume, 12);
  for (const patch of [{ tiktokUsername: '<script>' }, { music: { url: 'https://youtube.com.evil.test/watch?v=M7lc1UVf-VE' } }, { music: { url: 'https://www.youtube.com/playlist?list=PLtest' } }, { audio: { volume: 101 } }, { audio: { rate: 0 } }, { audio: { bellVolume: -1 } }, { music: { volume: '50' } }]) assert.throws(() => updateHostConfig(next, patch));
  assert.equal(next.audio.volume, 95);
});

test('trang admin riêng, API yêu cầu đăng nhập và lưu cấu hình qua lần khởi động', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tinh-tam-admin-'));
  const dataFile = path.join(dir, 'temple.json');
  let app = createApp({ adminToken: 'admin-config-test', dataFile, simulate: false });
  t.after(() => {
    app.close();
    const resolved = path.resolve(dir);
    if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('tinh-tam-admin-')) fs.rmSync(resolved, { recursive: true, force: true });
  });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  let base = `http://127.0.0.1:${app.server.address().port}`;
  const html = await fetch(`${base}/admin`).then(r => r.text());
  assert.match(html, /id="admin-music-form"/);
  assert.match(html, /id="admin-login-form"/);
  assert.doesNotMatch(await fetch(`${base}/overlay`).then(r => r.text()), /youtube-music|gift-speaker|admin-music-form/);
  assert.equal((await fetch(`${base}/api/admin/config`)).status, 401);
  const headers = { 'Content-Type': 'application/json', 'x-admin-token': 'admin-config-test' };
  const patch = { tiktokUsername: '@temple_test', music: { url: 'https://youtu.be/M7lc1UVf-VE', volume: 17, loop: false }, audio: { volume: 90, rate: 1.1, bellVolume: 35 } };
  const response = await fetch(`${base}/api/admin/config`, { method: 'POST', headers, body: JSON.stringify(patch) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).config.tiktokUsername, 'temple_test');
  assert.equal((await fetch(`${base}/api/admin/config`, { method: 'POST', headers, body: JSON.stringify({ music: { volume: 500 } }) })).status, 400);
  const publicState = await fetch(`${base}/api/state`).then(r => r.json());
  assert.equal(publicState.config, undefined);
  app.close();
  app = createApp({ adminToken: 'admin-config-test', dataFile, simulate: false });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${app.server.address().port}`;
  const saved = await fetch(`${base}/api/admin/config`, { headers }).then(r => r.json());
  assert.equal(saved.config.music.volume, 17);
  assert.equal(saved.config.music.loop, false);
  assert.equal(saved.config.audio.volume, 90);
  assert.equal(saved.config.audio.rate, 1.1);
  assert.equal(saved.config.audio.bellVolume, 35);
  assert.equal(saved.config.tiktokUsername, 'temple_test');
});
