// Optional real-browser integration check. Uses installed Edge/Chrome and Node's CDP WebSocket.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { createApp } = require('../server');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, 'artifacts');
await fs.mkdir(artifacts, { recursive: true });
const profile = path.join(artifacts, `edge-qa-${Date.now()}`);
const app = createApp({ adminToken: 'browser-qa-only', persist: false, simulate: false });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.server.address().port}`;
console.log(`QA server ready: ${base}`);
const executable = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let stderr = '';
browser.stderr.on('data', b => { stderr += b; });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws;
try {
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); if (port) break; } catch { /* Browser starting. */ }
    if (browser.exitCode !== null) throw new Error(`Browser exited: ${stderr.slice(-1500)}`);
    await delay(100);
  }
  if (!port) throw new Error(`Browser did not start: ${stderr.slice(-1500)}`);
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(8000) }).then(r => r.json());
  console.log('QA browser ready');
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let sequence = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener('message', message => {
    const event = JSON.parse(message.data);
    if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails.text + ': ' + event.params.exceptionDetails.exception?.description);
    if (event.id && pending.has(event.id)) {
      const handler = pending.get(event.id); pending.delete(event.id);
      if (event.error) handler.reject(new Error(JSON.stringify(event.error))); else handler.resolve(event.result);
    }
  });
  function cdp(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timed out: ${method}`)); }, 15000);
      pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  async function until(expression, description) {
    for (let i = 0; i < 60; i++) { if (await evaluate(expression)) return; await delay(100); }
    if (description === 'New gift speech from SSE') console.log(await evaluate('JSON.stringify({ spoken: window.__spoken.map(u => u.text), voice: document.getElementById("admin-voice-status").textContent, toast: document.getElementById("admin-toast").textContent, mode: document.getElementById("admin-mode").textContent, feed: document.getElementById("admin-feed").textContent, errors: window.__qaErrors })'));
    throw new Error(`Timed out: ${description}`);
  }
  async function screenshot(name, full = false) {
    const params = { format: 'png', captureBeyondViewport: true };
    if (full) {
      const { cssContentSize } = await cdp('Page.getLayoutMetrics');
      params.clip = { x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1 };
    }
    const shot = await cdp('Page.captureScreenshot', params);
    await fs.writeFile(path.join(artifacts, name), Buffer.from(shot.data, 'base64'));
  }
  await cdp('Runtime.enable');
  await cdp('Page.enable');
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: base });
  await until('document.getElementById("visitor-count")?.textContent === "24"', 'Initial SSE state');
  await evaluate('document.fonts.ready');
  await until('[...document.images].every(i => i.complete)', 'Image loading');
  await delay(500);
  await screenshot('desktop.png', true);
  assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false, 'Desktop horizontal overflow');
  assert.equal(await evaluate('document.querySelectorAll(".scene-seat .seat-cushion").length'), 24, 'Every floor seat has a cushion');
  assert.equal(await evaluate('document.querySelectorAll(".scene-honor .honor-guest").length'), 3, 'Three front cushions remain present');
  assert.equal(await evaluate('[...document.querySelectorAll(".scene-visitor")].every(el => el.getBoundingClientRect().bottom < document.getElementById("scene-source").getBoundingClientRect().top)'), true, 'Visitor rows overlap footer');
  console.log('PASS desktop render, live state, assets, no horizontal overflow');
  await evaluate('document.getElementById("offering-name").value="Kiểm thử Bình An"; document.getElementById("offering-form").requestSubmit()');
  await until('document.querySelector("#scene-gift h3").textContent === "Kiểm thử Bình An" && document.getElementById("scene-gift").classList.contains("visible")', 'Gift display');
  await until('document.querySelector(".donor-ritual img")?.complete && document.querySelector(".is-offering")', 'Donor leaves cushion holding incense');
  await screenshot('gift-announcement.png');
  assert.match(await evaluate('document.querySelector("#scene-gift .gift-wish").textContent'), /bình an|thuận duyên|an lạc|điều lành/);
  console.log('PASS gift form, SSE gift event, queued announcement, blessing');
  await evaluate('document.querySelector("[data-tab=merit]").click()');
  assert.equal(await evaluate('document.getElementById("merit-tab").hidden'), false);
  assert.match(await evaluate('document.getElementById("gift-ledger").textContent'), /Kiểm thử Bình An/);
  await evaluate('document.querySelector("[data-tab=guide]").click()');
  assert.equal(await evaluate('document.getElementById("guide-tab").hidden'), false);
  await evaluate('document.querySelector("[data-tab=temple]").click(); document.getElementById("host-button").click()');
  assert.equal(await evaluate('document.getElementById("host-dialog").open'), true);
  await evaluate('document.getElementById("host-token").value="browser-qa-only"; document.getElementById("login-form").requestSubmit()');
  await until('!document.getElementById("host-controls").hidden', 'Host login');
  await evaluate('document.getElementById("custom-banner").value="Chúc người xem live bình an."; document.getElementById("announce-button").click()');
  await until('document.querySelector("#scene-banner p").textContent === "Chúc người xem live bình an."', 'Manual banner');
  await evaluate('document.querySelector("[data-host-tab=settings]").click(); document.getElementById("setting-title").value="Chánh Điện Bình An"; document.getElementById("setting-goal").value=2000; document.getElementById("host-settings").requestSubmit()');
  await until('document.getElementById("scene-title").textContent === "CHÁNH ĐIỆN BÌNH AN"', 'Live settings sync');
  console.log('PASS navigation, ledger, host login, banner, persisted settings sync');
  await evaluate('document.getElementById("setting-title").value="Tịnh Tâm Viên"; document.getElementById("setting-goal").value=1000; document.getElementById("host-settings").requestSubmit()');
  await until('document.getElementById("scene-title").textContent === "TỊNH TÂM VIÊN"', 'Restore title');
  await evaluate('document.getElementById("host-dialog").close(); document.getElementById("toast").classList.remove("show"); window.TempleScene.reset()');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await delay(300);
  assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false, 'Mobile horizontal overflow');
  await screenshot('mobile.png', true);
  console.log('PASS mobile layout at 390 px, no horizontal overflow');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1080, height: 1920, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: `${base}/overlay` });
  await until('document.getElementById("scene-title")?.textContent === "TỊNH TÂM VIÊN"', 'Overlay state');
  await delay(500);
  await screenshot('overlay-1080x1920.png');
  assert.equal(await evaluate('document.getElementById("scene-gift").classList.contains("visible")'), false, 'No historical gift replay after opening overlay');
  assert.equal(await evaluate('Math.round(document.getElementById("temple-scene").getBoundingClientRect().height)'), 1920);
  assert.equal(await evaluate('[...document.querySelectorAll(".scene-visitor")].every(el => el.getBoundingClientRect().bottom < document.getElementById("scene-source").getBoundingClientRect().top)'), true, 'Overlay visitor rows overlap footer');
  assert.equal(errors.length, 0, `Browser runtime errors: ${errors.join('\n')}`);
  console.log('PASS 1080 × 1920 overlay, shared state, no gift replay, zero browser exceptions');
  app.bridge._forward('member', { common: { msgId: 'qa-member-join' }, user: { userId: 'qa-join', nickname: 'Khách vừa vào LIVE', uniqueId: 'qa_live_join' } });
  await until('document.querySelector(".scene-seat [data-person-id=tt-qa-join]") !== null', 'TikTok member gets a cushion without a comment');
  assert.equal(await evaluate('document.querySelector("[data-person-id=tt-qa-join] .visitor-name").textContent'), 'Khách vừa vào LIVE', 'Real display name appears under the seated character');
  await until('document.querySelector("[data-person-id=tt-qa-join] img")?.complete', 'New viewer character loads');
  assert.equal(await evaluate('getComputedStyle(document.querySelector("[data-person-id=tt-qa-join] img")).opacity'), '1', 'New viewer is seated and visible');
  await screenshot('viewer-arrival-1080x1920.png');
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await evaluate('fetch("/api/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Kiểm thử Bình An", coins: 10 }) }).then(r => r.json())');
  await until('document.querySelector(".donor-ritual img")?.complete', 'Incense procession animation');
  await delay(4500);
  assert.equal(await evaluate('document.querySelector(".donor-ritual").getBoundingClientRect().top < innerHeight * .68'), true, 'Donor reaches the altar');
  await screenshot('incense-offering-1080x1920.png');
  console.log('PASS visible cushions, join without chat, donation incense procession reaches altar');
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  // Exercise the actual admin UI against deterministic browser media adapters.
  // This checks wiring and ducking without playing sound on the user's computer.
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `
    if (location.pathname === '/admin') {
      window.__spoken = []; window.__musicCalls = [];
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
        getVoices: () => [{ lang: 'vi-VN', voiceURI: 'qa-vi', name: 'Tiếng Việt kiểm thử' }],
        resume() {}, cancel() {}, addEventListener() {}, speak(u) { window.__spoken.push(u); }
      } });
      window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
      window.YT = { Player: class {
        constructor(target, options) { this.options = options; window.__testPlayer = this;
          const frame = document.getElementById(target); frame.textContent = 'Trình phát kiểm thử'; frame.style.height = '270px';
          queueMicrotask(() => options.events.onReady({ target: this }));
        }
        setVolume(n) { window.__musicCalls.push(['volume', n]); }
        unMute() {}
        loadVideoById(id) { window.__musicCalls.push(['load', id]); this.options.events.onStateChange({ data: 1 }); }
        playVideo() { window.__musicCalls.push(['play']); this.options.events.onStateChange({ data: 1 }); }
        pauseVideo() { window.__musicCalls.push(['pause']); this.options.events.onStateChange({ data: 2 }); }
        stopVideo() { window.__musicCalls.push(['stop']); }
        seekTo(n) { window.__musicCalls.push(['seek', n]); }
        destroy() {}
      } };
    }
  ` });
  await evaluate('fetch("/api/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then(r => r.json())');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: `${base}/admin` });
  await until('document.getElementById("admin-login-form") && !document.getElementById("admin-login").hidden', 'Separate admin login');
  await screenshot('admin-login.png');
  await evaluate('document.getElementById("admin-token").value="browser-qa-only"; document.getElementById("admin-login-form").requestSubmit()');
  await until(`!document.getElementById("admin-workspace").hidden && document.getElementById("admin-visitors").textContent === "${app.temple.players.size}"`, 'Admin authenticated state');
  await evaluate('document.fonts.ready');
  await until('document.getElementById("admin-overlay-preview").contentDocument?.getElementById("scene-title")?.textContent === "TỊNH TÂM VIÊN"', 'Admin live overlay preview');
  assert.equal(await evaluate('[...document.scripts].every(script => !script.src.includes("youtube.com")) && window.__musicCalls.length === 0'), true, 'No YouTube loading or autoplay on open');
  assert.equal(await evaluate('window.__spoken.length'), 0, 'Admin does not read historical gifts');
  await screenshot('admin-desktop.png', true);
  await evaluate('window.__beforeGuests = { visitors: document.getElementById("admin-visitors").textContent, coins: document.getElementById("admin-coins").textContent }; document.getElementById("admin-add-guests").click()');
  await until('/^[23] \\/ 12/.test(document.getElementById("admin-guest-count").textContent)', 'Admin adds 2 or 3 virtual guests');
  await until('document.getElementById("admin-overlay-preview").contentDocument?.querySelectorAll(".ambient-ritual").length >= 2', 'Virtual guests offer incense on overlay');
  assert.equal(await evaluate('document.getElementById("admin-visitors").textContent === window.__beforeGuests.visitors && document.getElementById("admin-coins").textContent === window.__beforeGuests.coins'), true, 'Guests do not inflate viewer count or gifts');
  assert.equal(await evaluate('window.__spoken.length'), 0, 'Virtual guests do not trigger donation speech');
  await screenshot('admin-virtual-guests.png');
  await evaluate('fetch("/api/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Kiểm thử Bình An", coins: 1 }) }).then(r => r.json())');
  await until('document.getElementById("admin-overlay-preview").contentDocument?.querySelector(".donor-ritual") && document.getElementById("admin-overlay-preview").contentDocument?.querySelectorAll(".ambient-ritual").length === 0', 'Donation has priority over ambient incense');
  await evaluate('document.getElementById("admin-clear-guests").click()');
  await until('document.getElementById("admin-guest-count").textContent === "0 / 12 khách phụ" && document.getElementById("admin-overlay-preview").contentDocument?.querySelectorAll(".ambient-ritual").length === 0', 'Clear virtual guests and ritual');
  assert.equal(await evaluate('!!document.getElementById("admin-overlay-preview").contentDocument?.querySelector(".donor-ritual")'), true, 'Clearing NPCs preserves donation procession');
  console.log('PASS admin adds 2–3 labeled virtual guests, incense effects, isolated counters and clear control');
  await evaluate('document.getElementById("admin-tiktok-id").value="@temple_qa"; document.getElementById("admin-save-id").click()');
  await until('document.getElementById("admin-tiktok-id").value === "temple_qa"', 'Save normalized TikTok ID');
  await evaluate('document.getElementById("admin-music-url").value="https://youtu.be/M7lc1UVf-VE"; document.getElementById("admin-music-form").requestSubmit()');
  await until('window.__musicCalls.some(c => c[0] === "load" && c[1] === "M7lc1UVf-VE")', 'Admin music play');
  await evaluate('document.getElementById("admin-music-volume").value=36; document.getElementById("admin-music-volume").dispatchEvent(new Event("input")); document.getElementById("admin-voice-volume").value=70; document.getElementById("admin-voice-volume").dispatchEvent(new Event("input")); document.getElementById("admin-voice-rate").value=1.1; document.getElementById("admin-voice-rate").dispatchEvent(new Event("input"))');
  await until('fetch("/api/admin/config").then(r=>r.json()).then(d=>d.config.music.volume === 36 && d.config.audio.volume === 70 && d.config.audio.rate === 1.1)', 'Save independent music and voice controls');
  await evaluate('document.getElementById("admin-voice-toggle").click()');
  await until('document.getElementById("admin-voice-toggle").getAttribute("aria-pressed") === "true"', 'Enable voice');
  await evaluate('document.getElementById("admin-test-name").value="Host Bình An"; document.getElementById("admin-test-gift").click()');
  await until('window.__spoken.length === 1 && /Host Bình An/.test(window.__spoken[0].text)', 'New gift speech from SSE');
  assert.equal(await evaluate('window.__spoken[0].volume'), .7);
  assert.equal(await evaluate('window.__musicCalls.filter(c=>c[0] === "volume").at(-1)[1]'), 9, 'Music ducks to 25 percent');
  await evaluate('window.__spoken[0].onend()');
  assert.equal(await evaluate('window.__musicCalls.filter(c=>c[0] === "volume").at(-1)[1]'), 36, 'Music restores after speech');
  await evaluate('document.getElementById("admin-music-pause").click()');
  await until('window.__musicCalls.at(-1)[0] === "pause"', 'Pause music');
  await evaluate('document.getElementById("admin-music-stop").click()');
  await until('window.__musicCalls.at(-1)[0] === "stop"', 'Stop music');
  console.log('PASS admin login, remembered TikTok ID, independent sliders, YouTube controls, voice queue and music ducking (media adapters)');
  await cdp('Page.reload');
  await until('!document.getElementById("admin-workspace")?.hidden && document.getElementById("admin-music-volume")?.value === "36"', 'Restore admin preferences after reload');
  assert.equal(await evaluate('document.getElementById("admin-voice-volume").value'), '70');
  assert.equal(await evaluate('document.getElementById("admin-tiktok-id").value'), 'temple_qa');
  assert.equal(await evaluate('document.getElementById("admin-voice-toggle").getAttribute("aria-pressed")'), 'false');
  assert.equal(await evaluate('window.__spoken.length === 0 && window.__musicCalls.length === 0'), true, 'No autoplay or historical speech after reload');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await delay(300);
  assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false, 'Admin mobile horizontal overflow');
  await screenshot('admin-mobile.png', true);
  await evaluate('document.getElementById("admin-logout").click()');
  await until('!document.getElementById("admin-login").hidden && document.getElementById("admin-workspace").hidden', 'Admin logout');
  assert.equal(await evaluate('fetch("/api/admin/config").then(r => r.status)'), 401);
  assert.equal(errors.length, 0, `Admin browser runtime errors: ${errors.join('\n')}`);
  console.log('PASS admin reload, no automatic sound, mobile layout, logout, zero browser exceptions');
  console.log(`Screenshots: ${artifacts}`);
  try { await cdp('Browser.close'); } catch { /* Browser already closed. */ }
} finally {
  ws?.close();
  browser.kill();
  app.close();
  const resolved = path.resolve(profile);
  if (resolved.startsWith(path.resolve(artifacts) + path.sep) && /^edge-qa-\d+$/.test(path.basename(resolved))) {
    await delay(500);
    await fs.rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
  }
}
