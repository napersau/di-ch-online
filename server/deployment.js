'use strict';
const { isIP } = require('node:net');

function deploymentConfig(env = process.env, { port = 3000, prefix = '' } = {}) {
  const production = env.NODE_ENV === 'production';
  const localPort = env[`${prefix}PORT`];
  const selectedPort = Number((production ? env.PORT || localPort : localPort || env.PORT) || port);
  if (!Number.isInteger(selectedPort) || selectedPort < 1 || selectedPort > 65535) throw new Error('PORT phải là số nguyên từ 1 đến 65535.');
  const rawOrigin = env[`${prefix}PUBLIC_ORIGIN`] || env.PUBLIC_ORIGIN || env.RENDER_EXTERNAL_URL || (env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : '');
  let publicOrigin = '';
  if (rawOrigin) {
    let url;
    try { url = new URL(rawOrigin); } catch { throw new Error('PUBLIC_ORIGIN phải là địa chỉ web hợp lệ.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('PUBLIC_ORIGIN chỉ gồm giao thức và tên miền, không kèm đường dẫn.');
    if (production && url.protocol !== 'https:') throw new Error('Production cần PUBLIC_ORIGIN dùng HTTPS.');
    publicOrigin = url.origin;
  }
  if (production && !publicOrigin) throw new Error('Đặt PUBLIC_ORIGIN=https://ten-mien-cua-ban. Render tự cung cấp RENDER_EXTERNAL_URL.');
  return { production, port: selectedPort, host: env[`${prefix}HOST`] || env.HOST || (production ? '0.0.0.0' : '127.0.0.1'), publicOrigin, trustProxy: env.TRUST_PROXY === '1' };
}

function validateAdminToken(token, config) {
  if (config.production && (!token || token.length < 32 || /^doi-mat-khau/i.test(token))) throw new Error('Production cần mật khẩu admin riêng dài ít nhất 32 ký tự trong biến môi trường.');
}

function allowedHost(req, config) {
  const host = String(req.headers.host || '').toLowerCase();
  if (/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host)) return true;
  if (config.publicOrigin && host === new URL(config.publicOrigin).host.toLowerCase()) return true;
  return !config.production && config.host === '0.0.0.0';
}

function allowedOrigin(req, config) {
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  if (!req.headers.origin) return true;
  try {
    const origin = new URL(req.headers.origin);
    if (config.publicOrigin) return origin.origin === config.publicOrigin;
    return ['http:', 'https:'].includes(origin.protocol) && origin.host === req.headers.host;
  } catch { return false; }
}

function clientAddress(req, config) {
  if (config.trustProxy) {
    const addresses = String(req.headers['x-forwarded-for'] || '').split(',').map(v => v.trim()).filter(v => isIP(v));
    if (addresses.length) return addresses.at(-1);
  }
  return req.socket.remoteAddress || 'unknown';
}

module.exports = { deploymentConfig, validateAdminToken, allowedHost, allowedOrigin, clientAddress };
