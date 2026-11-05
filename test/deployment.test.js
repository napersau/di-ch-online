'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const { deploymentConfig, validateAdminToken, allowedHost, allowedOrigin, clientAddress } = require('../server/deployment');
const { createApp } = require('../server');

test('PORT của hosting được ưu tiên khi production, CHUA_PORT được giữ khi chạy local', () => {
  const env = { NODE_ENV: 'production', PORT: '10000', CHUA_PORT: '3001', RENDER_EXTERNAL_URL: 'https://temple.example.com' };
  const config = deploymentConfig(env, { port: 3001, prefix: 'CHUA_' });
  assert.equal(config.port, 10000);
  assert.equal(config.host, '0.0.0.0');
  assert.equal(config.publicOrigin, 'https://temple.example.com');
  assert.equal(deploymentConfig({ PORT: '3000', CHUA_PORT: '3001' }, { port: 3001, prefix: 'CHUA_' }).port, 3001);
  assert.throws(() => validateAdminToken('short', config));
  assert.equal(allowedHost({ headers: { host: 'foreign.example.com' } }, config), false);
  assert.equal(allowedOrigin({ headers: { origin: 'https://foreign.example.com' } }, config), false);
  assert.equal(clientAddress({ headers: { 'x-forwarded-for': '198.51.100.5' }, socket: { remoteAddress: 'proxy' } }, { trustProxy: true }), '198.51.100.5');
});

test('HTTPS production: login cookie Secure, tên miền thật, chặn origin lạ và tắt dữ liệu giả', async t => {
  const token = 'production-test-token-'.repeat(3);
  const app = createApp({ env: { NODE_ENV: 'production', PORT: '10000', RENDER_EXTERNAL_URL: 'https://temple.example.com', CHUA_ADMIN_TOKEN: token }, persist: false, simulate: false });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const headers = { Host: 'temple.example.com', Origin: 'https://temple.example.com', 'Content-Type': 'application/json' };
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
  assert.equal((await fetch(`${base}/overlay`, { headers })).status, 200);
  assert.equal(app.temple.mode, 'offline');
  assert.equal(app.temple.players.size, 0);
  const login = await fetch(`${base}/api/login`, { method: 'POST', headers, body: JSON.stringify({ token }) });
  assert.equal(login.status, 200);
  assert.match(login.headers.get('set-cookie'), /; Secure/);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(`${base}/api/admin/config`, { headers: { ...headers, Cookie: cookie } })).status, 200);
  assert.equal((await fetch(`${base}/api/settings`, { method: 'POST', headers: { ...headers, Origin: 'https://foreign.example.com', Cookie: cookie }, body: '{}' })).status, 403);
  for (const [host, status] of [['temple.example.com', 200], ['foreign.example.com', 403]]) {
    const actual = await new Promise((resolve, reject) => {
      http.get(`${base}/api/state`, { headers: { Host: host } }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject);
    });
    assert.equal(actual, status);
  }
});
