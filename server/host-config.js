'use strict';

const { cleanUsername } = require('./tiktok');
const { parseYouTubeVideo } = require('../public/youtube-music');
const defaults = () => ({
  tiktokUsername: '',
  music: { url: '', volume: 12, loop: true, duck: true },
  audio: { voiceURI: '', volume: 80, rate: 0.9, bellVolume: 50, bellEnabled: true }
});

function updateHostConfig(current, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Cấu hình không hợp lệ.');
  const next = { ...current, music: { ...current.music }, audio: { ...current.audio } };
  if (input.tiktokUsername !== undefined) {
    const raw = String(input.tiktokUsername).trim();
    const username = raw ? cleanUsername(raw) : '';
    if (raw && !username) throw new Error('Nhập @ID TikTok hoặc đường dẫn kênh TikTok hợp lệ.');
    next.tiktokUsername = username;
  }
  for (const section of ['music', 'audio']) {
    const patch = input[section];
    if (patch === undefined) continue;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Cấu hình âm thanh không hợp lệ.');
    for (const [key, value] of Object.entries(patch)) {
      if (!(key in next[section])) continue;
      if (key === 'url') {
        if (typeof value !== 'string' || value.length > 2048 || (value.trim() && !parseYouTubeVideo(value))) throw new Error('Dán link một video YouTube hợp lệ, không phải link chỉ có playlist.');
        next.music.url = value.trim();
      } else if (key === 'voiceURI') {
        if (typeof value !== 'string' || value.length > 300) throw new Error('Giọng đọc không hợp lệ.');
        next.audio.voiceURI = value;
      } else if (['loop', 'duck', 'bellEnabled'].includes(key)) {
        if (typeof value !== 'boolean') throw new Error('Tùy chọn bật/tắt không hợp lệ.');
        next[section][key] = value;
      } else {
        const min = key === 'rate' ? 0.7 : 0;
        const max = key === 'rate' ? 1.3 : 100;
        if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (key !== 'rate' && !Number.isInteger(value))) throw new Error(`${key}: nhập giá trị từ ${min} đến ${max}.`);
        next[section][key] = value;
      }
    }
  }
  return next;
}

module.exports = { defaultHostConfig: defaults, updateHostConfig };
