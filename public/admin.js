'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const icon = name => `<svg aria-hidden="true"><use href="/assets/icons.svg#${name}"/></svg>`;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const number = n => Number(n || 0).toLocaleString('vi-VN');
  let authenticated = false;
  let stream = null;
  let state = null;
  let config = null;
  let preferredVoice = '';
  let appearanceLoaded = false;
  let feedSignature = '';
  let toastTimer;
  let saveTimer;
  let pendingPatch = {};
  let writeQueue = Promise.resolve();
  let resettingToDemo = false;
  let ownsAudio = false;
  let audioContext;
  const tabId = crypto.randomUUID();
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel('tinh-tam-vien-audio') : null;
  const music = new YouTubeMusic({ target: 'music-player', origin: location.origin, onStatus: message => {
    $('admin-music-status').textContent = message;
    $('admin-music-status').classList.toggle('error', /lỗi|không|chặn|xóa|riêng tư/i.test(message));
  } });
  const speaker = new GiftSpeaker({ onStatus: ({ enabled, speaking, queued, message }) => {
    music.setSpeaking(speaking);
    $('admin-voice-toggle').innerHTML = `${icon(enabled ? 'muted' : 'volume')}${enabled ? 'Tắt giọng đọc' : 'Bật giọng đọc'}`;
    $('admin-voice-toggle').setAttribute('aria-pressed', String(enabled));
    $('admin-voice-badge').textContent = enabled ? 'Đã bật' : 'Đang tắt';
    $('admin-voice-status').textContent = `${message}${queued ? ` · ${queued} lượt đang chờ` : ''}`;
  } });
  function toast(message, error = false) {
    clearTimeout(toastTimer);
    $('admin-toast').textContent = message;
    $('admin-toast').classList.toggle('admin-toast-error', error);
    $('admin-toast').classList.add('show');
    toastTimer = setTimeout(() => $('admin-toast').classList.remove('show'), 4500);
  }
  function stopAudio() {
    ownsAudio = false;
    speaker.stop();
    music.pause();
    if (audioContext?.state === 'running') audioContext.suspend().catch(() => {});
  }
  function lock() {
    authenticated = false;
    clearTimeout(saveTimer); pendingPatch = {};
    stream?.close(); stream = null;
    stopAudio();
    $('admin-workspace').hidden = true;
    $('admin-login').hidden = false;
    $('admin-logout').hidden = true;
    $('admin-overlay-preview').src = 'about:blank';
    $('admin-reset-dialog').close();
  }
  async function request(route, body) {
    let response;
    try {
      response = await fetch(`/api/${route}`, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(12000) });
    } catch { throw new Error('Không kết nối được máy chủ. Kiểm tra Terminal của dự án rồi thử lại.'); }
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 401 && route !== 'login' && authenticated) { lock(); toast('Phiên quản trị đã hết hạn. Đăng nhập lại để tiếp tục.', true); }
      throw new Error(result.error || 'Chưa thực hiện được thao tác.');
    }
    return result;
  }
  function savePatch(patch) {
    $('admin-save-status').textContent = 'Đang lưu cấu hình…';
    const job = writeQueue.catch(() => {}).then(() => request('admin/config', patch));
    writeQueue = job;
    return job.then(result => {
      config = result.config;
      $('admin-save-status').textContent = 'Đã lưu cấu hình';
      return result;
    }).catch(error => { $('admin-save-status').textContent = 'Chưa lưu được · Hãy thử lại'; throw error; });
  }
  function scheduleSave(section, values) {
    pendingPatch[section] = { ...(pendingPatch[section] || {}), ...values };
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 300);
  }
  function flushSave() {
    clearTimeout(saveTimer);
    if (!authenticated || !Object.keys(pendingPatch).length) return Promise.resolve();
    const patch = pendingPatch; pendingPatch = {};
    return savePatch(patch).catch(error => toast(error.message, true));
  }
  function fillConfig(value) {
    config = value;
    $('admin-tiktok-id').value = value.tiktokUsername;
    $('admin-music-url').value = value.music.url;
    $('admin-music-volume').value = value.music.volume;
    $('admin-music-volume-value').textContent = `${value.music.volume}%`;
    $('admin-music-loop').checked = value.music.loop;
    $('admin-music-duck').checked = value.music.duck;
    music.setVolume(value.music.volume); music.loop = value.music.loop; music.setDucking(value.music.duck);
    preferredVoice = value.audio.voiceURI;
    speaker.setVolume(value.audio.volume / 100); speaker.setRate(value.audio.rate);
    $('admin-voice-volume').value = value.audio.volume;
    $('admin-voice-volume-value').textContent = `${value.audio.volume}%`;
    $('admin-voice-rate').value = value.audio.rate;
    $('admin-voice-rate-value').textContent = `${value.audio.rate.toFixed(1)}×`;
    $('admin-bell-volume').value = value.audio.bellVolume;
    $('admin-bell-volume-value').textContent = `${value.audio.bellVolume}%`;
    $('admin-bell-enabled').checked = value.audio.bellEnabled;
    loadVoices();
  }
  function fillAppearance(settings) {
    for (const [id, key] of [['admin-title', 'title'], ['admin-subtitle', 'subtitle'], ['admin-goal', 'goal'], ['admin-banner-interval', 'bannerInterval'], ['admin-gift-duration', 'giftSeconds']]) $(id).value = settings[key];
    $('admin-banners-enabled').checked = settings.bannerEnabled;
    appearanceLoaded = true;
  }
  function updateState(next) {
    state = next;
    const names = { off: 'Chưa kết nối', connecting: 'Đang kết nối', retrying: 'Đang thử lại', live: 'Đang trực tiếp', error: 'Lỗi kết nối' };
    $('admin-tiktok-badge').textContent = names[next.connection.state] || 'Chưa kết nối';
    $('admin-tiktok-detail').textContent = next.connection.message;
    $('admin-tiktok-detail').classList.toggle('error', ['error', 'retrying'].includes(next.connection.state));
    $('admin-mode').textContent = next.mode === 'demo' ? 'Trải nghiệm' : next.mode === 'live' ? 'TikTok LIVE' : 'Chờ kết nối';
    $('admin-visitors').textContent = number(next.visitorCount);
    $('admin-coins').textContent = number(next.totalCoins);
    $('admin-events').textContent = number(next.connection.eventsReceived);
    $('admin-test-gift').disabled = next.mode !== 'demo';
    $('admin-guest-count').textContent = `${next.guestCount || 0} / 12 khách phụ`;
    $('admin-add-guests').disabled = (next.guestCount || 0) > 10;
    $('admin-clear-guests').disabled = !next.guestCount;
    if (!appearanceLoaded) fillAppearance(next.settings);
    const signature = JSON.stringify(next.feed);
    if (signature !== feedSignature) {
      feedSignature = signature;
      $('admin-feed').innerHTML = next.feed.length ? next.feed.slice(0, 10).map(item => `<div class="admin-feed-row"><span class="activity-icon">${icon(item.type === 'gift' ? 'gift' : 'lotus')}</span><div><time>${new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(item.at)}</time><strong>${escape(item.name)}</strong><p>${escape(item.message)}</p></div></div>`).join('') : '<p class="empty-state">Chưa có hoạt động trong phiên này.</p>';
    }
  }
  function connectStream() {
    stream?.close();
    stream = new EventSource('/api/stream');
    stream.addEventListener('state', event => {
      try {
        updateState(JSON.parse(event.data));
        $('admin-server-status').textContent = 'Đã nối với chánh điện';
        $('admin-server-dot').style.background = '#a5bf91';
      } catch (error) { console.error('Không cập nhật được trạng thái admin:', error); }
    });
    stream.addEventListener('gift', event => {
      try { const gift = JSON.parse(event.data); if (ownsAudio) { bell(); speaker.gift(gift); } } catch (error) { console.error('Không xử lý được âm thanh quà tặng:', error); }
    });
    stream.addEventListener('bell', () => bell());
    stream.addEventListener('reset', () => { speaker.clear(); feedSignature = ''; });
    stream.onerror = () => {
      speaker.clear();
      $('admin-server-status').textContent = 'Mất kết nối · Đang nối lại';
      $('admin-server-dot').style.background = '#cf986c';
    };
  }
  async function showAdmin() {
    const result = await request('admin/config');
    authenticated = true;
    fillConfig(result.config);
    $('admin-login').hidden = true;
    $('admin-workspace').hidden = false;
    $('admin-logout').hidden = false;
    $('login-error').textContent = '';
    $('admin-overlay-preview').src = '/overlay';
    appearanceLoaded = false;
    connectStream();
  }
  function claimAudio() { ownsAudio = true; channel?.postMessage({ type: 'speaker', id: tabId }); }
  async function resumeBell() {
    const AudioClass = window.AudioContext || window.webkitAudioContext;
    if (AudioClass) { audioContext ||= new AudioClass(); await audioContext.resume(); }
  }
  function bell(force = false) {
    if (!ownsAudio || !audioContext || audioContext.state !== 'running' || (!force && !$('admin-bell-enabled').checked)) return;
    const volume = Number($('admin-bell-volume').value) / 100 * 0.18;
    if (volume <= 0) return;
    const start = audioContext.currentTime;
    [396, 792, 1189, 1590].forEach((frequency, i) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume / (i + 1), start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 3.5 + i * 0.3);
      oscillator.connect(gain); gain.connect(audioContext.destination);
      oscillator.start(start); oscillator.stop(start + 5);
    });
  }
  function loadVoices() {
    const previous = $('admin-voice-select').value || preferredVoice;
    const voices = speaker.voices();
    $('admin-voice-select').replaceChildren();
    for (const voice of voices) {
      const option = document.createElement('option'); option.value = voice.voiceURI; option.textContent = voice.name;
      $('admin-voice-select').append(option);
    }
    if (voices.some(v => v.voiceURI === previous)) $('admin-voice-select').value = previous;
    if (!voices.length) { const option = document.createElement('option'); option.value = ''; option.textContent = 'Chưa tìm thấy giọng tiếng Việt'; $('admin-voice-select').append(option); }
    $('admin-voice-help').textContent = voices.length ? 'Âm lượng, tốc độ và giọng mới áp dụng từ câu tiếp theo.' : 'Mở bằng Microsoft Edge và chờ giọng tải. Nếu vẫn trống, cần bổ sung giọng tiếng Việt trong trình duyệt hoặc hệ điều hành.';
    if (speaker.enabled && $('admin-voice-select').value) speaker.voiceURI = $('admin-voice-select').value;
  }
  async function enableVoice() {
    speaker.enable($('admin-voice-select').value);
    claimAudio();
    try { await resumeBell(); } catch { /* Speech can still work without Web Audio. */ }
  }
  function onClick(id, action) {
    $(id).addEventListener('click', async () => {
      const button = $(id); button.disabled = true;
      try { await action(); } catch (error) { toast(error.message, true); }
      finally { button.disabled = (id === 'admin-test-gift' && state?.mode !== 'demo') || (id === 'admin-add-guests' && (state?.guestCount || 0) > 10) || (id === 'admin-clear-guests' && !state?.guestCount); }
    });
  }
  function onSubmit(id, action) {
    $(id).addEventListener('submit', async event => {
      event.preventDefault();
      const button = event.target.querySelector('[type=submit]'); button.disabled = true;
      try { await action(); }
      catch (error) { if (id === 'admin-login-form') $('login-error').textContent = error.message; else toast(error.message, true); }
      finally { button.disabled = false; }
    });
  }
  onSubmit('admin-login-form', async () => { await request('login', { token: $('admin-token').value }); $('admin-token').value = ''; await showAdmin(); });
  onClick('admin-logout', async () => { await flushSave(); await request('logout', {}); lock(); });
  onSubmit('admin-connect-form', async () => {
    const username = $('admin-tiktok-id').value.trim();
    if (!username) throw new Error('Nhập ID TikTok trước khi kết nối.');
    await request('connect', { username });
    toast('Đang kết nối kênh TikTok. Theo dõi trạng thái ngay bên dưới.');
  });
  onClick('admin-save-id', async () => { await savePatch({ tiktokUsername: $('admin-tiktok-id').value }); $('admin-tiktok-id').value = config.tiktokUsername; toast('Đã lưu ID TikTok cho lần mở sau.'); });
  onClick('admin-disconnect', async () => { await request('disconnect', {}); toast('Đã ngắt TikTok. Dữ liệu phiên được giữ lại.'); });
  onSubmit('admin-music-form', async () => {
    const url = $('admin-music-url').value.trim();
    if (!parseYouTubeVideo(url)) throw new Error('Dán link một video YouTube hợp lệ.');
    claimAudio();
    await Promise.all([music.play(url), savePatch({ music: { url, volume: music.volume, loop: music.loop, duck: music.duck } })]);
    resumeBell().catch(() => {});
  });
  onClick('admin-music-pause', () => music.pause());
  onClick('admin-music-stop', () => music.stop());
  const ranges = [
    ['admin-music-volume', 'music', 'volume', value => { music.setVolume(value); return `${value}%`; }],
    ['admin-voice-volume', 'audio', 'volume', value => { speaker.setVolume(value / 100); return `${value}%`; }],
    ['admin-voice-rate', 'audio', 'rate', value => { speaker.setRate(value); return `${value.toFixed(1)}×`; }],
    ['admin-bell-volume', 'audio', 'bellVolume', value => `${value}%`]
  ];
  for (const [id, section, key, apply] of ranges) {
    $(id).addEventListener('input', () => { const value = Number($(id).value); $(`${id}-value`).textContent = apply(value); scheduleSave(section, { [key]: value }); });
    $(id).addEventListener('change', flushSave);
  }
  $('admin-music-loop').addEventListener('change', () => { music.loop = $('admin-music-loop').checked; scheduleSave('music', { loop: music.loop }); });
  $('admin-music-duck').addEventListener('change', () => { music.setDucking($('admin-music-duck').checked); scheduleSave('music', { duck: music.duck }); });
  $('admin-bell-enabled').addEventListener('change', () => scheduleSave('audio', { bellEnabled: $('admin-bell-enabled').checked }));
  $('admin-voice-select').addEventListener('change', () => { preferredVoice = $('admin-voice-select').value; speaker.voiceURI = preferredVoice; scheduleSave('audio', { voiceURI: preferredVoice }); });
  onClick('admin-voice-toggle', async () => { if (speaker.enabled) speaker.stop(); else await enableVoice(); });
  onClick('admin-voice-test', async () => { if (!speaker.enabled) await enableVoice(); speaker.gift({ userId: 'voice-test', name: 'bạn hữu duyên', coins: 10, blessing: 'Nguyện bạn và gia đình luôn bình an, thân tâm an lạc.' }); });
  onClick('admin-voice-clear', () => speaker.clear());
  onClick('admin-bell-test', async () => { claimAudio(); await resumeBell(); bell(true); });
  onSubmit('admin-appearance-form', async () => {
    await request('settings', { title: $('admin-title').value, subtitle: $('admin-subtitle').value, goal: Number($('admin-goal').value), bannerInterval: Number($('admin-banner-interval').value), giftSeconds: Number($('admin-gift-duration').value), bannerEnabled: $('admin-banners-enabled').checked });
    toast('Đã cập nhật giao diện và banner trên overlay.');
  });
  onClick('admin-announce', async () => { await request('announce', { message: $('admin-custom-banner').value }); toast('Lời chúc đang xuất hiện trên overlay.'); });
  onClick('admin-test-gift', async () => { await request('demo', { type: 'gift', name: $('admin-test-name').value.trim() || 'Bạn hữu duyên', coins: 10 }); toast('Đã gửi quà thử. Kiểm tra tên trên overlay và giọng đọc nếu đã bật.'); });
  onClick('admin-add-guests', async () => { const result = await request('admin/guests', { action: 'add' }); toast(`Đã thêm ${result.added} khách phụ vào dâng hương.`); });
  onClick('admin-clear-guests', async () => { await request('admin/guests', { action: 'clear' }); toast('Đã dọn khách phụ. Người xem TikTok và công đức được giữ nguyên.'); });
  function confirmReset(demo) { resettingToDemo = demo; $('admin-reset-dialog').showModal(); }
  onClick('admin-reset-live', () => confirmReset(false));
  onClick('admin-reset-demo', () => confirmReset(true));
  $('admin-reset-cancel').addEventListener('click', () => $('admin-reset-dialog').close());
  onClick('admin-reset-confirm', async () => { await request('reset', { confirm: 'RESET', demo: resettingToDemo }); $('admin-reset-dialog').close(); toast('Đã bắt đầu phiên mới. Cài đặt âm thanh được giữ lại.'); });
  $('admin-overlay-url').value = `${location.origin}/overlay`;
  onClick('admin-copy-overlay', async () => {
    try { await navigator.clipboard.writeText($('admin-overlay-url').value); toast('Đã sao chép đường dẫn overlay.'); }
    catch { $('admin-overlay-url').focus(); $('admin-overlay-url').select(); toast('Đã chọn đường dẫn. Nhấn Ctrl+C để sao chép.'); }
  });
  document.querySelectorAll('.admin-sidebar nav a').forEach(link => link.addEventListener('click', () => { document.querySelectorAll('.admin-sidebar nav a').forEach(a => a.classList.toggle('selected', a === link)); }));
  if (speaker.supported) speechSynthesis.addEventListener('voiceschanged', loadVoices);
  loadVoices();
  if (channel) channel.onmessage = event => {
    if (event.data?.type === 'speaker' && event.data.id !== tabId && ownsAudio) { stopAudio(); toast('Âm thanh đã chuyển sang tab quản lý khác.'); }
  };
  window.addEventListener('pagehide', () => { clearTimeout(saveTimer); speaker.stop(); music.destroy(); stream?.close(); channel?.close(); audioContext?.close().catch(() => {}); });
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  request('session').then(session => session.authenticated ? showAdmin() : undefined).catch(error => { $('login-error').textContent = error.message; });
})();
