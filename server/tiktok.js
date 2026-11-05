'use strict';

// Reuse the project's tested TikTok gift-combo normalization and reconnect logic.
const { TikTokBridge, cleanUsername, toEvent } = require('./tiktok-base');

class TempleBridge extends TikTokBridge {
  async _connect() {
    await super._connect();
    const conn = this.conn;
    if (!conn || this.state.state !== 'live') return;
    conn.on('roomUser', data => {
      if (this.conn === conn) this.onViewers?.(Number(data.viewerCount ?? data.roomUserCount) || 0);
    });
  }
}

module.exports = { TempleBridge, cleanUsername, toEvent };
