/* GlowType - main renderer script. Vanilla JS, no build step. */
(() => {
  const $ = id => document.getElementById(id);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  // ------------------------------------------------------------------ config & settings
  const config = Object.assign({ mode: 'time', time: 30, words: 25, punctuation: false, numbers: false, ct: 'normal' }, store.get('config', {}));
  const settings = Object.assign({ kb: true, color: 'green', url: 'ws://127.0.0.1:7365', smoothCaret: true, font: 30 }, store.get('settings', {}));
  const saveConfig = () => store.set('config', config);
  const saveSettings = () => store.set('settings', settings);

  // ------------------------------------------------------------------ keyboard link
  const kbStatus = $('kbStatus');
  const kb = new KeyboardLink({
    url: settings.url, enabled: settings.kb, color: settings.color,
    onStatus: s => {
      kbStatus.classList.toggle('bridge', s.connected && !s.keyboard);
      kbStatus.classList.toggle('on', s.keyboard);
      kbStatus.title = !settings.kb ? 'keyboard lights disabled' : s.keyboard ? `lighting ${s.device}` : s.connected ? 'bridge running, keyboard not found' : 'bridge offline (start rk-r65-leds)';
      kbStatus.querySelector('.label').textContent = s.keyboard ? (s.device || 'keyboard').replace(/\s+/g, ' ').trim() : 'keyboard';
    },
  });

  // ------------------------------------------------------------------ word generation
  const rnd = n => Math.floor(Math.random() * n);
  function makeWord(prevWord) {
    let w;
    do { w = WORDS[rnd(WORDS.length)]; } while (w === prevWord);
    if (config.numbers && Math.random() < .15) w = String(rnd(1000));
    if (config.punctuation) {
      const r = Math.random();
      if (r < .08) w = w[0].toUpperCase() + w.slice(1);
      else if (r < .2) w += ['.', ',', '?', '!', ';', ':'][rnd(6)];
      else if (r < .24) w = `"${w}"`;
      else if (r < .27) w = `(${w})`;
      else if (r < .3) w = w + "'s";
      else if (r < .33) w = w + '-' + WORDS[rnd(WORDS.length)];
    }
    return w;
  }

  // ------------------------------------------------------------------ typing test engine
  const wordsEl = $('words'), wrapEl = $('wordsWrap'), caretEl = $('caret'), liveEl = $('live'), liveLeft = $('liveLeft'), liveWpm = $('liveWpm');
  const test = {
    words: [], typed: [], wi: 0, started: false, finished: false, startAt: 0, endAt: 0,
    keystrokes: [], // {t, correct}
    timer: null, tickTimer: null,
  };

  function newTest() {
    clearInterval(test.timer); clearInterval(test.tickTimer);
    Object.assign(test, { words: [], typed: [''], wi: 0, started: false, finished: false, startAt: 0, endAt: 0, keystrokes: [], secondSamples: [] });
    const n = config.mode === 'words' ? config.words : 60;
    for (let i = 0; i < n; i++) test.words.push(makeWord(test.words[i - 1]));
    liveEl.classList.remove('show');
    liveLeft.textContent = config.mode === 'time' ? config.time : `0/${config.words}`; liveWpm.textContent = '';
    renderWords(); positionCaret();
    $('config').classList.remove('faded');
    announceNext();
  }

  function renderWords() {
    const frag = document.createDocumentFragment();
    test.words.forEach((w, i) => {
      const we = document.createElement('div'); we.className = 'word'; we.dataset.i = i;
      const t = test.typed[i] || '';
      for (let k = 0; k < Math.max(w.length, t.length); k++) {
        const le = document.createElement('span'); le.className = 'letter';
        if (k >= w.length) { le.textContent = t[k]; le.classList.add('extra'); }
        else { le.textContent = w[k]; if (k < t.length) le.classList.add(t[k] === w[k] ? 'correct' : 'incorrect'); }
        we.appendChild(le);
      }
      if (i < test.wi && t !== w) we.classList.add('error');
      frag.appendChild(we);
    });
    wordsEl.replaceChildren(frag);
    wordsEl.style.transform = 'translateY(0)';
    scrollToActive();
  }

  function updateWord(i) {
    const we = wordsEl.children[i]; if (!we) return;
    const w = test.words[i], t = test.typed[i] || '';
    we.replaceChildren();
    for (let k = 0; k < Math.max(w.length, t.length); k++) {
      const le = document.createElement('span'); le.className = 'letter';
      if (k >= w.length) { le.textContent = t[k]; le.classList.add('extra'); }
      else { le.textContent = w[k]; if (k < t.length) le.classList.add(t[k] === w[k] ? 'correct' : 'incorrect'); }
      we.appendChild(le);
    }
    we.classList.toggle('error', i < test.wi && t !== w);
  }

  function scrollToActive() {
    const we = wordsEl.children[test.wi]; if (!we) return;
    const lh = we.offsetHeight || 1;
    const line = Math.round(we.offsetTop / lh);
    wordsEl.style.transform = `translateY(${-Math.max(0, line - 1) * lh}px)`;
  }

  function positionCaret() {
    const we = wordsEl.children[test.wi]; if (!we) return;
    const t = test.typed[test.wi] || '';
    const letters = we.children;
    let x, y;
    const shift = parseFloat((wordsEl.style.transform.match(/-?[\d.]+/) || [0])[0]) || 0;
    if (t.length === 0) { x = we.offsetLeft; y = we.offsetTop; }
    else {
      const le = letters[Math.min(t.length, letters.length) - 1];
      x = le.offsetLeft + le.offsetWidth; y = we.offsetTop;
    }
    const lh = we.offsetHeight;
    caretEl.style.left = `${x}px`;
    caretEl.style.top = `${y + shift + (lh - caretEl.offsetHeight) / 2}px`;
    caretEl.classList.add('on');
    caretEl.classList.toggle('smooth', settings.smoothCaret);
  }

  function nextExpectedChar() {
    if (test.finished) return null;
    const w = test.words[test.wi], t = test.typed[test.wi] || '';
    if (t.length < w.length) return w[t.length];
    if (t.length > w.length) return 'backspace';
    return (config.mode === 'words' && test.wi === test.words.length - 1) ? null : ' ';
  }
  function announceNext() {
    if (view !== 'test') return;
    const ch = nextExpectedChar();
    if (ch === 'backspace') kb.highlight([['backspace', 'red']]); else kb.next(ch);
  }

  function startTest() {
    test.started = true; test.startAt = performance.now();
    liveEl.classList.add('show');
    $('config').classList.add('faded');
    test.tickTimer = setInterval(tick, 1000);
    if (config.mode === 'time') test.timer = setTimeout(finishTest, config.time * 1000);
  }

  function tick() {
    const el = (performance.now() - test.startAt) / 1000;
    if (config.mode === 'time') liveLeft.textContent = Math.max(0, Math.ceil(config.time - el));
    const r = computeStats(el); liveWpm.textContent = `${Math.round(r.wpm)} wpm`;
    test.secondSamples.push({ t: Math.round(el), wpm: r.wpm, raw: r.raw, errors: test.keystrokes.filter(k => !k.correct && k.t > (el - 1) * 1000).length });
  }

  function typedTotals(upTo = test.wi, partial = true) {
    let correct = 0, incorrect = 0, extra = 0, missed = 0, correctWordsChars = 0;
    for (let i = 0; i <= upTo && i < test.words.length; i++) {
      const w = test.words[i], t = test.typed[i] || '';
      if (i === upTo && !partial) break;
      for (let k = 0; k < t.length; k++) { if (k >= w.length) extra++; else if (t[k] === w[k]) correct++; else incorrect++; }
      if (i < upTo) { missed += Math.max(0, w.length - t.length); if (t === w) correctWordsChars += w.length + 1; }
      else if (t === w) correctWordsChars += w.length;
    }
    return { correct, incorrect, extra, missed, correctWordsChars };
  }

  function computeStats(elapsedSec) {
    const min = Math.max(elapsedSec, 0.5) / 60;
    const tot = typedTotals();
    const pressed = test.keystrokes.length, good = test.keystrokes.filter(k => k.correct).length;
    return {
      wpm: (tot.correctWordsChars / 5) / min,
      raw: ((tot.correct + tot.incorrect + tot.extra + test.wi) / 5) / min,   // + spaces typed
      accuracy: pressed ? good / pressed : 1,
      ...tot,
    };
  }

  function finishTest() {
    if (test.finished) return;
    test.finished = true; test.endAt = performance.now();
    clearInterval(test.tickTimer); clearTimeout(test.timer);
    const el = (test.endAt - test.startAt) / 1000;
    const r = computeStats(el);
    const samples = test.secondSamples;
    const raws = samples.map(s => s.raw).filter(x => x > 0);
    const mean = raws.reduce((a, b) => a + b, 0) / (raws.length || 1);
    const sd = Math.sqrt(raws.reduce((a, b) => a + (b - mean) ** 2, 0) / (raws.length || 1));
    const consistency = raws.length > 1 ? Math.max(0, 100 - (sd / (mean || 1)) * 100) : 100;
    const typeLabel = `${config.mode} ${config.mode === 'time' ? config.time : config.words}${config.punctuation ? ' · punct' : ''}${config.numbers ? ' · nums' : ''}`;
    showResults({ wpm: r.wpm, raw: r.raw, accuracy: r.accuracy, consistency, time: el, chars: [r.correct, r.incorrect, r.extra, r.missed], type: typeLabel, samples, key: `${config.mode}-${config.mode === 'time' ? config.time : config.words}` });
    kb.next(null);
  }

  function handleTestKey(ev) {
    if (test.finished) return;
    const key = ev.key;
    if (key === 'Backspace') {
      ev.preventDefault();
      const t = test.typed[test.wi];
      if (ev.ctrlKey) { test.typed[test.wi] = ''; }
      else if (t.length) test.typed[test.wi] = t.slice(0, -1);
      else if (test.wi > 0 && test.typed[test.wi - 1] !== test.words[test.wi - 1]) { test.typed.pop(); test.wi--; updateWord(test.wi); }
      updateWord(test.wi); scrollToActive(); positionCaret(); announceNext();
      return;
    }
    if (key.length !== 1 || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    ev.preventDefault();
    if (!test.started) startTest();
    const now = performance.now() - test.startAt;
    const w = test.words[test.wi], t = test.typed[test.wi];
    if (key === ' ') {
      if (t.length === 0) return;                     // ignore leading space
      test.keystrokes.push({ t: now, correct: t === w });
      updateWord(test.wi);
      test.wi++; test.typed[test.wi] = '';
      if (config.mode === 'words') liveLeft.textContent = `${test.wi}/${config.words}`;
      if (config.mode === 'words' && test.wi >= test.words.length) { test.wi--; return finishTest(); }
      if (config.mode === 'time' && test.wi > test.words.length - 25) {
        for (let i = 0; i < 30; i++) test.words.push(makeWord(test.words[test.words.length - 1]));
        renderWords();
      }
      updateWord(test.wi); scrollToActive(); positionCaret();
      if (t === w || t.length >= w.length) announceNext();
      else kb.error(w[t.length], nextExpectedChar());   // space too early: flash the letter you skipped
      return;
    }
    if (t.length >= w.length + 12) return;            // cap runaway extra letters
    const correct = key === w[t.length];
    test.keystrokes.push({ t: now, correct });
    test.typed[test.wi] = t + key;
    updateWord(test.wi); positionCaret();
    caretEl.classList.add('typing'); clearTimeout(test.caretT); test.caretT = setTimeout(() => caretEl.classList.remove('typing'), 700);
    if (config.mode === 'words' && test.wi === test.words.length - 1 && test.typed[test.wi] === w) return finishTest();
    if (correct) announceNext();
    else kb.error(t.length < w.length ? w[t.length] : 'backspace', nextExpectedChar());   // flash the key you should have hit
  }

  // ------------------------------------------------------------------ results
  const history = store.get('history', {});
  function showResults(r) {
    setView('result');
    $('rWpm').textContent = Math.round(r.wpm);
    $('rAcc').textContent = `${Math.round(r.accuracy * 100)}%`;
    $('rRaw').textContent = Math.round(r.raw);
    $('rType').textContent = r.type;
    $('rChars').textContent = r.chars.join('/');
    $('rCons').textContent = `${Math.round(r.consistency)}%`;
    $('rTime').textContent = `${Math.round(r.time)}s`;
    const best = Math.max(history[r.key] || 0, r.wpm);
    $('rBest').textContent = `${Math.round(best)}${r.wpm >= (history[r.key] || 0) && history[r.key] ? ' ★' : ''}`;
    history[r.key] = best; store.set('history', history);
    const ex = $('rCtExtra');
    if (r.ct) { ex.classList.remove('hidden'); ex.textContent = `kills ${r.ct.kills} · score ${r.ct.score} · ${r.ct.difficulty} · ${r.ct.errors} misses`; }
    else ex.classList.add('hidden');
    drawChart(r.samples || []);
  }

  function drawChart(samples) {
    const cv = $('chart'); const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth || 700, H = 220; cv.width = W * dpr; cv.height = H * dpr;
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    const pad = { l: 34, r: 10, t: 12, b: 22 };
    if (samples.length < 2) { c.fillStyle = '#646b7a'; c.font = '13px system-ui'; c.fillText('not enough data for a chart', pad.l, H / 2); return; }
    const maxY = Math.max(10, ...samples.map(s => Math.max(s.wpm, s.raw))) * 1.1;
    const x = i => pad.l + (i / (samples.length - 1)) * (W - pad.l - pad.r);
    const y = v => pad.t + (1 - v / maxY) * (H - pad.t - pad.b);
    c.strokeStyle = '#22262f'; c.fillStyle = '#646b7a'; c.font = '11px system-ui'; c.textAlign = 'right';
    for (let i = 0; i <= 4; i++) { const v = maxY * i / 4, yy = y(v); c.beginPath(); c.moveTo(pad.l, yy); c.lineTo(W - pad.r, yy); c.stroke(); c.fillText(Math.round(v), pad.l - 6, yy + 4); }
    c.textAlign = 'center';
    samples.forEach((s, i) => { if (i % Math.ceil(samples.length / 10) === 0) c.fillText(s.t, x(i), H - 6); });
    const line = (key, color, width) => {
      c.strokeStyle = color; c.lineWidth = width; c.beginPath();
      samples.forEach((s, i) => i ? c.lineTo(x(i), y(s[key])) : c.moveTo(x(i), y(s[key])));
      c.stroke();
    };
    line('raw', '#3a3f4b', 2); line('wpm', '#5ce08a', 2.5);
    c.fillStyle = '#e05c5c';
    samples.forEach((s, i) => { if (s.errors) { c.beginPath(); c.moveTo(x(i), y(s.raw) - 6); c.lineTo(x(i) - 4, y(s.raw) + 2); c.lineTo(x(i) + 4, y(s.raw) + 2); c.fill(); } });
  }

  // ------------------------------------------------------------------ CT defense
  let ct = null;
  const ctOverlay = $('ctOverlay');
  function ensureCt() {
    if (ct) return ct;
    ct = new CTDefense($('ctCanvas'), {
      words: () => makeWord(),
      difficulty: config.ct,
      onNextChar: ch => { if (view === 'ct') kb.next(ch); },
      onError: ch => { if (view === 'ct') kb.error(ch, ch); },
      onHud: h => { liveLeft.textContent = ''; },
      onEnd: r => {
        ctOverlay.classList.remove('hidden');
        ctOverlay.querySelector('.ct-card').innerHTML = `
          <h2>Overrun</h2>
          <div class="stats">
            <div class="stat"><div class="k">kills</div><div class="v">${r.kills}</div></div>
            <div class="stat"><div class="k">score</div><div class="v">${r.score}</div></div>
            <div class="stat"><div class="k">wpm</div><div class="v">${Math.round(r.wpm)}</div></div>
            <div class="stat"><div class="k">acc</div><div class="v">${Math.round(r.accuracy * 100)}%</div></div>
            <div class="stat"><div class="k">time</div><div class="v">${Math.round(r.time)}s</div></div>
          </div>
          <p class="sub">${r.difficulty} · best ${Math.max(history['ct-' + r.difficulty] || 0, r.kills)} kills · press any key to play again</p>`;
        history['ct-' + r.difficulty] = Math.max(history['ct-' + r.difficulty] || 0, r.kills); store.set('history', history);
        $('config').classList.remove('faded');
      },
    });
    return ct;
  }
  function ctStart() {
    ensureCt().setDifficulty(config.ct);
    ctOverlay.classList.add('hidden');
    $('config').classList.add('faded');
    ct.start();
  }
  function ctIdle() {
    ensureCt().stop();
    ct.setDifficulty(config.ct); ct.reset(); ct.resize();
    ctOverlay.classList.remove('hidden');
    ctOverlay.querySelector('.ct-card').innerHTML = `
      <h2>CT Defense</h2>
      <p>Counter-terrorists close in from every side. Each one carries a word — type it to drop them
        before they reach you. The one outlined in <span class="g">green</span> is next.</p>
      <p class="sub">${config.ct} · press any key to start · <kbd>tab</kbd> restart · <kbd>backspace</kbd> fixes a typo</p>`;
    $('config').classList.remove('faded');
    kb.next(null);
  }

  // ------------------------------------------------------------------ views & config UI
  let view = 'test';
  function setView(v) {
    view = v;
    $('testView').classList.toggle('hidden', v !== 'test');
    $('ctView').classList.toggle('hidden', v !== 'ct');
    $('resultView').classList.toggle('hidden', v !== 'result');
    if (v === 'ct') requestAnimationFrame(() => ensureCt().resize());
  }

  function restart() {
    if (ct) ct.stop();
    if (config.mode === 'ct') { setView('ct'); ctIdle(); }
    else { setView('test'); newTest(); }
  }

  function syncConfigUI() {
    document.querySelectorAll('#groupMode button').forEach(b => b.classList.toggle('active', b.dataset.mode === config.mode));
    document.querySelectorAll('#groupTime button').forEach(b => b.classList.toggle('active', +b.dataset.time === config.time));
    document.querySelectorAll('#groupWords button').forEach(b => b.classList.toggle('active', +b.dataset.words === config.words));
    document.querySelectorAll('#groupCt button').forEach(b => b.classList.toggle('active', b.dataset.ct === config.ct));
    document.querySelectorAll('#groupToggles button').forEach(b => b.classList.toggle('active', !!config[b.dataset.toggle]));
    $('groupTime').classList.toggle('hidden', config.mode !== 'time');
    $('groupWords').classList.toggle('hidden', config.mode !== 'words');
    $('groupCt').classList.toggle('hidden', config.mode !== 'ct');
    $('groupToggles').classList.toggle('hidden', config.mode === 'ct');
  }

  $('config').addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.mode) config.mode = b.dataset.mode;
    if (b.dataset.time) config.time = +b.dataset.time;
    if (b.dataset.words) config.words = +b.dataset.words;
    if (b.dataset.ct) config.ct = b.dataset.ct;
    if (b.dataset.toggle) config[b.dataset.toggle] = !config[b.dataset.toggle];
    saveConfig(); syncConfigUI(); restart();
  });
  $('brand').addEventListener('click', restart);
  $('nextBtn').addEventListener('click', restart);

  // ------------------------------------------------------------------ settings drawer
  const sEl = $('settings');
  $('settingsBtn').addEventListener('click', () => { sEl.classList.toggle('hidden'); });
  $('settingsClose').addEventListener('click', () => sEl.classList.add('hidden'));
  const sKb = $('sKb'), sColor = $('sColor'), sUrl = $('sUrl'), sCaret = $('sCaret'), sFont = $('sFont');
  sKb.checked = settings.kb; sColor.value = settings.color; sUrl.value = settings.url; sCaret.checked = settings.smoothCaret; sFont.value = settings.font;
  document.documentElement.style.setProperty('--word-size', `${settings.font}px`);
  sKb.addEventListener('change', () => { settings.kb = sKb.checked; saveSettings(); kb.setEnabled(settings.kb); if (!settings.kb) kb.onStatus({ connected: false, keyboard: false }); });
  sColor.addEventListener('change', () => { settings.color = sColor.value; saveSettings(); kb.setColor(settings.color); });
  sUrl.addEventListener('change', () => { settings.url = sUrl.value.trim(); saveSettings(); kb.url = settings.url; kb.disconnect(); kb.setEnabled(settings.kb); });
  sCaret.addEventListener('change', () => { settings.smoothCaret = sCaret.checked; saveSettings(); positionCaret(); });
  sFont.addEventListener('input', () => { settings.font = +sFont.value; saveSettings(); document.documentElement.style.setProperty('--word-size', `${settings.font}px`); renderWords(); positionCaret(); });
  $('sClear').addEventListener('click', () => { for (const k in history) delete history[k]; store.set('history', {}); });

  // ------------------------------------------------------------------ global keys
  document.addEventListener('keydown', ev => {
    if (!sEl.classList.contains('hidden')) { if (ev.key === 'Escape') sEl.classList.add('hidden'); return; }
    if (ev.key === 'Tab') { ev.preventDefault(); return restart(); }
    if (ev.key === 'Escape') { ev.preventDefault(); return restart(); }
    if (view === 'result') { if (ev.key === 'Enter') restart(); return; }
    if (view === 'ct') {
      if (!ct || !ct.running) { if (ev.key.length === 1 && !ev.ctrlKey && !ev.altKey && !ev.metaKey) { ev.preventDefault(); ctStart(); } return; }
      if (ct.key(ev)) ev.preventDefault();
      return;
    }
    handleTestKey(ev);
  });

  window.addEventListener('resize', () => { if (view === 'test') { scrollToActive(); positionCaret(); } });
  window.addEventListener('blur', () => { document.body.classList.add('blurred'); $('focusHint').classList.remove('hidden'); });
  window.addEventListener('focus', () => { document.body.classList.remove('blurred'); $('focusHint').classList.add('hidden'); announceNext(); });

  // ------------------------------------------------------------------ boot
  syncConfigUI();
  restart();
})();
