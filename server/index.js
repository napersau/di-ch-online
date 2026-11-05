'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Temple } = require('./temple');
const { TempleBridge, cleanUsername } = require('./tiktok');
const { defaultHostConfig, updateHostConfig } = require('./host-config');
const { deploymentConfig, validateAdminToken, allowedHost, allowedOrigin, clientAddress } = require('./deployment');

const ROOT = path.resolve(__dirname, '..');
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z_0-9]*)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined && match[2]) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
loadEnv(path.join(ROOT, '.env'));

function createApp(options = {}) {
  const env = options.env || process.env;
  const deployment = deploymentConfig(env, { port: 3001, prefix: 'CHUA_' });
  const demo = options.demo ?? (!deployment.production && !process.argv.includes('--live'));
  const dataFile = options.dataFile || path.join(env.CHUA_DATA_DIR || env.DATA_DIR || path.join(ROOT, 'data'), 'temple.json');
  const hostConfigFile = options.hostConfigFile || path.join(path.dirname(dataFile), 'host-config.json');
  let hostConfig = defaultHostConfig();
  hostConfig.tiktokUsername = cleanUsername(env.CHUA_TIKTOK_USERNAME || '');
  if (options.persist !== false) {
    try { hostConfig = updateHostConfig(hostConfig, JSON.parse(fs.readFileSync(hostConfigFile, 'utf8'))); } catch { /* No saved host configuration yet. */ }
  }
  function saveHostConfig(input) {
    const next = updateHostConfig(hostConfig, input);
    if (options.persist !== false) {
      fs.mkdirSync(path.dirname(hostConfigFile), { recursive: true });
      fs.writeFileSync(`${hostConfigFile}.tmp`, JSON.stringify(next));
      fs.renameSync(`${hostConfigFile}.tmp`, hostConfigFile);
    }
    hostConfig = next;
    return hostConfig;
  }
  const temple = new Temple({ demo });
  if (options.persist !== false) {
    try { temple.restore(JSON.parse(fs.readFileSync(dataFile, 'utf8'))); } catch { /* First run. */ }
  }
  let adminToken = options.adminToken || env.CHUA_ADMIN_TOKEN || env.ADMIN_TOKEN;
  validateAdminToken(adminToken, deployment);
  if (!adminToken) {
    const keyFile = path.join(path.dirname(dataFile), 'host-key.txt');
    try { adminToken = fs.readFileSync(keyFile, 'utf8').trim(); } catch {
      adminToken = crypto.randomBytes(24).toString('hex');
      fs.mkdirSync(path.dirname(keyFile), { recursive: true });
      fs.writeFileSync(keyFile, adminToken, { mode: 0o600 });
    }
  }
  const sessions = new Map();
  const attempts = new Map();
  const streams = new Set();
  let viewerCount = 0;
  let stopDemo = null;
  let demoStep = 0;
  let closing = false;
  const sendEvent = (type, data) => {
    const frame = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of streams) {
      if (res.writableLength > 256 * 1024) { res.destroy(); streams.delete(res); }
      else res.write(frame);
    }
  };
  const view = () => ({ ...temple.view(), viewerCount, connection: bridge.status(), overlayClients: streams.size });
  const broadcast = () => sendEvent('state', view());
  const dispatch = event => {
    const result = temple.handle(event);
    if (result.gift) sendEvent('gift', result.gift);
    if (result.bell) sendEvent('bell', {});
    if (result.ok) broadcast();
    return result;
  };
  const bridge = new TempleBridge(dispatch, {
    signApiKey: env.TIKTOK_SIGN_API_KEY || '',
    onStatus: status => {
      if (status.state === 'live') temple.mode = 'live';
      else if (temple.mode !== 'demo') temple.mode = 'offline';
      broadcast();
    }
  });
  bridge.onViewers = n => { viewerCount = n; };
  function endDemo() { if (stopDemo) clearInterval(stopDemo); stopDemo = null; }
  function startDemo() {
    endDemo();
    stopDemo = setInterval(() => {
      if (temple.mode !== 'demo') return;
      const people = [...temple.players.values()];
      if (!people.length) return;
      const p = people[(demoStep * 7) % people.length];
      const prayers = ['Nam mô A Di Đà Phật 🙏', 'Chúc cả nhà bình an', 'Một ngày thật an lành 🌸', 'thắp hương', 'bình an'];
      dispatch({ type: 'chat', user: p, text: prayers[demoStep++ % prayers.length] });
      if (demoStep % 5 === 0) dispatch({ type: 'gift', user: p, coins: [1, 10, 30, 99][demoStep % 4] });
    }, 6500);
  }
  const sha = s => crypto.createHash('sha256').update(String(s || '')).digest();
  const validToken = token => crypto.timingSafeEqual(sha(token), sha(adminToken));
  const authorized = req => {
    if (validToken(req.headers['x-admin-token'])) return true;
    const sid = (req.headers.cookie || '').match(/(?:^|;\s*)temple_session=([a-f0-9]+)/)?.[1];
    return !!sid && (sessions.get(sid) || 0) > Date.now();
  };
  const reply = (res, status, data, headers = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
    res.end(JSON.stringify(data));
  };
  async function bodyOf(req) {
    let body = '';
    for await (const chunk of req) {
      body += chunk.toString();
      if (Buffer.byteLength(body) > 16384) throw Object.assign(new Error('Nội dung quá dài.'), { status: 413 });
    }
    try { return JSON.parse(body || '{}'); } catch { throw Object.assign(new Error('JSON không hợp lệ.'), { status: 400 }); }
  }
  function save() {
    if (options.persist === false) return;
    try {
      fs.mkdirSync(path.dirname(dataFile), { recursive: true });
      fs.writeFileSync(`${dataFile}.tmp`, JSON.stringify(temple.snapshot()));
      fs.renameSync(`${dataFile}.tmp`, dataFile);
    } catch (err) { console.error('Không lưu được phiên chánh điện:', err.message); }
  }
  const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' };
  const publicDir = path.join(ROOT, 'public');
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const route = url.pathname;
      // Prevent foreign websites from operating a local host dashboard.
      if (req.method === 'GET' && route === '/healthz') return reply(res, 200, { ok: true, service: 'di-chua-online' });
      if (!options.allowRemote && !allowedHost(req, deployment)) return reply(res, 403, { error: 'Host không được phép.' });
      if (req.method === 'GET' && route === '/api/state') return reply(res, 200, view());
      if (req.method === 'GET' && route === '/api/session') return reply(res, 200, { authenticated: authorized(req) });
      if (req.method === 'GET' && route === '/api/admin/config') {
        if (!authorized(req)) return reply(res, 401, { error: 'Đăng nhập host để xem cấu hình.' });
        return reply(res, 200, { ok: true, config: hostConfig });
      }
      if (req.method === 'GET' && route === '/api/stream') {
        if (streams.size >= 40) return reply(res, 503, { error: 'Quá nhiều màn hình kết nối.' });
        res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
        res.write('retry: 2500\n\n');
        res.write(`event: state\ndata: ${JSON.stringify(view())}\n\n`);
        streams.add(res);
        req.on('close', () => streams.delete(res));
        return;
      }
      if (req.method === 'POST' && route.startsWith('/api/')) {
        if (!allowedOrigin(req, deployment)) return reply(res, 403, { error: 'Nguồn yêu cầu không hợp lệ.' });
        const body = await bodyOf(req);
        if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(res, 400, { error: 'Dữ liệu không hợp lệ.' });
        if (route === '/api/login') {
          const ip = clientAddress(req, deployment);
          const attempt = attempts.get(ip) || { count: 0, until: Date.now() + 60000 };
          if (attempt.until < Date.now()) { attempt.count = 0; attempt.until = Date.now() + 60000; }
          if (++attempt.count > 10) return reply(res, 429, { error: 'Bạn thử quá nhiều lần. Vui lòng chờ một phút.' });
          attempts.set(ip, attempt);
          if (!validToken(body.token)) return reply(res, 401, { error: 'Mật khẩu host chưa đúng.' });
          const sid = crypto.randomBytes(32).toString('hex');
          sessions.set(sid, Date.now() + 12 * 3600000);
          return reply(res, 200, { ok: true }, { 'Set-Cookie': `temple_session=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${deployment.production ? '; Secure' : ''}` });
        }
        if (route === '/api/demo' && temple.mode === 'demo') {
          const event = { type: body.type === 'chat' ? 'chat' : 'gift', user: { id: `demo-manual-${String(body.name || 'Bạn hữu duyên').slice(0, 32)}`, name: body.name || 'Bạn hữu duyên' }, text: body.text, coins: body.coins, blessing: body.blessing };
          const result = dispatch(event);
          return reply(res, result.ok ? 200 : 400, result);
        }
        if (!authorized(req)) return reply(res, 401, { error: 'Đăng nhập host để điều khiển phiên live.' });
        if (route === '/api/admin/config') return reply(res, 200, { ok: true, config: saveHostConfig(body) });
        if (route === '/api/admin/guests') {
          if (body.action === 'clear') {
            temple.clearGuests();
            sendEvent('incense-clear', {});
            broadcast();
            return reply(res, 200, { ok: true, guestCount: 0 });
          }
          if (body.action !== 'add') return reply(res, 400, { error: 'Chọn thêm hoặc dọn khách phụ.' });
          const ritual = temple.addGuests();
          broadcast();
          sendEvent('incense', ritual);
          return reply(res, 200, { ok: true, added: ritual.participants.length, guestCount: temple.guests.size });
        }
        if (route === '/api/logout') {
          const sid = (req.headers.cookie || '').match(/(?:^|;\s*)temple_session=([a-f0-9]+)/)?.[1];
          if (sid) sessions.delete(sid);
          return reply(res, 200, { ok: true }, { 'Set-Cookie': `temple_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${deployment.production ? '; Secure' : ''}` });
        }
        if (route === '/api/connect') {
          const username = cleanUsername(body.username);
          if (!username) return reply(res, 400, { error: 'Nhập @tên_kênh hoặc đường dẫn TikTok LIVE hợp lệ.' });
          saveHostConfig({ tiktokUsername: username });
          endDemo();
          if (temple.mode === 'demo') {
            const guests = new Map(temple.guests);
            temple.reset('offline');
            temple.guests = guests;
            sendEvent('reset', {});
          }
          viewerCount = 0;
          bridge.start(username);
        } else if (route === '/api/disconnect') {
          bridge.stop(); viewerCount = 0;
        } else if (route === '/api/settings') {
          temple.updateSettings(body);
        } else if (route === '/api/announce') {
          sendEvent('banner', temple.banner(body.message));
        } else if (route === '/api/events') {
          const result = dispatch(body);
          return reply(res, result.ok ? 200 : 400, result);
        } else if (route === '/api/reset') {
          if (body.confirm !== 'RESET') return reply(res, 400, { error: 'Cần xác nhận bắt đầu phiên mới.' });
          endDemo(); bridge.stop(); viewerCount = 0;
          temple.reset(body.demo ? 'demo' : 'offline');
          sendEvent('reset', {});
          if (body.demo) startDemo();
          // A demo reset also removes the previous real session from disk.
          if (options.persist !== false) { fs.mkdirSync(path.dirname(dataFile), { recursive: true }); fs.writeFileSync(dataFile, JSON.stringify(temple.snapshot())); }
        } else if (route === '/api/ban') {
          temple.banned.add(String(body.id)); temple.players.delete(String(body.id));
        } else return reply(res, 404, { error: 'Không tìm thấy chức năng.' });
        save(); broadcast();
        return reply(res, 200, { ok: true });
      }
      if (req.method !== 'GET') return reply(res, 405, { error: 'Phương thức không hỗ trợ.' });
      const pages = { '/': 'index.html', '/admin': 'admin.html', '/admin/': 'admin.html', '/overlay': 'overlay.html' };
      let relative;
      try { relative = pages[route] || decodeURIComponent(route).replace(/^\/+/, ''); } catch { return reply(res, 400, { error: 'Địa chỉ không hợp lệ.' }); }
      const file = path.resolve(publicDir, relative);
      if (!file.startsWith(publicDir + path.sep)) return reply(res, 403, { error: 'Không được truy cập.' });
      try {
        const data = await fs.promises.readFile(file);
        res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache', 'Referrer-Policy': 'same-origin' });
        res.end(data);
      } catch { return reply(res, 404, { error: 'Trang không tồn tại.' }); }
    } catch (err) { if (!res.headersSent) reply(res, err.status || 400, { error: err.message || 'Không xử lý được yêu cầu.' }); }
  });
  const tick = setInterval(() => {
    const banner = temple.tick();
    if (banner) sendEvent('banner', banner);
    broadcast();
  }, 1000);
  const persistence = setInterval(save, 10000);
  if (temple.mode === 'demo' && options.simulate !== false) startDemo();
  function close() {
    if (closing) return;
    closing = true;
    endDemo(); clearInterval(tick); clearInterval(persistence);
    bridge.stop(); save();
    for (const res of streams) res.end();
    server.close();
  }
  return { server, temple, dispatch, close, bridge, startDemo, save, deployment };
}

if (require.main === module) {
  const app = createApp();
  const { port, host, publicOrigin } = app.deployment;
  app.server.on('error', err => { console.error(err.code === 'EADDRINUSE' ? `Cổng ${port} đang được sử dụng. Đổi CHUA_PORT trong .env.` : err.message); app.close(); process.exitCode = 1; });
  app.server.listen(port, host, () => {
    const base = publicOrigin || `http://127.0.0.1:${port}`;
    console.log(`Tịnh Tâm Viên: ${base}`);
    console.log(`Overlay 9:16: ${base}/overlay`);
    console.log(`Quản trị TikTok, nhạc và giọng đọc: ${base}/admin`);
    console.log('Mật khẩu host: CHUA_ADMIN_TOKEN trong môi trường hoặc .env riêng của dự án.');
    if (process.argv.includes('--live') && process.env.CHUA_TIKTOK_USERNAME) {
      const name = cleanUsername(process.env.CHUA_TIKTOK_USERNAME);
      if (name) app.bridge.start(name);
    }
  });
  process.on('SIGINT', () => app.close());
  process.on('SIGTERM', () => app.close());
}

module.exports = { createApp };
