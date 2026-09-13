// Client for the local keyboard LED bridge (rk-r65-leds/server.js).
// The test tells it which character comes next; it lights the keys needed to type it.
// Everything is best-effort: if the bridge isn't running the app just works without lights.

window.KeyboardLink = class KeyboardLink {
  constructor(opts = {}) {
    this.url = opts.url || 'ws://127.0.0.1:7365';
    this.enabled = opts.enabled ?? true;
    this.color = opts.color || 'green';
    this.modColor = opts.modColor || 'cyan';
    this.onStatus = opts.onStatus || (() => {});
    this.ws = null;
    this.status = { connected: false, keyboard: false, device: null };
    this.lastChar = undefined;
    this._retry = null;
    if (this.enabled) this.connect();
  }

  setEnabled(on) {
    this.enabled = on;
    if (on) this.connect(); else this.disconnect();
  }

  connect() {
    if (!this.enabled || this.ws) return;
    let ws;
    try { ws = new WebSocket(this.url); } catch { return this._scheduleRetry(); }
    this.ws = ws;
    ws.onopen = () => { this.status.connected = true; this._emit(); if (this.lastChar !== undefined) this.next(this.lastChar, true); };
    ws.onmessage = ev => {
      try {
        const m = JSON.parse(ev.data);
        if (m.event === 'status') { this.status.keyboard = !!(m.connected && m.perKey); this.status.device = m.device; this._emit(); }
      } catch {}
    };
    ws.onclose = () => { this.ws = null; this.status = { connected: false, keyboard: false, device: null }; this._emit(); this._scheduleRetry(); };
    ws.onerror = () => { try { ws.close(); } catch {} };
  }

  disconnect() {
    clearTimeout(this._retry);
    if (this.ws) { try { this.ws.send(JSON.stringify({ op: 'clear' })); this.ws.close(); } catch {} }
    this.ws = null;
    this.status = { connected: false, keyboard: false, device: null };
    this._emit();
  }

  _scheduleRetry() {
    clearTimeout(this._retry);
    if (this.enabled) this._retry = setTimeout(() => this.connect(), 2000);
  }

  _emit() { this.onStatus({ ...this.status }); }

  _send(msg) {
    if (this.ws && this.ws.readyState === 1) { try { this.ws.send(JSON.stringify(msg)); } catch {} }
  }

  /** Light the keys for the next character to type (null/undefined = nothing to type). */
  next(ch, force = false) {
    if (!force && ch === this.lastChar) return;
    this.lastChar = ch;
    if (ch == null) this._send({ op: 'clear' });
    else this._send({ op: 'char', char: ch, color: this.color, modColor: this.modColor });
  }

  /** Light an explicit set of keys, e.g. [['enter','yellow']]. */
  highlight(keys) { this.lastChar = undefined; this._send({ op: 'highlight', keys }); }

  clear() { this.lastChar = null; this._send({ op: 'clear' }); }

  setColor(color) { this.color = color; if (this.lastChar) this.next(this.lastChar, true); }
};
