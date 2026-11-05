'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { GiftSpeaker } = require('../public/gift-speaker');
const { YouTubeMusic, parseYouTubeVideo } = require('../public/youtube-music');

test('giọng admin đọc tên và lời chúc tuần tự, nhạc giảm rồi khôi phục khi hết hàng chờ', async () => {
  const spoken = [];
  const volumes = [];
  const vi = { lang: 'vi-VN', voiceURI: 'test-vi' };
  const music = new YouTubeMusic({ loadAPI: async () => ({ Player: class {} }) });
  music.ready = true;
  music.player = { setVolume: value => volumes.push(value) };
  music.setVolume(20);
  const speaker = new GiftSpeaker({
    synthesis: { getVoices: () => [vi], resume() {}, cancel() {}, speak: u => spoken.push(u) },
    Utterance: class { constructor(text) { this.text = text; } },
    onStatus: status => music.setSpeaking(status.speaking),
  });
  speaker.gift({ name: 'Chưa bật', coins: 1 });
  assert.equal(spoken.length, 0);
  speaker.enable(vi.voiceURI);
  speaker.gift({ userId: 'a', name: 'An Nhiên', coins: 1, blessing: 'Nguyện cả nhà bình an.' });
  speaker.gift({ userId: 'b', name: 'Minh Tâm', coins: 10, blessing: 'Thân tâm an lạc.' });
  speaker.gift({ userId: 'b', name: 'Minh Tâm', coins: 20, blessing: 'Mọi điều thuận duyên.' });
  assert.match(spoken[0].text, /An Nhiên.*1 xu.*Nguyện cả nhà bình an/);
  assert.equal(volumes.at(-1), 5);
  speaker.setVolume(0.6); speaker.setRate(1.1);
  spoken[0].onend();
  assert.match(spoken[1].text, /Minh Tâm.*30 xu.*Mọi điều thuận duyên/);
  assert.equal(spoken[1].volume, 0.6);
  assert.equal(spoken[1].rate, 1.1);
  spoken[1].onend();
  assert.equal(volumes.at(-1), 20);
  speaker.stop();
});

test('lỗi hoặc reset giọng đọc khôi phục nhạc, bỏ callback cũ và không đọc bù quà', () => {
  const spoken = [];
  const statuses = [];
  const vi = { lang: 'vi-VN', voiceURI: 'test-vi' };
  const speaker = new GiftSpeaker({ synthesis: { getVoices: () => [vi], resume() {}, cancel() {}, speak: u => spoken.push(u) }, Utterance: class { constructor(text) { this.text = text; } }, onStatus: s => statuses.push(s) });
  speaker.enable(vi.voiceURI);
  speaker.gift({ name: 'A', coins: 1 });
  speaker.gift({ name: 'B', coins: 10 });
  speaker.clear();
  spoken[0].onend();
  assert.equal(spoken.length, 1);
  assert.equal(statuses.at(-1).speaking, false);
  speaker.gift({ name: 'C', coins: 10 });
  spoken[1].onerror({ error: 'not-allowed' });
  assert.equal(speaker.enabled, false);
  assert.equal(statuses.at(-1).speaking, false);
  speaker.gift({ name: 'D', coins: 10 });
  assert.equal(spoken.length, 2);
  assert.throws(() => speaker.enable('english'), /tiếng Việt/);
});

test('trình phát admin nhận link YouTube hợp lệ và điều khiển phát, tạm dừng, dừng, lặp lại', async () => {
  const calls = [];
  let options;
  const player = { setVolume: n => calls.push(['volume', n]), unMute() {}, loadVideoById: id => calls.push(['load', id]), playVideo: () => calls.push(['play']), pauseVideo: () => calls.push(['pause']), stopVideo: () => calls.push(['stop']), seekTo: n => calls.push(['seek', n]) };
  const music = new YouTubeMusic({ loadAPI: async () => ({ Player: class { constructor(id, opts) { options = opts; return player; } } }) });
  assert.equal(parseYouTubeVideo('https://youtu.be/M7lc1UVf-VE'), 'M7lc1UVf-VE');
  await assert.rejects(() => music.play('https://youtube.com.evil.test/watch?v=M7lc1UVf-VE'));
  await music.play('https://youtu.be/M7lc1UVf-VE');
  options.events.onReady({ target: player });
  assert.deepEqual(calls.at(-1), ['load', 'M7lc1UVf-VE']);
  assert.ok(Number(options.height) >= 200);
  music.setVolume(0);
  assert.deepEqual(calls.at(-1), ['volume', 0]);
  options.events.onStateChange({ data: 0 });
  assert.deepEqual(calls.slice(-2), [['seek', 0], ['play']]);
  music.pause(); assert.deepEqual(calls.at(-1), ['pause']);
  music.stop(); assert.deepEqual(calls.at(-1), ['stop']);
});
