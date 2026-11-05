'use strict';
(() => {
  const overlay = document.body.classList.contains('overlay-page');
  const { icon, escape, number, time } = window.TempleUtils;
  const $ = id => document.getElementById(id);
  let state = null;
  let authenticated = false;
  let connected = false;
  let feedSignature = '';
  let leadersSignature = '';
  let ledgerSignature = '';
  let toastTimer;
  let resetDemo = false;
  let settingsInitialized = false;
  let sound = false;
  let audioContext;
  let voices = [];
  let currentUtterance;
  let audioChannel;
  const tabId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  function getPreference(key, fallback) { try { return localStorage.getItem(`tinh-tam-${key}`) ?? fallback; } catch { return fallback; } }
  function setPreference(key, value) { try { localStorage.setItem(`tinh-tam-${key}`, value); } catch { /* Private browser storage. */ } }
  function toast(message) {
    if (overlay) return;
    $('toast').textContent = message;
    $('toast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('show'), 4200);
  }
  function errorMessage(error) {
    if (!overlay && $('host-dialog').open) $('dialog-error').textContent = error.message;
    else toast(error.message);
  }
  async function api(route, data) {
    let response;
    try {
      response = await fetch(`/api/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data || {}) });
    } catch { throw new Error('Chưa kết nối được máy chủ. Vui lòng thử lại khi chánh điện nối lại.'); }
    const body = await response.json();
    if (!response.ok) {
      if (response.status === 401 && route !== 'login') { authenticated = false; syncAuth(); }
      throw new Error(body.error || 'Chưa thực hiện được thao tác.');
    }
    return body;
  }
  function setText(id, text) { const el = $(id); if (el && el.textContent !== String(text)) el.textContent = text; }
  function updateDashboard(s) {
    const demo = s.mode === 'demo';
    const live = s.mode === 'live';
    setText('mode-label', demo ? 'CHẾ ĐỘ TRẢI NGHIỆM' : live ? 'TIKTOK LIVE ĐÃ KẾT NỐI' : 'CHỜ KẾT NỐI TIKTOK');
    setText('session-status', demo ? 'Trải nghiệm' : live ? 'Đang trực tiếp' : 'Chưa kết nối');
    setText('visitor-count', number(s.visitorCount));
    setText('merit-count', number(s.merits));
    setText('goal-fraction', `${number(s.totalCoins)} / ${number(s.settings.goal)} xu`);
    $('goal-progress').style.width = `${Math.min(100, s.totalCoins / s.settings.goal * 100)}%`;
    setText('goal-note', demo ? 'Số liệu trải nghiệm · Quà mô phỏng.' : `Đang có ${number(s.viewerCount)} người xem TikTok · Cảm ơn từng tấm lòng.`);
    setText('phase-name', s.phase.name);
    setText('phase-description', s.phase.description);
    setText('phase-command', s.phase.command);
    setText('phase-remaining', time(s.phase.remaining));
    setText('activity-label', demo ? 'Trải nghiệm' : 'Trực tiếp');
    setText('connection-detail', s.connection.message);
    $('offering-form').hidden = !demo;
    $('live-gift-note').hidden = demo;
    $('send-prayer').hidden = !demo;
    setText('offer-description', demo ? 'Thử tặng quà để thấy tên và lời chúc của bạn trên chánh điện.' : 'Gửi quà ngay trong TikTok LIVE để được ghi tên và nhận lời chúc.');
    const link = $('tiktok-live-link');
    link.hidden = !s.connection.username;
    if (s.connection.username) link.href = `https://www.tiktok.com/@${encodeURIComponent(s.connection.username)}/live`;
    setText('footer-connection', connected ? `Đã kết nối chánh điện · ${demo ? 'Dữ liệu trải nghiệm' : live ? 'Đang nhận sự kiện TikTok' : 'Chờ kênh TikTok lên live'}` : 'Đang kết nối lại chánh điện…');
    $('connection-dot').style.background = connected ? (live ? '#b9d29e' : demo ? '#bda568' : '#c79b67') : '#c68564';
    const fs = JSON.stringify(s.feed);
    if (fs !== feedSignature) {
      feedSignature = fs;
      $('activity-feed').innerHTML = s.feed.length ? s.feed.slice(0, 10).map(item => `<div class="activity-item ${escape(item.type)}"><span class="activity-icon">${icon(item.type === 'gift' ? 'gift' : item.type === 'prayer' ? 'lotus' : 'heart')}</span><div class="activity-content"><time>${new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(item.at)}</time><strong>${escape(item.name)}</strong><p>${escape(item.message)}</p></div></div>`).join('') : '<div class="empty-state">Chánh điện đang chờ những vị khách hữu duyên đầu tiên.</div>';
    }
    const ls = JSON.stringify(s.donors);
    if (ls !== leadersSignature) {
      leadersSignature = ls;
      $('leaderboard').innerHTML = s.donors.length ? s.donors.slice(0, 5).map((p, i) => `<div class="leader-row"><span class="rank">${i + 1}</span><span class="avatar-circle" style="filter:hue-rotate(${p.hue * 10}deg)">${escape(p.name.trim()[0])}</span><div class="leader-info"><b>${escape(p.name)}</b><small>${i === 0 ? 'Tấm lòng vàng' : 'Gieo duyên an lành'}</small></div><span class="leader-coins">${number(p.coins)}<small>xu</small></span></div>`).join('') : '<div class="empty-state">Mỗi món quà đều được trân trọng.<br>Chưa có quà tặng trong phiên này.</div>';
    }
    const gs = JSON.stringify(s.gifts);
    if (gs !== ledgerSignature) {
      ledgerSignature = gs;
      $('gift-ledger').innerHTML = s.gifts.length ? s.gifts.map(g => `<tr><td>${escape(g.name)}</td><td>${number(g.coins)} xu</td><td>${escape(g.blessing)}</td><td>${new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(g.at)}</td></tr>`).join('') : '<tr><td colspan="4" style="text-align:center;padding:38px">Chưa có quà tặng mới trong phiên. Mọi tấm lòng đều được trân trọng.</td></tr>';
    }
    setText('ledger-summary', `${number(s.totalCoins)} xu kết duyên · ${number(s.visitorCount)} khách hữu duyên${demo ? ' · DỮ LIỆU TRẢI NGHIỆM' : ''}`);
    if (!settingsInitialized) fillSettings(s.settings);
  }
  const source = new EventSource('/api/stream');
  source.addEventListener('state', event => {
    try {
      state = JSON.parse(event.data);
      connected = true;
      window.TempleScene.connected(true);
      window.TempleScene.update(state);
      if (!overlay) updateDashboard(state);
      else $('overlay-disconnected').hidden = true;
    } catch (err) { console.error('Không cập nhật được chánh điện:', err); }
  });
  source.addEventListener('gift', event => window.TempleScene.gift(JSON.parse(event.data)));
  source.addEventListener('banner', event => window.TempleScene.banner(JSON.parse(event.data)));
  source.addEventListener('incense', event => window.TempleScene.incense(JSON.parse(event.data)));
  source.addEventListener('incense-clear', () => window.TempleScene.clearIncense());
  source.addEventListener('reset', () => { window.TempleScene.reset(); feedSignature = ''; leadersSignature = ''; ledgerSignature = ''; });
  source.addEventListener('bell', () => { if (!overlay) bell(); });
  source.onerror = () => {
    connected = false;
    window.TempleScene.connected(false);
    if (overlay) $('overlay-disconnected').hidden = false;
    else { setText('footer-connection', 'Mất kết nối máy chủ · Đang tự kết nối lại…'); setText('mode-label', 'ĐANG KẾT NỐI LẠI MÁY CHỦ'); $('connection-dot').style.background = '#c68564'; }
  };
  // Sound only runs in a dashboard that was explicitly enabled by a user gesture.
  if (overlay) return;
  function fillSettings(settings) {
    $('setting-title').value = settings.title;
    $('setting-subtitle').value = settings.subtitle;
    $('setting-goal').value = settings.goal;
    $('setting-interval').value = settings.bannerInterval;
    $('setting-duration').value = settings.giftSeconds;
    $('setting-banners').checked = settings.bannerEnabled;
    settingsInitialized = true;
  }
  function syncAuth() {
    $('login-form').hidden = authenticated;
    $('host-controls').hidden = !authenticated;
    $('host-button').classList.toggle('authenticated', authenticated);
    $('dialog-error').textContent = '';
  }
  function openHost() {
    syncAuth();
    if (state) fillSettings(state.settings);
    $('host-dialog').showModal();
  }
  $('today-date').textContent = new Intl.DateTimeFormat('vi-VN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
  $('overlay-url').value = `${location.origin}/overlay`;
  fetch('/api/session').then(r => r.json()).then(s => { authenticated = s.authenticated; syncAuth(); }).catch(() => {});
  document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => {
    const tab = button.dataset.tab;
    ['temple', 'merit', 'guide'].forEach(name => { $(`${name}-tab`).hidden = tab !== name; });
    document.querySelectorAll('.main-nav [data-tab]').forEach(nav => { nav.classList.toggle('active', nav.dataset.tab === tab); nav.setAttribute('aria-current', nav.dataset.tab === tab ? 'page' : 'false'); });
    if (window.innerWidth < 650) window.scrollTo({ top: 0, behavior: 'smooth' });
  }));
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => {
    if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); }
  }));
  $('host-button').addEventListener('click', openHost);
  document.querySelectorAll('[data-host-tab]').forEach(button => button.addEventListener('click', () => {
    const name = button.dataset.hostTab;
    ['connection', 'settings', 'audio'].forEach(tab => { $(`host-${tab}`).hidden = tab !== name; });
    document.querySelectorAll('[data-host-tab]').forEach(b => b.classList.toggle('active', b === button));
    $('dialog-error').textContent = '';
  }));
  const submitHandler = (id, callback) => $(id).addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.target.querySelector('[type=submit]');
    if (button) button.disabled = true;
    $('dialog-error').textContent = '';
    try { await callback(event); } catch (err) { errorMessage(err); }
    finally { if (button) button.disabled = false; }
  });
  submitHandler('login-form', async () => {
    await api('login', { token: $('host-token').value });
    $('host-token').value = '';
    authenticated = true; syncAuth(); toast('Đã mở bảng điều khiển host.');
  });
  submitHandler('offering-form', async () => {
    if (!connected) throw new Error('Chánh điện đang nối lại. Bạn thử gửi quà sau nhé.');
    const name = $('offering-name').value.trim();
    if (!name) throw new Error('Bạn nhập tên hữu duyên trước nhé.');
    const coins = Number(document.querySelector('input[name=coins]:checked').value);
    await api('demo', { type: 'gift', name, coins });
    toast('Đã gửi quà trải nghiệm. Tên và lời chúc sẽ lần lượt xuất hiện trên chánh điện.');
  });
  $('send-prayer').addEventListener('click', async () => {
    try {
      await api('demo', { type: 'chat', name: $('offering-name').value.trim() || 'Bạn hữu duyên', text: 'Chúc mọi người bình an 🙏' });
      toast('Một lời bình an đã được gửi đi. Cảm ơn bạn hữu duyên!');
    } catch (err) { errorMessage(err); }
  });
  submitHandler('connect-form', async () => {
    await api('connect', { username: $('tiktok-username').value });
    toast('Đang kết nối kênh TikTok. Trạng thái sẽ cập nhật tại đây.');
  });
  $('disconnect-button').addEventListener('click', async () => { try { await api('disconnect'); toast('Đã ngắt TikTok. Sổ công đức của phiên được giữ lại.'); } catch (err) { errorMessage(err); } });
  submitHandler('host-settings', async () => {
    await api('settings', { title: $('setting-title').value, subtitle: $('setting-subtitle').value, goal: Number($('setting-goal').value), bannerInterval: Number($('setting-interval').value), giftSeconds: Number($('setting-duration').value), bannerEnabled: $('setting-banners').checked });
    toast('Đã lưu cài đặt và cập nhật mọi màn hình chánh điện.');
  });
  $('announce-button').addEventListener('click', async () => { try { await api('announce', { message: $('custom-banner').value }); toast('Lời chúc đang hiển thị trên chánh điện.'); } catch (err) { errorMessage(err); } });
  $('logout-button').addEventListener('click', async () => { try { await api('logout'); authenticated = false; syncAuth(); toast('Đã đăng xuất host.'); } catch (err) { errorMessage(err); } });
  function confirmReset(demo) {
    resetDemo = demo;
    $('confirm-description').textContent = `Sổ công đức và danh sách người xem hiện tại sẽ được xóa. TikTok sẽ ngắt kết nối. ${demo ? 'Bắt đầu lại với dữ liệu mô phỏng.' : 'Chánh điện sẽ chờ kết nối kênh TikTok của bạn.'}`;
    $('confirm-dialog').showModal();
  }
  $('reset-live').addEventListener('click', () => confirmReset(false));
  $('reset-demo').addEventListener('click', () => confirmReset(true));
  $('confirm-reset').addEventListener('click', async () => {
    const button = $('confirm-reset'); button.disabled = true;
    try { await api('reset', { confirm: 'RESET', demo: resetDemo }); $('confirm-dialog').close(); toast(resetDemo ? 'Đã mở phiên trải nghiệm mới.' : 'Đã mở phiên thật mới. Bạn có thể kết nối TikTok.'); }
    catch (err) { $('confirm-dialog').close(); errorMessage(err); }
    finally { button.disabled = false; }
  });
  $('copy-overlay').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('overlay-url').value); toast('Đã sao chép đường dẫn overlay.'); }
    catch { $('overlay-url').focus(); $('overlay-url').select(); toast('Đã chọn đường dẫn. Nhấn Ctrl+C để sao chép.'); }
  });
  $('fullscreen-button').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if ($('temple-scene').requestFullscreen) await $('temple-scene').requestFullscreen();
      else window.open('/overlay', '_blank', 'noopener');
    } catch { toast('Trình duyệt chưa cho phép toàn màn hình. Bạn có thể mở overlay ở tab riêng.'); }
  });
  function stopSpeech() { if ('speechSynthesis' in window) speechSynthesis.cancel(); currentUtterance = null; }
  function audioStatus(message) { setText('audio-status', message); }
  function setSound(on) {
    sound = on;
    $('sound-button').innerHTML = icon(on ? 'volume' : 'muted');
    $('sound-button').setAttribute('aria-pressed', String(on));
    $('sound-button').setAttribute('aria-label', on ? 'Tắt âm thanh' : 'Bật âm thanh');
    $('sound-button').title = on ? 'Tắt âm thanh' : 'Bật âm thanh';
    setText('sound-label', on ? 'Âm thanh đã bật' : 'Âm thanh đang tắt');
    $('audio-enable').innerHTML = `${on ? 'Tắt âm thanh' : 'Bật âm thanh'}${icon(on ? 'muted' : 'volume')}`;
    if (!on) { stopSpeech(); if (audioContext?.state === 'running') audioContext.suspend(); }
  }
  async function enableSound() {
    if (sound) { setSound(false); audioStatus('Âm thanh đang tắt.'); return; }
    try {
      const AudioClass = window.AudioContext || window.webkitAudioContext;
      if (AudioClass) { audioContext ||= new AudioClass(); await audioContext.resume(); }
      setSound(true);
      audioChannel?.postMessage({ type: 'speaker', id: tabId });
      bell(true);
      if (!('speechSynthesis' in window)) audioStatus('Đã bật tiếng chuông. Trình duyệt này chưa hỗ trợ đọc lời chúc.');
      else audioStatus(voices.some(v => v.lang.toLowerCase().startsWith('vi')) ? 'Đã bật âm thanh. Có sẵn giọng Việt.' : 'Đã bật âm thanh. Chưa tìm thấy giọng Việt; vui lòng chọn hoặc cài giọng Việt trong trình duyệt.');
    } catch { setSound(false); toast('Chưa bật được âm thanh. Bạn thử lại trên Chrome hoặc Edge nhé.'); }
  }
  function bell(force = false) {
    if (!sound || !audioContext || (!force && !$('bell-enabled').checked)) return;
    const start = audioContext.currentTime;
    const volume = Number($('voice-volume').value) * .15;
    [396, 792, 1189, 1590].forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(.0002, volume / (index + 1)), start + .015);
      gain.gain.exponentialRampToValueAtTime(.0001, start + 3.5 + index * .3);
      oscillator.connect(gain); gain.connect(audioContext.destination);
      oscillator.start(start); oscillator.stop(start + 5);
    });
  }
  function speak(text) {
    if (!sound || !$('voice-enabled').checked) return;
    if (!('speechSynthesis' in window)) { audioStatus('Trình duyệt chưa hỗ trợ đọc lời chúc.'); return; }
    stopSpeech();
    const utterance = new SpeechSynthesisUtterance(text);
    const selected = $('voice-select').value;
    const voice = voices.find(v => v.voiceURI === selected) || voices.find(v => v.lang.toLowerCase().startsWith('vi'));
    if (!voice) { audioStatus('Chưa có giọng đọc phù hợp. Chọn giọng trong danh sách hoặc cài giọng tiếng Việt.'); return; }
    utterance.voice = voice; utterance.lang = voice.lang;
    utterance.volume = Number($('voice-volume').value); utterance.rate = .9; utterance.pitch = 1;
    utterance.onstart = () => audioStatus('Đang đọc lời chúc…');
    utterance.onend = () => { if (currentUtterance === utterance) { currentUtterance = null; audioStatus('Sẵn sàng đọc lời chúc tiếp theo.'); } };
    utterance.onerror = event => { if (!['interrupted', 'canceled'].includes(event.error)) { audioStatus(`Chưa đọc được lời chúc (${event.error}). Kiểm tra giọng đọc và âm thanh trình duyệt.`); toast('Giọng đọc gặp lỗi. Bạn kiểm tra trong phần Âm thanh nhé.'); } };
    currentUtterance = utterance; speechSynthesis.speak(utterance);
  }
  function loadVoices() {
    if (!('speechSynthesis' in window)) return;
    voices = speechSynthesis.getVoices();
    const selected = getPreference('voice', '');
    const vietnamese = voices.filter(v => v.lang.toLowerCase().startsWith('vi'));
    const others = voices.filter(v => !v.lang.toLowerCase().startsWith('vi'));
    $('voice-select').innerHTML = '<option value="">Tự chọn giọng Việt</option>' + [...vietnamese, ...others].map(v => `<option value="${escape(v.voiceURI)}">${escape(v.name)} (${escape(v.lang)})</option>`).join('');
    if (voices.some(v => v.voiceURI === selected)) $('voice-select').value = selected;
  }
  $('voice-volume').value = Math.min(1, Math.max(0, Number(getPreference('volume', '.8')) || 0));
  setText('volume-value', `${Math.round(Number($('voice-volume').value) * 100)}%`);
  $('voice-enabled').checked = getPreference('speech', 'true') === 'true';
  $('bell-enabled').checked = getPreference('bell', 'true') === 'true';
  $('voice-volume').addEventListener('input', () => { setText('volume-value', `${Math.round(Number($('voice-volume').value) * 100)}%`); setPreference('volume', $('voice-volume').value); });
  $('voice-select').addEventListener('change', () => setPreference('voice', $('voice-select').value));
  $('voice-enabled').addEventListener('change', () => { setPreference('speech', $('voice-enabled').checked); if (!$('voice-enabled').checked) stopSpeech(); });
  $('bell-enabled').addEventListener('change', () => setPreference('bell', $('bell-enabled').checked));
  $('sound-button').addEventListener('click', enableSound);
  $('audio-enable').addEventListener('click', enableSound);
  $('audio-test').addEventListener('click', async () => {
    if (!sound) await enableSound();
    speak('Nam mô A Di Đà Phật. Chúc bạn và gia đình thân tâm an lạc, mọi điều thuận duyên.');
  });
  window.addEventListener('temple:gift-display', event => {
    const gift = event.detail;
    bell();
    speak(`Cảm ơn ${gift.name} đã gửi ${gift.coins} xu kết duyên. ${gift.blessing}`);
  });
  window.addEventListener('temple:reset', stopSpeech);
  if ('speechSynthesis' in window) { speechSynthesis.addEventListener('voiceschanged', loadVoices); loadVoices(); }
  if ('BroadcastChannel' in window) {
    audioChannel = new BroadcastChannel('tinh-tam-vien-audio');
    audioChannel.onmessage = event => { if (event.data?.type === 'speaker' && event.data.id !== tabId && sound) { setSound(false); toast('Âm thanh đã chuyển sang tab quản lý khác.'); } };
  }
  window.addEventListener('pagehide', () => { stopSpeech(); source.close(); audioChannel?.close(); });
})();
