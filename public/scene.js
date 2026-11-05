'use strict';
(() => {
  const container = document.getElementById('temple-scene');
  if (!container) return;
  const icon = name => `<svg aria-hidden="true"><use href="/assets/icons.svg#${name}"/></svg>`;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const number = value => Number(value || 0).toLocaleString('vi-VN');
  const time = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  container.innerHTML = `<div class="scene-border"></div><div class="scene-title"><div class="scene-overline">CHÁNH ĐIỆN</div><h2 id="scene-title">TỊNH TÂM VIÊN</h2><p id="scene-subtitle">Một niệm lành · Vạn sự an</p><div class="scene-divider">${icon('lotus')}</div></div><div class="scene-stats"><span class="scene-chip"><i class="scene-status-dot"></i><b id="scene-count">0</b><small>hữu<br>duyên</small></span><span class="scene-chip">${icon('clock')}<b id="scene-timer">00:00</b></span><span class="scene-chip">${icon('heart')}<b id="scene-merits">0</b><small>niệm<br>lành</small></span></div><p class="scene-datetime" id="scene-date"></p><div class="scene-progress"><div class="scene-progress-fill" id="scene-progress-fill"></div><span id="scene-goal-label">Kết duyên hôm nay</span></div><div class="scene-buddha-glow"></div><div class="scene-incense"></div><aside class="scene-note"><h3>Gieo niệm lành</h3><p><strong>“nam mô”</strong><br>Cùng chắp tay niệm Phật</p><p><strong>“bình an”</strong><br>Gửi một lời chúc lành</p><p><strong>“thắp hương”</strong><br>Dâng một nén tâm hương</p><p><strong>“chuông”</strong><br>Lắng lòng một chút</p><p class="scene-note-foot">Mỗi người ghé qua<br>Một đóa sen nở.</p></aside><aside class="scene-note scene-ranking"><h3>✦ Công đức ✦</h3><div id="scene-ranking"></div></aside><div class="scene-honor" id="scene-honor"></div><div class="scene-visitors" id="scene-visitors"></div><div class="scene-particles">${Array.from({ length: 20 }, (_, i) => `<i style="left:${(i * 37) % 100}%;top:${35 + (i * 13) % 65}%;animation-delay:-${i * 1.7}s;animation-duration:${10 + i % 8}s"></i>`).join('')}</div><div class="scene-banner" id="scene-banner" aria-live="polite">${icon('lotus')}<p></p></div><div class="gift-announcement" id="scene-gift" aria-live="polite"><svg class="gift-lotus"><use href="/assets/icons.svg#lotus"/></svg><p class="gift-kicker">TRÂN TRỌNG TẤM LÒNG HỮU DUYÊN</p><h3></h3><p class="gift-amount"></p><p class="gift-wish"></p><small class="gift-queue-note"></small></div><span class="scene-source" id="scene-source">KHÔNG GIAN TRẢI NGHIỆM</span><p class="scene-bottom">Nam mô A Di Đà Phật · Nguyện tất cả đều được bình an.</p><span class="scene-offline" id="scene-health" title="Đang kết nối máy chủ"></span><div class="scene-connection-message" id="scene-connection-message" hidden></div>`;
  const $ = id => document.getElementById(id);
  container.insertAdjacentHTML('beforeend', '<div class="scene-rituals" id="scene-rituals" aria-hidden="true"></div><p class="scene-ritual-caption" id="scene-ritual-caption" aria-live="polite"></p>');
  let visitorSignature = '';
  let donorSignature = '';
  let giftTimer;
  let giftFadeTimer;
  let bannerTimer;
  let giftActive = false;
  let queue = [];
  let ambientQueue = [];
  const offerings = new Set();
  const rituals = new Map();
  const seen = new Set();
  const setText = (id, value) => { const el = $(id); if (el && el.textContent !== String(value)) el.textContent = value; };
  function monk(p, honor = false, index = 0) {
    return `<div class="${honor ? 'honor-guest' : `scene-visitor${p.prayer ? ' praying' : ''}`}${offerings.has(p.id) ? ' is-offering' : ''}${p.isNpc ? ' npc-visitor' : ''}" data-person-id="${escape(p.id)}" title="${escape(p.name)}${p.isNpc ? ' · Khách phụ mô phỏng' : ` · ${number(p.coins)} xu`}">${honor ? `<span class="honor-label">${index === 0 ? '✦ ' : ''}${escape(p.name)}</span>` : ''}${p.prayer && !honor ? `<span class="prayer-bubble">${escape(p.prayer)}</span>` : ''}<img src="/assets/monk${p.hue % 3 === 1 ? '-gray' : p.hue % 3 === 2 ? '-rust' : ''}.svg" alt="" style="animation-delay:-${index % 5}s" loading="eager">${honor ? `<small>${number(p.coins)} xu · Tấm lòng vàng</small>` : `<span class="visitor-name">${escape(p.name)}${p.isNpc ? '<small class="npc-badge">phụ</small>' : ''}</span>`}</div>`;
  }
  function update(state) {
    setText('scene-title', state.settings.title.toLocaleUpperCase('vi-VN'));
    $('scene-title').style.fontSize = `${Math.min(7, 115 / Math.max(16, state.settings.title.length))}cqw`;
    $('scene-title').style.letterSpacing = state.settings.title.length > 24 ? '.1cqw' : '.4cqw';
    setText('scene-subtitle', state.settings.subtitle);
    setText('scene-count', number(state.visitorCount));
    setText('scene-merits', number(state.merits));
    const elapsed = Math.max(0, Math.floor((state.serverTime - state.startedAt) / 1000));
    setText('scene-timer', elapsed >= 3600 ? `${Math.floor(elapsed / 3600)}:${time(elapsed % 3600)}` : time(elapsed));
    setText('scene-date', new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: 'numeric', month: 'long', year: 'numeric' }).format(state.serverTime));
    $('scene-progress-fill').style.width = `${Math.min(100, state.totalCoins / state.settings.goal * 100)}%`;
    setText('scene-goal-label', `Kết duyên hôm nay · ${number(state.totalCoins)} / ${number(state.settings.goal)} xu`);
    setText('scene-source', (state.mode === 'demo' ? 'DỮ LIỆU TRẢI NGHIỆM · QUÀ MÔ PHỎNG' : state.mode === 'live' ? `TIKTOK LIVE · @${state.connection.username}` : 'CHÁNH ĐIỆN ĐANG CHỜ KẾT NỐI TIKTOK') + (state.guestCount ? ` · ${state.guestCount} KHÁCH PHỤ MÔ PHỎNG` : ''));
    const disconnected = state.mode !== 'demo' && state.connection.state !== 'live';
    $('scene-connection-message').hidden = !disconnected;
    if (disconnected) setText('scene-connection-message', state.connection.state === 'off' ? 'Chánh điện mở cửa · Chờ host kết nối TikTok LIVE' : 'TikTok đang kết nối lại · Phiên công đức được giữ nguyên');
    const ds = JSON.stringify(state.donors.slice(0, 5));
    if (ds !== donorSignature) {
      donorSignature = ds;
      $('scene-ranking').innerHTML = state.donors.length ? state.donors.slice(0, 5).map((p, i) => `<div class="scene-rank-line"><span>${i + 1}. ${escape(p.name)}</span><b>${number(p.coins)}</b></div>`).join('') : '<p class="scene-ranking-empty">Trân trọng từng<br>tấm lòng hữu duyên</p>';
      $('scene-honor').innerHTML = Array.from({ length: 3 }, (_, i) => state.donors[i] ? monk(state.donors[i], true, i) : '<div class="honor-guest empty-honor" title="Đệm phía trước chánh điện"><span class="honor-empty-label">Đệm an lành</span></div>').join('');
    }
    const vs = JSON.stringify(state.visitors);
    if (vs !== visitorSignature) {
      visitorSignature = vs;
      const seats = new Map(state.visitors.map((p, i) => [Number.isInteger(p.seat) && p.seat >= 0 ? p.seat : i, p]));
      $('scene-visitors').innerHTML = Array.from({ length: state.seatCount || 24 }, (_, i) => {
        const p = seats.get(i);
        return `<div class="scene-seat${p ? ' occupied' : ''}" data-seat="${i}" aria-label="Đệm ${i + 1}${p ? ` · ${escape(p.name)}${p.isNpc ? ' · Khách phụ' : ''}` : ' · Còn trống'}"><span class="seat-cushion"></span>${p ? monk(p, false, i) : ''}</div>`;
      }).join('');
    }
  }
  function finishRitual(id) {
    const ritual = rituals.get(id);
    if (!ritual) return;
    clearTimeout(ritual.timer);
    ritual.nodes.forEach(node => node.remove());
    ritual.participants.forEach(person => {
      offerings.delete(person.id);
      container.querySelectorAll(`[data-person-id="${CSS.escape(person.id)}"]`).forEach(node => node.classList.remove('is-offering'));
    });
    rituals.delete(id);
    if (ritual.source === 'gift') $('scene-ritual-caption').textContent = '';
    playNextAmbient();
  }
  function clearRituals(source) {
    for (const [id, ritual] of [...rituals]) if (!source || ritual.source === source) finishRitual(id);
  }
  function startRitual(ritual) {
    const bounds = container.getBoundingClientRect();
    const participants = ritual.participants.slice(0, 3);
    const nodes = participants.map((person, i) => {
      const seated = container.querySelector(`[data-person-id="${CSS.escape(person.id)}"]`);
      const image = seated?.querySelector('img');
      const seatBounds = image?.getBoundingClientRect();
      const fromX = seatBounds ? (seatBounds.left + seatBounds.width / 2 - bounds.left) / bounds.width * 100 - 6 : 35 + i * 14;
      const fromY = seatBounds ? (seatBounds.bottom - bounds.top) / bounds.width * 100 - 18 : 148;
      const targetX = 44 + (i - (participants.length - 1) / 2) * 13;
      const node = document.createElement('div');
      node.className = `ritual-actor ${ritual.source === 'gift' ? 'donor-ritual' : 'ambient-ritual'}`;
      node.dataset.ritualPerson = person.id;
      node.style.cssText = `--from-x:${fromX}cqw;--from-y:${fromY}cqw;--via-x:${targetX}cqw;--via-y:127cqw;--to-x:${targetX}cqw;--to-y:92cqw;--duration:${ritual.seconds || 8}s;--step-delay:${i * 0.12}s`;
      node.innerHTML = `<span class="ritual-aura"></span><div class="ritual-person"><img src="/assets/incense-walker.svg" alt=""><i class="ritual-smoke"></i></div><span class="ritual-name">${escape(person.name)}${ritual.source === 'npc' ? '<small>khách phụ</small>' : ''}</span>`;
      $('scene-rituals').append(node);
      offerings.add(person.id);
      seated?.classList.add('is-offering');
      return node;
    });
    const record = { ...ritual, participants, nodes, timer: null };
    rituals.set(ritual.id, record);
    record.timer = setTimeout(() => finishRitual(ritual.id), (ritual.seconds || 8) * 1000);
  }
  function playNextAmbient() {
    if (giftActive || queue.length || [...rituals.values()].some(r => r.source === 'npc') || !ambientQueue.length) return;
    startRitual(ambientQueue.shift());
  }
  function incense(ritual) {
    if (!ritual?.id || !Array.isArray(ritual.participants) || seen.has(ritual.id)) return;
    seen.add(ritual.id);
    if (ambientQueue.length < 12) ambientQueue.push(ritual);
    playNextAmbient();
  }
  function clearIncense() {
    ambientQueue = [];
    clearRituals('npc');
  }
  function showNextGift() {
    if (giftActive) return;
    if (!queue.length) { playNextAmbient(); return; }
    giftActive = true;
    const gift = queue.shift();
    clearRituals('npc');
    startRitual({ id: `gift-${gift.id}`, source: 'gift', participants: [{ id: gift.userId, name: gift.name, hue: gift.hue }], seconds: gift.seconds || 9 });
    $('scene-ritual-caption').textContent = `${gift.name} đang dâng hương · Nguyện mọi người bình an`;
    const el = $('scene-gift');
    el.querySelector('h3').textContent = gift.name;
    el.querySelector('.gift-amount').textContent = `Đã gửi ${number(gift.coins)} xu kết duyên`;
    el.querySelector('.gift-wish').textContent = gift.blessing;
    el.querySelector('.gift-queue-note').textContent = queue.length ? `Còn ${queue.length} tấm lòng đang chờ` : '';
    el.classList.add('visible');
    window.dispatchEvent(new CustomEvent('temple:gift-display', { detail: gift }));
    giftTimer = setTimeout(() => {
      el.classList.remove('visible');
      giftFadeTimer = setTimeout(() => { giftActive = false; showNextGift(); }, 800);
    }, (gift.seconds || 9) * 1000);
  }
  function gift(g) {
    if (seen.has(g.id)) return;
    seen.add(g.id);
    if (seen.size > 1000) seen.delete(seen.values().next().value);
    // Bound the visual queue during busy streams. Coalesce pending gifts per viewer first.
    const pending = queue.find(item => item.userId === g.userId);
    if (pending) { pending.coins += g.coins; pending.blessing = g.blessing; }
    else if (queue.length < 500) queue.push({ ...g });
    else {
      const last = queue[queue.length - 1];
      last.name = 'Những tấm lòng hữu duyên'; last.coins += g.coins;
    }
    $('scene-gift').querySelector('.gift-queue-note').textContent = queue.length ? `Còn ${queue.length} tấm lòng đang chờ` : '';
    showNextGift();
  }
  function banner(b) {
    clearTimeout(bannerTimer);
    $('scene-banner').querySelector('p').textContent = b.message;
    $('scene-banner').classList.add('visible');
    bannerTimer = setTimeout(() => $('scene-banner').classList.remove('visible'), 9000);
  }
  function reset() {
    queue = []; ambientQueue = []; giftActive = false; seen.clear();
    clearRituals(); offerings.clear();
    clearTimeout(giftTimer); clearTimeout(giftFadeTimer); clearTimeout(bannerTimer);
    $('scene-gift').classList.remove('visible'); $('scene-banner').classList.remove('visible');
    donorSignature = ''; visitorSignature = '';
    window.dispatchEvent(new CustomEvent('temple:reset'));
  }
  window.TempleScene = { update, gift, banner, incense, clearIncense, reset, connected: on => $('scene-health').classList.toggle('disconnected', !on) };
  window.TempleUtils = { icon, escape, number, time };
})();
