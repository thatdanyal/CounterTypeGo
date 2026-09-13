// CT Defense: counter-terrorist-style soldiers march in from the edges toward you at a constant
// speed. Each carries a word; type it to drop them. The nearest one (your current target) has a
// green outline. Several are alive at once, spaced by their queue order so they arrive one by one.

window.CTDefense = class CTDefense {
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.words = opts.words;                 // () => string
    this.onNextChar = opts.onNextChar || (() => {});
    this.onEnd = opts.onEnd || (() => {});
    this.onHud = opts.onHud || (() => {});
    this.setDifficulty(opts.difficulty || 'normal');
    this.running = false;
    this.reset();
    this._resize = () => this.resize();
    window.addEventListener('resize', this._resize);
    this.resize();
    this.draw(0);
  }

  setDifficulty(name) {
    this.difficulty = name;
    this.params = {
      easy:   { speed: 34, alive: 3, gap: 190, ramp: 0.010, lives: 4 },
      normal: { speed: 50, alive: 4, gap: 170, ramp: 0.014, lives: 3 },
      hard:   { speed: 72, alive: 5, gap: 150, ramp: 0.018, lives: 3 },
    }[name] || this.params;
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(200, r.width); this.h = Math.max(200, r.height);
    this.canvas.width = this.w * dpr; this.canvas.height = this.h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cx = this.w / 2; this.cy = this.h / 2 + 10;
    if (!this.running) this.draw(0);
  }

  reset() {
    this.enemies = [];
    this.particles = [];
    this.kills = 0; this.score = 0; this.errors = 0; this.correct = 0;
    this.lives = this.params.lives;
    this.speedMul = 1;
    this.spawned = 0;
    this.startTime = 0; this.elapsed = 0;
    this.flash = 0; this.shake = 0; this.hitFlash = 0;
    this.gameOver = false;
  }

  start() {
    this.reset();
    this.running = true;
    this.startTime = performance.now();
    this.last = this.startTime;
    for (let i = 0; i < this.params.alive; i++) this.spawn();
    this._announceTarget();
    this._raf = requestAnimationFrame(t => this.loop(t));
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
  }

  destroy() { this.stop(); window.removeEventListener('resize', this._resize); }

  // ------------------------------------------------------------- spawning

  // distance from the centre to the edge of the canvas along `angle`, just past the border
  edgeRadius(angle) {
    const dx = Math.abs(Math.cos(angle)) || 1e-6, dy = Math.abs(Math.sin(angle)) || 1e-6;
    return Math.min((this.w / 2 + 40) / dx, (this.h / 2 + 40) / dy);
  }

  spawn() {
    // spread angles: avoid spawning right next to the previous one
    const alive = this.enemies.filter(e => e.alive);
    let angle = Math.random() * Math.PI * 2;
    if (alive.length) {
      const lastA = alive[alive.length - 1].angle;
      angle = lastA + (Math.PI / 2 + Math.random() * Math.PI) * (Math.random() < .5 ? 1 : -1);
    }
    // keep the queue order: each new enemy starts `gap` further out than the current farthest one,
    // so the first word you need to type is always the closest soldier.
    const edge = this.edgeRadius(angle);
    const farthest = alive.length ? Math.max(...alive.map(e => e.dist)) : edge - this.params.gap;
    const dist = Math.max(edge, farthest + this.params.gap);
    const word = this.words();
    this.enemies.push({ id: this.spawned++, word, typed: 0, angle, dist, alive: true, dying: 0, x: 0, y: 0, bob: Math.random() * 10 });
    this._updatePositions();
  }

  _updatePositions() {
    for (const e of this.enemies) { e.x = this.cx + Math.cos(e.angle) * e.dist; e.y = this.cy + Math.sin(e.angle) * e.dist; }
  }

  target() {
    let best = null;
    for (const e of this.enemies) if (e.alive && (!best || e.dist < best.dist)) best = e;
    return best;
  }

  _announceTarget() {
    const t = this.target();
    this.onNextChar(t ? t.word[t.typed] : null);
  }

  // ------------------------------------------------------------- input

  /** Returns true if the key was consumed. */
  key(ev) {
    if (!this.running || this.gameOver) return false;
    const t = this.target(); if (!t) return false;
    if (ev.key === 'Backspace') { if (t.typed > 0) t.typed--; this._announceTarget(); return true; }
    if (ev.key.length !== 1 || ev.ctrlKey || ev.metaKey || ev.altKey) return false;
    if (ev.key === t.word[t.typed]) {
      t.typed++; this.correct++;
      if (t.typed >= t.word.length) this.kill(t);
    } else {
      this.errors++; this.shake = 1; t.shakeT = 1;
    }
    this._announceTarget();
    return true;
  }

  kill(e) {
    e.alive = false; e.dying = 1;
    this.kills++; this.score += e.word.length * 10 + Math.round(e.dist / 10);
    this.speedMul = Math.min(2.4, this.speedMul * (1 + this.params.ramp));
    this.flash = .5;
    for (let i = 0; i < 14; i++) this.particles.push({ x: e.x, y: e.y, vx: (Math.random() - .5) * 240, vy: (Math.random() - .8) * 240, life: .6 + Math.random() * .4, c: Math.random() < .5 ? '#5ce08a' : '#cfd6e6' });
    while (this.enemies.filter(x => x.alive).length < this.params.alive) this.spawn();
  }

  breach(e) {
    e.alive = false; e.dying = 1; e.breached = true;
    this.lives--; this.hitFlash = 1;
    for (let i = 0; i < 24; i++) this.particles.push({ x: this.cx, y: this.cy, vx: (Math.random() - .5) * 420, vy: (Math.random() - .5) * 420, life: .5 + Math.random() * .5, c: '#e05c5c' });
    if (this.lives <= 0) return this.end();
    while (this.enemies.filter(x => x.alive).length < this.params.alive) this.spawn();
  }

  end() {
    this.gameOver = true; this.running = false;
    this.onNextChar(null);
    const minutes = this.elapsed / 60;
    const total = this.correct + this.errors;
    this.onEnd({
      kills: this.kills, score: this.score, time: this.elapsed,
      wpm: minutes ? (this.correct / 5) / minutes : 0,
      raw: minutes ? (total / 5) / minutes : 0,
      accuracy: total ? this.correct / total : 1,
      correct: this.correct, errors: this.errors, difficulty: this.difficulty,
    });
  }

  // ------------------------------------------------------------- loop

  loop(t) {
    if (!this.running) return;
    const dt = Math.min(.05, (t - this.last) / 1000); this.last = t;
    this.elapsed = (t - this.startTime) / 1000;
    const speed = this.params.speed * this.speedMul;
    for (const e of this.enemies) {
      if (e.alive) {
        e.dist -= speed * dt;
        e.bob += dt * 9;
        if (e.dist <= 42) { this.breach(e); if (this.gameOver) break; }
      } else e.dying -= dt * 1.6;
      if (e.shakeT > 0) e.shakeT -= dt * 4;
    }
    this.enemies = this.enemies.filter(e => e.alive || e.dying > 0);
    this._updatePositions();
    for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt; p.life -= dt; }
    this.particles = this.particles.filter(p => p.life > 0);
    this.flash = Math.max(0, this.flash - dt * 2); this.hitFlash = Math.max(0, this.hitFlash - dt * 2); this.shake = Math.max(0, this.shake - dt * 5);
    this.draw(dt);
    this.onHud({ kills: this.kills, score: this.score, lives: this.lives, time: this.elapsed, wpm: this.elapsed > 2 ? (this.correct / 5) / (this.elapsed / 60) : 0 });
    if (this.running) this._raf = requestAnimationFrame(tt => this.loop(tt));
  }

  // ------------------------------------------------------------- drawing

  draw() {
    const c = this.ctx, w = this.w, h = this.h;
    c.save();
    if (this.shake > 0) c.translate((Math.random() - .5) * 6 * this.shake, (Math.random() - .5) * 6 * this.shake);
    // ground
    const g = c.createRadialGradient(this.cx, this.cy, 20, this.cx, this.cy, Math.max(w, h) * .7);
    g.addColorStop(0, '#1b1f27'); g.addColorStop(1, '#0d0f13');
    c.fillStyle = g; c.fillRect(-10, -10, w + 20, h + 20);
    // funnel lanes + rings
    c.strokeStyle = 'rgba(255,255,255,.035)'; c.lineWidth = 1;
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; c.beginPath(); c.moveTo(this.cx + Math.cos(a) * 60, this.cy + Math.sin(a) * 60); c.lineTo(this.cx + Math.cos(a) * 2000, this.cy + Math.sin(a) * 2000); c.stroke(); }
    for (let r = 120; r < Math.max(w, h); r += 120) { c.beginPath(); c.arc(this.cx, this.cy, r, 0, Math.PI * 2); c.stroke(); }
    // danger ring
    c.strokeStyle = `rgba(224,92,92,${.25 + this.hitFlash * .6})`; c.lineWidth = 2; c.setLineDash([6, 8]);
    c.beginPath(); c.arc(this.cx, this.cy, 42, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
    if (this.hitFlash > 0) { c.fillStyle = `rgba(224,92,92,${this.hitFlash * .18})`; c.fillRect(-10, -10, w + 20, h + 20); }

    this.drawPlayer(c);
    const target = this.target();
    const sorted = [...this.enemies].sort((a, b) => b.dist - a.dist);
    for (const e of sorted) this.drawEnemy(c, e, e === target);
    for (const p of this.particles) { c.globalAlpha = Math.max(0, p.life); c.fillStyle = p.c; c.fillRect(p.x - 2, p.y - 2, 4, 4); }
    c.globalAlpha = 1;
    c.restore();
    if (this.running || this.gameOver) this.drawHud(c);
  }

  drawHud(c) {
    const mono = '"JetBrains Mono", "Cascadia Mono", Consolas, monospace';
    c.save();
    c.textBaseline = 'top';
    // left: kills + score
    c.textAlign = 'left';
    c.fillStyle = '#646b7a'; c.font = `12px ${mono}`; c.fillText('kills', 24, 18); c.fillText('score', 24, 66);
    c.fillStyle = '#5ce08a'; c.font = `600 30px ${mono}`; c.fillText(String(this.kills), 24, 32);
    c.fillStyle = '#d8dbe2'; c.font = `600 22px ${mono}`; c.fillText(String(this.score), 24, 80);
    // right: lives + wpm + time
    c.textAlign = 'right';
    c.fillStyle = '#646b7a'; c.font = `12px ${mono}`; c.fillText('lives', this.w - 24, 18); c.fillText('wpm', this.w - 24, 66);
    c.font = '22px system-ui';
    let hearts = '';
    for (let i = 0; i < this.params.lives; i++) hearts += i < this.lives ? '♥' : '♡';
    c.fillStyle = '#e05c5c'; c.fillText(hearts, this.w - 24, 30);
    const wpm = this.elapsed > 2 ? Math.round((this.correct / 5) / (this.elapsed / 60)) : 0;
    c.fillStyle = '#d8dbe2'; c.font = `600 22px ${mono}`; c.fillText(`${wpm}`, this.w - 24, 80);
    c.fillStyle = '#646b7a'; c.font = `12px ${mono}`; c.fillText(`${Math.floor(this.elapsed)}s · ${this.difficulty}`, this.w - 24, 108);
    c.restore();
  }

  drawPlayer(c) {
    const { cx, cy } = this;
    c.save(); c.translate(cx, cy);
    const t = this.target();
    if (t) c.rotate(Math.atan2(t.y - cy, t.x - cx));
    // shadow + body (you: a terrorist-side figure, warm palette)
    c.fillStyle = 'rgba(0,0,0,.45)'; c.beginPath(); c.ellipse(0, 12, 16, 7, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#5a4634'; c.fillRect(-9, -9, 18, 20);               // torso
    c.fillStyle = '#3b2f24'; c.fillRect(-9, -9, 18, 6);                // vest strap
    c.fillStyle = '#c99a72'; c.beginPath(); c.arc(0, -15, 7, 0, Math.PI * 2); c.fill(); // head
    c.fillStyle = '#eee'; c.fillRect(-7, -18, 14, 4);                  // headband
    c.strokeStyle = '#22252c'; c.lineWidth = 4; c.beginPath(); c.moveTo(4, -2); c.lineTo(26, -4); c.stroke(); // rifle
    c.restore();
    // aim line
    if (t) {
      c.save(); c.strokeStyle = 'rgba(92,224,138,.18)'; c.lineWidth = 1; c.setLineDash([4, 10]);
      c.beginPath(); c.moveTo(cx, cy); c.lineTo(t.x, t.y); c.stroke(); c.restore();
    }
  }

  drawEnemy(c, e, isTarget) {
    const alpha = e.alive ? 1 : Math.max(0, e.dying);
    const scale = e.alive ? 1 : 1 + (1 - e.dying) * .3;
    const facing = Math.atan2(this.cy - e.y, this.cx - e.x);
    const jx = e.shakeT > 0 ? (Math.random() - .5) * 8 * e.shakeT : 0;
    c.save();
    c.globalAlpha = alpha;
    c.translate(e.x + jx, e.y);
    // target ring
    if (isTarget && e.alive) {
      c.save();
      c.shadowColor = '#5ce08a'; c.shadowBlur = 22;
      c.strokeStyle = '#5ce08a'; c.lineWidth = 3;
      c.beginPath(); c.arc(0, 0, 36, 0, Math.PI * 2); c.stroke();
      c.restore();
      c.strokeStyle = 'rgba(92,224,138,.35)'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(0, 0, 45, 0, Math.PI * 2); c.stroke();
    }
    // soldier
    c.save();
    c.scale(scale * 1.35, scale * 1.35);
    c.rotate(facing);
    if (!e.alive) c.rotate((1 - e.dying) * (e.breached ? 0 : 1.4));     // topple when shot
    const bob = e.alive ? Math.sin(e.bob) * 1.5 : 0;
    c.fillStyle = 'rgba(0,0,0,.45)'; c.beginPath(); c.ellipse(0, 12, 15, 6, 0, 0, Math.PI * 2); c.fill();
    // legs
    c.fillStyle = '#2b3a55'; c.fillRect(-8, 3 + bob, 6, 10); c.fillRect(2, 3 - bob, 6, 10);
    // torso + tactical vest
    c.fillStyle = '#3d5a80'; c.fillRect(-10, -8, 20, 18);
    c.fillStyle = '#1f2b3f'; c.fillRect(-8, -6, 16, 12);
    c.fillStyle = '#5a7ea6'; c.fillRect(-3, -6, 6, 12);                 // vest strap
    // arms + rifle pointing at you
    c.fillStyle = '#3d5a80'; c.fillRect(8, -4, 8, 5); c.fillRect(6, 2, 10, 5);
    c.strokeStyle = '#161a22'; c.lineWidth = 4; c.beginPath(); c.moveTo(6, 0); c.lineTo(30, 0); c.stroke();
    c.strokeStyle = '#2b2f38'; c.lineWidth = 2; c.beginPath(); c.moveTo(18, 0); c.lineTo(18, 6); c.stroke(); // magazine
    // head: helmet, face, goggles
    c.fillStyle = '#d5b59a'; c.beginPath(); c.arc(0, -13, 7.5, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#2a3f66'; c.beginPath(); c.arc(0, -14, 8.5, Math.PI, Math.PI * 2); c.fill();
    c.fillRect(-8.5, -14, 17, 3.5);
    c.fillStyle = '#0e141f'; c.fillRect(1, -14, 6, 4);                  // goggles
    c.fillStyle = '#7ab0ff'; c.fillRect(2.5, -13, 3, 2);
    c.restore();

    // word label
    if (e.alive) {
      c.font = '600 17px "JetBrains Mono", "Cascadia Mono", Consolas, monospace';
      c.textBaseline = 'middle'; c.textAlign = 'left';
      const typed = e.word.slice(0, e.typed), rest = e.word.slice(e.typed);
      const tw = c.measureText(typed).width, rw = c.measureText(rest).width, pad = 8;
      const total = tw + rw + pad * 2, x0 = -total / 2, y0 = -62;
      c.fillStyle = isTarget ? 'rgba(20,32,26,.92)' : 'rgba(17,19,24,.85)';
      c.beginPath(); c.roundRect(x0, y0 - 13, total, 26, 6); c.fill();
      if (isTarget) { c.strokeStyle = 'rgba(92,224,138,.7)'; c.lineWidth = 1.5; c.stroke(); }
      c.fillStyle = '#5ce08a'; c.fillText(typed, x0 + pad, y0);
      c.fillStyle = isTarget ? '#e8ecf4' : '#7b8496'; c.fillText(rest, x0 + pad + tw, y0);
      if (isTarget) { c.fillStyle = '#5ce08a'; c.fillRect(x0 + pad + tw, y0 + 9, Math.max(2, c.measureText(rest[0] || ' ').width), 2); }
    }
    c.restore();
  }
};
