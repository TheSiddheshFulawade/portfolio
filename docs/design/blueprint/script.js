'use strict';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const still = matchMedia('(prefers-reduced-motion: reduce)');
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const fmt = (n) => n.toLocaleString('en-US');

/* ---------- content the real site reads from content/ (experience and personal data are placeholders) ---------- */
const DECISIONS = [
  ['Orchestrated saga', 'choreography, where each service reacts to the others\' events', 'Where a payment is and why is one query, and timeouts and compensation have one owner. In choreography the state machine is spread over the services. Deadlines are stored; the sweeper that acts on them, and compensation, are specified and not built yet (PF-06).', 'The orchestrator knows every step, so it is coupled to all of them.', 'PayFlow, ADR-0002 decision 2 and SPEC section 4'],
  ['Hold funds, then capture', 'checking risk first, then debiting the payer and crediting the payee, with a refund credit if a step fails', 'No money leaves the payer before capture, so undoing a payment before capture is one local transaction that releases the hold. The end state REVERSED (specified, not built yet) means any hold was released and nothing was captured, an authorisation reversal in card terms, not captured money sent back.', 'A hold is extra state. Every failure from the moment a hold may exist needs a release, the release must be safe to repeat, and a payment that has been captured is not undone this way.', 'PayFlow, ADR-0002 decision 3 and SPEC section 4'],
  ['Transactional outbox', 'writing to the database and publishing to Kafka as two separate steps', 'A state change and its message commit together, so a crash cannot leave one without the other. Merged tests cover the rollback case and a relay crash after sending and before marking the row sent.', 'Delivery becomes at least once, and the polling relay adds some latency and database load.', 'PayFlow, ADR-0002 decision 4 and messaging module tests'],
  ['Idempotent inbox', 'Kafka exactly-once transactions', 'Kafka transactions cover Kafka-to-Kafka work, and here the effect is a PostgreSQL row. Delivery stays at least once; the inbox makes the effect happen once.', 'Each consumer keeps a processed-message table, and someone has to decide how long to keep its rows.', 'PayFlow, ADR-0002 decision 5 and messaging module tests'],
  ['Ordered locking', 'compare-and-set (CAS) on an immutable snapshot of the whole balance table', 'A fixed order rules out deadlock between transfers, and a transfer touches only its two accounts. Each CAS write copies the whole balance table (80 KB at 10,000 accounts) and a failed swap throws the copy away. In six like-for-like pairs ordered locking answered 2.9× to 4.6× as many submissions per second as CAS.', 'Transfers on a hot account run one at a time. With a small table and many readers CAS could come out ahead; that was not tested. The ratios come from one run on 4 cores.', 'Settlement Lab, measured results (one run, JDK 21.0.13, commit 3eb119a)'],
  ['Explicit SQL with JdbcClient', 'JPA and Hibernate for everything', 'Locking, CHECK constraints and SKIP LOCKED are the design, so they stay visible in review instead of sitting behind a mapping layer.', 'Row mapping is written by hand, and there is no change tracking to lean on.', 'PayFlow, ADR-0002 decision 10'],
];
$('#decs').innerHTML = DECISIONS.map(([a, b, why, cost, ev], i) => `<details class="dec" name="dec"${i ? '' : ' open'}><summary><h3>${a}</h3><span><em style="font-style:normal">over ${b}</em><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M8 2v12M2 8h12"/></svg></span></summary><dl><dt>Chosen over</dt><dd>${b[0].toUpperCase() + b.slice(1)}</dd><dt>Reason</dt><dd>${why}</dd><dt>Cost</dt><dd>${cost}</dd><dt>Evidence</dt><dd>${ev}</dd></dl></details>`).join('');

const CAPS = [
  ['Backend engineering', [['Java', 'Settlement Lab, PayFlow'], ['Spring Boot', 'PayFlow'], ['SQL', 'PayFlow, Settlement Lab'], ['PostgreSQL', 'PayFlow, Settlement Lab'], ['Python', 'PennyWise'], ['Django REST Framework', 'PennyWise'], ['Angular and TypeScript', 'this site']]],
  ['Payments and messaging', [['Apache Kafka', 'PayFlow'], ['Event-driven microservices', 'PayFlow'], ['Saga, outbox and inbox patterns', 'PayFlow']]],
  ['Correctness and resilience', [['Concurrency and thread safety', 'Settlement Lab'], ['Idempotent processing', 'Settlement Lab, PayFlow'], ['Retry and circuit breaker', 'Settlement Lab'], ['Hazelcast', 'PayFlow'], ['Property-based and stress tests', 'Settlement Lab, PayFlow']]],
  ['Delivery and cloud', [['Redis and Celery', 'PennyWise'], ['Testcontainers', 'PayFlow']]],
];
$$('[data-caps]').forEach((el) => { el.innerHTML = CAPS.map(([h, xs]) => `<div><h3>${h}</h3><ul>${xs.map(([a, b]) => `<li>${a}<span>${b}</span></li>`).join('')}</ul></div>`).join(''); });

const JOBS = [
  { when: 'Dates', role: 'Role title', org: 'Organisation', place: 'Place', mode: 'Mode',
    sum: 'One-line summary of the role.',
    groups: [['Theme', ['<b>First highlight</b>, resume-level wording.', '<b>Second highlight</b>.']], ['Another theme', ['<b>Third highlight</b>.']]],
    award: ['Recognition', 'One line.'],
    stack: ['Technology', 'Technology'] },
  { when: 'Dates', role: 'Role title', org: 'Organisation', place: 'Place', mode: 'Mode',
    sum: 'One-line summary of the role.',
    groups: [['Theme', ['<b>First highlight</b>, resume-level wording.', '<b>Second highlight</b>.']], ['Another theme', ['<b>Third highlight</b>.']]],
    stack: ['Technology', 'Technology'] },
];
$('#jobs').innerHTML = JOBS.map((j) => `<article class="job"><aside><p class="when">${j.when}</p><dl><dt>Location</dt><dd>${j.place}, ${j.mode.toLowerCase()}</dd></dl><dl><dt>Stack</dt><dd class="tags">${j.stack.map((s) => `<span>${s}</span>`).join('')}</dd></dl></aside><div><h2>${j.role}</h2><p class="org">${j.org}</p><p class="sum">${j.sum}</p>${j.groups.map(([h, xs]) => `<section class="theme-grp rise"><h3>${h}</h3><ul>${xs.map((x) => `<li>${x}</li>`).join('')}</ul></section>`).join('')}${j.award ? `<div class="award"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="9" r="5.5"/><path d="M8.5 13.5 7 22l5-2.6L17 22l-1.5-8.5"/></svg><p><strong>${j.award[0]}</strong>${j.award[1]}</p></div>` : ''}</div></article>`).join('');

const RES = [['LOCKING', 'Platform', 'None', 248861, 2008, 0], ['LOCKING', 'Platform', 'Flaky', 215823, 2680, 3], ['LOCKING', 'Platform', 'Outage', 172734, 2840, 90036], ['LOCKING', 'Virtual', 'None', 181706, 800, 0], ['LOCKING', 'Virtual', 'Flaky', 225608, 735, 3], ['LOCKING', 'Virtual', 'Outage', 165981, 1342, 86480], ['CAS', 'Platform', 'None', 54027, 9488, 0], ['CAS', 'Platform', 'Flaky', 49865, 8784, 3], ['CAS', 'Platform', 'Outage', 59859, 6282, 94167], ['CAS', 'Virtual', 'None', 55465, 3779, 0], ['CAS', 'Virtual', 'Flaky', 51813, 3507, 3], ['CAS', 'Virtual', 'Outage', 54297, 3409, 95181]];
$('#res tbody').innerHTML = RES.map((r, i) => `<tr class="${r[0][0]}${i % 3 === 2 ? ' grp' : ''}"><td>${r[0] === 'CAS' ? 'CAS' : 'Ordered locking'}</td><td>${r[1]}</td><td>${r[2]}</td><td class="b"><i style="width:${(r[3] / 2488.61).toFixed(1)}%"></i></td><td class="n">${fmt(r[3])}</td><td class="n">${fmt(r[4])}</td><td class="n">${fmt(r[5])}</td><td class="ok">Pass</td></tr>`).join('');

/* ---------- headline: cycles once, then rests (about 4.8 s in total) ---------- */
(() => {
  const words = ['concurrent load.', 'duplicate delivery.', 'broker outages.', 'partial failure.'], el = $('#swap');
  if (still.matches) return;
  let i = 0;
  const show = (w) => { el.innerHTML = `<i class="in">${w}</i>`; };
  show(words[0]);
  const t = setInterval(() => {
    const cur = el.firstChild; cur.className = 'out';
    setTimeout(() => show(words[++i]), 270);
    if (i >= words.length - 2) clearInterval(t);
  }, 1350);
})();

/* ---------- theme and navigation ---------- */
const themeHooks = [];
$('#theme').onclick = () => { const r = document.documentElement; r.dataset.theme = r.dataset.theme === 'light' ? 'dark' : 'light'; themeHooks.forEach((f) => f()); };
function go(view, at) {
  if (view === 'contact') { $('#contact').scrollIntoView(); return; }
  const swap = () => {
    $$('[data-view]').forEach((v) => { v.hidden = v.dataset.view !== view; });
    $$('.nav a').forEach((a) => a.toggleAttribute('aria-current', a.dataset.go === view));
    $('#contact').hidden = view === 'lost';
    const target = at && document.getElementById(at);
    if (target) scrollTo({ top: target.offsetTop - 60, behavior: 'instant' }); else scrollTo({ top: 0, behavior: 'instant' });
    (view === 'home' ? field : view === 'lost' ? field404 : null)?.resize();
    if (view === 'projects') { pf.place(); lab.draw(); }
  };
  if (document.startViewTransition && !still.matches) document.startViewTransition(swap); else swap();
}
document.addEventListener('click', (e) => { const a = e.target.closest('[data-go]'); if (a) { e.preventDefault(); go(a.dataset.go, a.dataset.at); } });

/* ---------- the self-healing field ---------- */
class Field {
  constructor(canvas, text, ui) {
    Object.assign(this, { c: canvas, g: canvas.getContext('2d'), text, ui, pts: [], ghosts: [], dup: 0, until: 0, mode: '', turn: 0, ptr: null, raf: 0, last: 0 });
    const at = (e) => { const b = canvas.getBoundingClientRect(); this.ptr = [e.clientX - b.left, e.clientY - b.top]; this.wake(); };
    canvas.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || e.buttons) at(e); });
    canvas.addEventListener('pointerdown', at);
    for (const n of ['pointerleave', 'pointerup', 'pointercancel']) canvas.addEventListener(n, () => { this.ptr = null; this.wake(); });
    new IntersectionObserver(([x]) => { this.vis = x.isIntersecting; if (this.vis) this.wake(); }).observe(canvas);
    addEventListener('resize', () => this.resize());
    themeHooks.push(() => { this.colours(); this.draw(); });
    this.colours(); document.fonts.ready.then(() => this.resize());
  }
  colours() { this.col = { d: css('--accent'), c: css('--strong'), f: css('--amber'), x: css('--red'), l: css('--line-2') }; }
  resize() {
    const w = this.c.clientWidth, h = this.c.clientHeight; if (!w || (w === this.w && h === this.h)) { this.wake(); return; }
    const r = Math.min(devicePixelRatio || 1, 2); this.w = w; this.h = h; this.c.width = w * r; this.c.height = h * r; this.g.setTransform(r, 0, 0, r, 0, 0);
    const o = document.createElement('canvas'); o.width = w; o.height = h; const g = o.getContext('2d', { willReadFrequently: true });
    let size = Math.min(h * .72, w * .42); const font = () => { g.font = `600 ${size}px "Plex Cond", sans-serif`; }; font();
    const max = w * .84; if (g.measureText(this.text).width > max) { size *= max / g.measureText(this.text).width; font(); }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(this.text, w / 2, h * .46);
    const px = g.getImageData(0, 0, w, h).data, step = Math.max(3.6, Math.min(5.6, w / 130)); this.r = step * .29; this.step = step; const pts = [];
    for (let y = step; y < h - step; y += step) for (let x = step; x < w - step; x += step) if (px[(Math.round(y) * w + Math.round(x)) * 4 + 3] > 130) pts.push({ hx: x, hy: y, x, y, tx: x, ty: y, vx: 0, vy: 0, f: 0, at: 0 });
    pts.sort((a, b) => a.hx - b.hx || a.hy - b.hy); if (pts.length % 2) pts.pop(); pts.forEach((p, i) => { p.k = i % 2 ? 1 : -1; p.px = pts[i - i % 2].hx; });
    this.pts = pts; this.ghosts = []; this.until = 0; this.mode = ''; this.ui?.busy(false); this.draw(); this.wake();
  }
  fail(mode) {
    if (this.until || !this.pts.length) return; const now = performance.now(), { w, h, pts } = this; this.mode = mode; this.ui?.busy(true);
    const minX = Math.min(...pts.map((p) => p.hx)), span = Math.max(...pts.map((p) => p.hx)) - minX + 1;
    if (mode === 'node') {
      const n = this.turn++ % 3, hit = pts.filter((p) => Math.floor((p.px - minX) / span * 3) === n), cols = Math.floor((w - 40) / (this.step * .95));
      hit.forEach((p, i) => { p.tx = 20 + (i % cols) * this.step * .95; p.ty = h - 16 - Math.floor(i / cols) * this.step * .95; p.f = 1; p.at = now + 2300 + i * Math.min(5, 1800 / hit.length); });
      this.until = now + 2300 + 1800 + 1200; this.ui?.say('Node down. Its committed postings are unreachable, not undone. They are rebuilt from the durable log, in order.');
    } else if (mode === 'part') {
      const mid = w / 2, s = w * .055; pts.forEach((p) => { const right = p.px > mid; p.tx = p.hx + (right ? s : -s); p.f = right ? 1 : 0; p.at = now + 2600; });
      this.until = now + 3900; this.ui?.say('Partitioned. The far side keeps its committed postings, but this side cannot read them until the link returns.');
    } else {
      this.ghosts = pts.filter((_, i) => i % 3 === 0).map((p, i) => ({ x: -10 - (i % 40) * 6, y: p.hy, hx: p.hx, hy: p.hy, at: now + (i % 60) * 12, out: 0 }));
      this.until = now + 4200; this.ui?.say('The batch is delivered again. Every id is already recorded, so nothing posts twice.');
    }
    if (still.matches) { pts.forEach((p) => { p.x = p.tx; p.y = p.ty; }); this.dup += this.ghosts.length; this.ghosts = []; this.draw(); setTimeout(() => { pts.forEach((p) => { p.tx = p.x = p.hx; p.ty = p.y = p.hy; p.f = 0; }); this.end(); this.draw(); }, 2200); return; }
    this.wake();
  }
  end() { this.until = 0; this.mode = ''; this.ui?.busy(false); this.ui?.say('Recovered. Every committed posting is back and the net is still zero.'); }
  wake() { if (!this.raf && !still.matches && this.vis !== false) { this.last = performance.now(); this.raf = requestAnimationFrame((t) => this.tick(t)); } }
  tick(t) {
    this.raf = 0; const dt = Math.min(2, Math.max(.2, (t - this.last) / 16.7)); this.last = t; let live = !!this.until || !!this.ptr; const R = Math.max(34, this.w * .05), damp = Math.pow(.83, dt);
    for (const p of this.pts) {
      if (p.at && t > p.at) { p.at = 0; p.tx = p.hx; p.ty = p.hy; p.f = 0; }
      let ax = (p.tx - p.x) * .045, ay = (p.ty - p.y) * .045;
      if (this.ptr) { const dx = p.x - this.ptr[0], dy = p.y - this.ptr[1], d = Math.hypot(dx, dy) || 1; if (d < R) { const k = (1 - d / R) * 2.6; ax += dx / d * k; ay += dy / d * k; } }
      p.vx = (p.vx + ax * dt) * damp; p.vy = (p.vy + ay * dt) * damp; p.x += p.vx * dt; p.y += p.vy * dt;
      if (Math.abs(p.vx) + Math.abs(p.vy) > .03 || Math.abs(p.tx - p.x) + Math.abs(p.ty - p.y) > .4) live = true; else { p.x = p.tx; p.y = p.ty; p.vx = p.vy = 0; }
    }
    this.ghosts = this.ghosts.filter((q) => {
      live = true; if (t < q.at) return true;
      if (!q.out) { q.x += Math.min(Math.max((q.hx - q.x) * .09, 3.2) * dt, Math.max(q.hx - q.x, 0)); if (q.hx - q.x < 2) { q.out = t; this.dup++; } return true; }
      q.y -= dt * .7; return t - q.out < 620;
    });
    if (this.until && t > this.until && !this.ghosts.length) this.end();
    this.draw(t); if (live) this.wake();
  }
  draw(t = 0) {
    const { g, w, h, col, r } = this; if (!w) return; g.clearRect(0, 0, w, h);
    if (this.mode === 'part') { g.strokeStyle = col.l; g.setLineDash([4, 6]); g.beginPath(); g.moveTo(w / 2, 16); g.lineTo(w / 2, h - 16); g.stroke(); g.setLineDash([]); }
    const b = { d: [], c: [], f: [] }; let inf = 0, z = 0;
    for (const p of this.pts) { const away = p.f || Math.abs(p.x - p.hx) + Math.abs(p.y - p.hy) > 7; if (away) inf++; z += p.k; b[away ? 'f' : p.k > 0 ? 'd' : 'c'].push(p); }
    for (const k of ['d', 'c', 'f']) { g.fillStyle = col[k]; g.beginPath(); for (const p of b[k]) { g.moveTo(p.x + r, p.y); g.arc(p.x, p.y, r, 0, 7); } g.fill(); }
    g.strokeStyle = col.f; g.lineWidth = 1; for (const q of this.ghosts) { if (t < q.at) continue; g.globalAlpha = q.out ? Math.max(0, 1 - (t - q.out) / 620) : .85; g.strokeStyle = q.out ? col.x : col.f; g.beginPath(); g.arc(q.x, q.y, r + .6, 0, 7); g.stroke(); } g.globalAlpha = 1;
    this.ui?.tally(this.pts.length - inf, inf, this.dup, 0, z);
  }
}
const invBtns = $$('[data-f]');
const field = new Field($('#field'), 'Σ = 0', {
  busy: (b) => invBtns.forEach((x) => { x.disabled = b; }), say: (s) => { $('#say').textContent = s; },
  tally: (s, f, d, l, z) => { $('#t-s').textContent = fmt(s); $('#t-f').textContent = fmt(f); $('#t-d').textContent = fmt(d); $('#t-n').textContent = fmt(s + f); $('#t-z').textContent = z; },
});
invBtns.forEach((b) => { b.onclick = () => field.fail(b.dataset.f); });
const field404 = new Field($('#field404'), '404');

/* ---------- PayFlow: one payment through the saga ---------- */
const pf = (() => {
  const NAMES = { client: ['Client', 'JWT (planned)'], payment: ['payment-service', 'saga orchestrator'], kafka: ['Kafka', 'keyed by paymentId'], wallet: ['wallet-service', 'holds and balances'], risk: ['risk-service ×2', 'Hazelcast velocity'] };
  const WIDE = { client: [9, 50], payment: [32, 50], kafka: [58, 50], wallet: [85, 22], risk: [85, 78] }, TALL = { client: [26, 10], payment: [66, 30], kafka: [50, 54], wallet: [26, 85], risk: [75, 85] };
  const EDGES = [['client', 'payment'], ['payment', 'kafka'], ['kafka', 'wallet'], ['kafka', 'risk']];
  const STATES = ['RECEIVED', 'RESERVING', 'RISK_CHECKING', 'CAPTURING', 'COMPLETED', '|', 'RELEASING', 'REVERSED', '|', 'REJECTED'], BAD = ['RELEASING', 'REVERSED', 'REJECTED'];
  const SC = { ok: 'Completes', crash: 'Wallet crashes', dup: 'Duplicate delivery', risk: 'Risk rejects', broker: 'Broker outage', poor: 'Insufficient funds' };
  const net = $('#pf-net'), svg = $('svg', net), log = $('#pf-log'); let pos = WIDE, sc = 'ok', S, run = 0, paused = false;
  net.insertAdjacentHTML('beforeend', Object.entries(NAMES).map(([k, [a, b]]) => `<div class="node" data-n="${k}"><b>${a}</b><small>${b}</small>${['payment', 'wallet', 'risk'].includes(k) ? '<small class="q"></small>' : ''}</div>`).join(''));
  svg.innerHTML = EDGES.map(([a, b]) => `<line data-e="${a}-${b}"/>`).join('');
  $('#pf-track').innerHTML = STATES.map((s) => s === '|' ? '<em></em>' : `<span data-s="${s}">${s}</span>`).join('');
  const node = (n) => $(`[data-n="${n}"]`, net), edge = (a, b) => $(`[data-e="${a}-${b}"]`, svg) || $(`[data-e="${b}-${a}"]`, svg);
  const place = () => { pos = net.clientWidth < 560 ? TALL : WIDE; for (const k in pos) { node(k).style.left = pos[k][0] + '%'; node(k).style.top = pos[k][1] + '%'; } for (const [a, b] of EDGES) { const l = edge(a, b); [['x1', pos[a][0]], ['y1', pos[a][1]], ['x2', pos[b][0]], ['y2', pos[b][1]]].forEach(([n, v]) => l.setAttribute(n, v)); } };
  const paint = () => {
    for (const n of ['payment', 'wallet', 'risk']) $('.q', node(n)).textContent = `outbox ${S.out[n]} · inbox ${S.inb[n]}`;
    $('#m-a').style.flexGrow = S.a; $('#m-h').style.flexGrow = S.h; $('#m-p').style.flexGrow = S.p;
    $('#k-a').textContent = fmt(S.a); $('#k-h').textContent = fmt(S.h); $('#k-p').textContent = fmt(S.p); $('#m-s').innerHTML = `Σ (available + held)<br>= ${fmt(S.a + S.h + S.p)}, constant`;
  };
  const reset = () => {
    S = { out: { payment: 0, wallet: 0, risk: 0 }, inb: { payment: 0, wallet: 0, risk: 0 }, a: 800, h: 0, p: 200, down: {} }; if (sc === 'poor') { S.a = 120; S.p = 880; }
    $$('.pkt', net).forEach((x) => x.remove()); $$('.node', net).forEach((x) => x.classList.remove('hit', 'down')); $$('line', svg).forEach((x) => x.removeAttribute('class')); $$('[data-s]').forEach((x) => { x.className = ''; }); log.innerHTML = ''; paint();
  };
  const frame = (ms, fn, id) => new Promise((res, rej) => {
    if (still.matches) { fn?.(1); id === run ? res() : rej(0); return; } let el = 0, last = performance.now();
    const step = (t) => { if (id !== run) { rej(0); return; } if (!paused) el += Math.min(t - last, 120); last = t; const k = Math.min(1, el / ms); fn?.(k); k < 1 ? requestAnimationFrame(step) : res(); }; requestAnimationFrame(step);
  });
  function machine(id) {
    const wait = (ms) => frame(ms, null, id);
    const note = (who, text, cls = '') => { log.insertAdjacentHTML('beforeend', `<li class="${cls}"><span>${who}</span>${text}</li>`); log.scrollTop = log.scrollHeight; };
    const state = async (s) => { $$('[data-s].now').forEach((x) => { x.className = 'was'; }); $(`[data-s="${s}"]`).className = 'now' + (BAD.includes(s) ? ' bad' : ''); await wait(260); };
    const hop = async (a, b, name, cls = '', stop = 1) => {
      const el = document.createElement('div'); el.className = 'pkt ' + cls; el.textContent = name; net.append(el); const l = edge(a, b); l.classList.add('hot'); const W = net.clientWidth, H = net.clientHeight, half = el.offsetWidth / 2;
      await frame(760 * stop, (k) => { const e = (k < .5 ? 2 * k * k : 1 - (2 - 2 * k) ** 2 / 2) * stop; const x = (pos[a][0] + (pos[b][0] - pos[a][0]) * e) / 100 * W, y = (pos[a][1] + (pos[b][1] - pos[a][1]) * e) / 100 * H; el.style.transform = `translate(${Math.max(4, Math.min(W - half * 2 - 4, x - half))}px, ${y - 14 - 58 * Math.abs(2 * e - 1) ** 2}px)`; }, id);
      l.classList.remove('hot'); if (stop < 1) { el.classList.add('dead'); await wait(500); } el.remove(); const n = node(b); n.classList.add('hit'); setTimeout(() => n.classList.remove('hit'), 320);
    };
    const down = (n, d) => { S.down[n] = d; node(n).classList.toggle('down', d); EDGES.filter((e) => e.includes(n) && n !== 'payment').forEach(([a, b]) => edge(a, b).classList.toggle('cut', d)); };
    const commit = async (n) => { S.out[n]++; paint(); await wait(380); };
    const publish = async (n, name, cls) => {
      if (S.down.kafka) { note('relay', `${name} stays in the outbox. The relay polls and retries.`, 'warn'); await hop(n, 'kafka', name, 'warn', .7); await wait(900); down('kafka', false); note('broker', 'Kafka is back. The relay publishes what it kept.'); await wait(500); }
      await hop(n, 'kafka', name, cls); S.out[n]--; paint();
    };
    const deliver = async (n, name, cls) => { await hop('kafka', n, name, cls); S.inb[n]++; paint(); await wait(160); };
    const send = async (from, to, name, cls) => { await commit(from); await publish(from, name, cls); await deliver(to, name, cls); };
    const hold = () => { S.a -= 300; S.h += 300; paint(); }, release = () => { S.h -= 300; S.a += 300; paint(); }, capture = () => { S.h -= 300; S.p += 300; paint(); };
    const start = async () => {
      await hop('client', 'payment', 'POST /payments'); await state('RECEIVED'); note('payment', 'Payment of 300 stored with its Idempotency-Key. 202 returned.'); await wait(350);
      await state('RESERVING'); note('payment', 'State and ReserveFunds committed in one transaction.');
    };
    const reserve = async () => {
      await start(); await send('payment', 'wallet', 'ReserveFunds');
      if (sc === 'poor') { note('wallet', 'Available 120 is below 300. No hold is created.', 'warn'); await send('wallet', 'payment', 'FundsRejected', 'warn'); await state('REJECTED'); note('payment', 'Terminal: REJECTED. No money moved.', 'warn'); return false; }
      hold(); note('wallet', '300 moved from available to held. Message id recorded in the inbox.'); await send('wallet', 'payment', 'FundsReserved'); return true;
    };
    const risk = async () => {
      await state('RISK_CHECKING'); note('payment', 'CheckRisk committed. Deadline 5 s.'); await send('payment', 'risk', 'CheckRisk');
      if (sc === 'risk') {
        note('risk', 'Velocity rule: more than 5 payments in 60 s, counted once across both members.', 'warn'); await send('risk', 'payment', 'RiskRejected', 'warn'); await state('RELEASING'); note('payment', 'Compensation: ReleaseFunds committed.', 'warn');
        await send('payment', 'wallet', 'ReleaseFunds', 'warn'); release(); note('wallet', 'Hold released. 300 is available again.'); await send('wallet', 'payment', 'FundsReleased'); await state('REVERSED'); note('payment', 'Terminal: REVERSED. The payee never saw the money.'); return false;
      }
      note('risk', 'Limit, daily total and velocity rules passed.'); await send('risk', 'payment', 'RiskApproved'); return true;
    };
    const cap = async () => {
      await state('CAPTURING'); note('payment', 'CaptureFunds committed. Deadline 10 s.'); await send('payment', 'wallet', 'CaptureFunds'); capture(); note('wallet', 'Payer hold debited and payee credited in one local transaction.');
      if (sc === 'dup') { await wait(250); note('broker', 'Consumer rebalanced before its offset commit. Kafka redelivers CaptureFunds.', 'warn'); await hop('kafka', 'wallet', 'CaptureFunds again', 'warn'); note('wallet', 'Message id already in the inbox. No second capture; stored reply re-sent.', 'warn'); }
      await send('wallet', 'payment', 'FundsCaptured'); await state('COMPLETED'); note('payment', 'Terminal: COMPLETED. One debit, one credit.');
      if (sc === 'dup') { await commit('wallet'); await publish('wallet', 'FundsCaptured again', 'warn'); await hop('kafka', 'payment', 'FundsCaptured again', 'warn'); note('payment', 'Same message id as before. The inbox drops it; no second effect.', 'warn'); }
    };
    return async () => {
      if (sc === 'crash') {
        await start(); await commit('payment'); await publish('payment', 'ReserveFunds'); down('wallet', true); note('wallet', 'Process killed before it reads the message.', 'bad'); await hop('kafka', 'wallet', 'ReserveFunds', 'warn', .55); await wait(500);
        note('sweeper', 'Step overdue at 10 s. The command is re-sent with a new message id, as attempt 2.', 'warn'); await commit('payment'); await publish('payment', 'ReserveFunds', 'warn'); await wait(500); down('wallet', false); note('wallet', 'Restarted. Kafka delivers from the last committed offset.');
        await deliver('wallet', 'ReserveFunds'); hold(); note('wallet', 'First command: 300 held, message id recorded.'); await send('wallet', 'payment', 'FundsReserved #1', 'warn'); note('payment', 'Reply belongs to attempt 1; the saga is on attempt 2. Ignored.', 'warn'); await deliver('wallet', 'ReserveFunds', 'warn'); note('wallet', 'Re-sent command: new id, but the hold already exists for this payment. No second hold.', 'warn'); await send('wallet', 'payment', 'FundsReserved #2'); note('payment', 'Reply matches attempt 2. Saga moves on.');
      } else { if (sc === 'broker') { down('kafka', true); note('broker', 'Kafka is unreachable.', 'bad'); } if (!(await reserve())) return; }
      if (!(await risk())) return; await cap();
    };
  }
  const rb = $('#pf-run'), pb = $('#pf-pause');
  const idle = () => { reset(); log.innerHTML = '<li class="idle">Choose a scenario and run it. Each entry here is one step of the saga, with the component that took it.</li>'; };
  const go = async () => { const id = ++run; paused = false; pb.textContent = 'Pause'; pb.disabled = false; reset(); rb.textContent = 'Restart'; try { await machine(id)(); pb.disabled = true; rb.textContent = 'Run again'; } catch (e) { if (e) throw e; } };
  $('#pf-sc').innerHTML = Object.entries(SC).map(([k, v]) => `<button data-k="${k}" aria-pressed="${k === sc}">${v}</button>`).join('');
  $('#pf-sc').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; sc = b.dataset.k; $$('#pf-sc button').forEach((x) => x.setAttribute('aria-pressed', x === b)); go(); };
  rb.onclick = go; pb.onclick = () => { paused = !paused; pb.textContent = paused ? 'Resume' : 'Pause'; };
  addEventListener('resize', place); place(); idle();
  return { place, state: () => ({ ...S, terminal: $('[data-s].now')?.dataset.s, done: pb.disabled }) };
})();

/* ---------- Settlement Lab: a real tick-based model ---------- */
function LabSim(mode, fault, seed) {
  let s = seed; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const A = 40, N = 600, pick = () => (rnd() < .55 ? Math.floor(rnd() * 8) : Math.floor(rnd() * A));
  const todo = []; for (let i = 0; i < N; i++) { let f = pick(), t = pick(); while (t === f) t = Math.floor(rnd() * A); const x = { id: i, f, t, amt: 1 + Math.floor(rnd() * 60) }; todo.push(x); if (rnd() < .03) todo.push({ ...x }); }
  const M = { mode, fault, tick: 0, N, bal: Array(A).fill(1000), lock: Array(A).fill(-1), queue: [], ver: 0, seen: new Set(), accepted: new Set(), posts: [], outbox: [], gl: [], rejected: 0, dup: 0, waits: 0, retries: 0, done: 0, breaker: 'closed', opens: 0, fails: 0, openTill: 0, hist: [], end: '', cycle: [], W: Array.from({ length: 8 }, () => ({ x: null, st: 'idle', n: 0 })) };
  const post = (x) => { M.posts.push(x); M.outbox.push(x); M.accepted.add(x.id); };
  const free = (w) => { if (w.x) M.done++; w.x = null; w.st = 'idle'; };
  const work = (w, i) => {
    if (!w.x) { const x = M.queue.shift(); if (!x) return; if (M.seen.has(x.id)) { M.dup++; M.done++; return; } if (mode !== 'none') M.seen.add(x.id); w.x = x; w.n = 0; const [a, b] = mode === 'lock' ? [Math.min(x.f, x.t), Math.max(x.f, x.t)] : [x.f, x.t]; w.a = a; w.b = b; w.st = mode === 'lock' || mode === 'unord' ? 'l1' : 'read'; return; }
    const x = w.x;
    if (w.st === 'l1' || w.st === 'l2') { const k = w.st === 'l1' ? w.a : w.b; if (M.lock[k] < 0) { M.lock[k] = i; w.st = w.st === 'l1' ? 'l2' : 'work'; w.n = 2; } else M.waits++; return; }
    if (w.st === 'read') { w.v = M.ver; w.rf = M.bal[x.f]; w.rt = M.bal[x.t]; w.st = 'work'; w.n = 2; return; }
    if (--w.n > 0) return;
    if (mode === 'cas' && w.v !== M.ver) { M.waits++; w.st = 'read'; return; }
    if (mode === 'none') { M.seen.add(x.id); if (w.rf < x.amt) M.rejected++; else { M.bal[x.f] = w.rf - x.amt; M.bal[x.t] = w.rt + x.amt; post(x); } free(w); return; }
    if (M.bal[x.f] < x.amt) M.rejected++; else { M.bal[x.f] -= x.amt; M.bal[x.t] += x.amt; M.ver++; post(x); }
    if (mode !== 'cas') { M.lock[w.a] = -1; M.lock[w.b] = -1; } free(w);
  };
  const ok = () => (fault === 'outage' && M.tick > 70 && M.tick < 260 ? false : fault === 'flaky' ? rnd() > .14 : true);
  const sender = () => {
    if (M.breaker === 'open') { if (M.tick < M.openTill) return; M.breaker = 'half-open'; }
    for (let j = 0; j < (M.breaker === 'half-open' ? 1 : 5) && M.outbox.length; j++) {
      let sent = ok(); for (let r = 0; !sent && r < 3 && M.breaker === 'closed'; r++) { M.retries++; sent = ok(); }
      if (sent) { M.gl.push(M.outbox.shift()); M.fails = 0; M.breaker = 'closed'; } else { M.fails++; if (M.breaker === 'half-open' || M.fails >= 3) { if (M.breaker === 'closed') M.opens++; M.breaker = 'open'; M.openTill = M.tick + 30; } return; }
    }
  };
  const deadlock = () => { const on = M.W.map((w) => (w.st === 'l2' && M.lock[w.b] >= 0 ? M.lock[w.b] : -1)); for (let i = 0; i < 8; i++) { const path = [i]; let k = on[i]; while (k >= 0 && !path.includes(k)) { path.push(k); k = on[k]; } if (k === i) return path; } return null; };
  M.step = () => {
    if (M.end) return; M.tick++;
    for (let j = 0; j < 5 && todo.length && M.queue.length < 64; j++) M.queue.push(todo.shift());
    M.W.forEach(work); sender(); M.hist.push([M.outbox.length, M.breaker]);
    if (mode === 'unord') { const c = deadlock(); if (c) { M.end = 'deadlock'; M.cycle = c; } }
    if (!todo.length && !M.queue.length && !M.outbox.length && M.W.every((w) => !w.x)) M.end = 'done';
    if (M.tick > 9000) M.end = 'timeout';
  };
  M.check = () => {
    const sum = M.bal.reduce((a, b) => a + b), exp = Array(A).fill(1000); M.posts.forEach((p) => { exp[p.f] -= p.amt; exp[p.t] += p.amt; }); const ids = M.posts.map((p) => p.id), uniq = new Set(ids);
    return { TOTAL_CONSERVED: sum === A * 1000, NO_NEGATIVE_BALANCE: M.bal.every((b) => b >= 0), POSTED_AT_MOST_ONCE: uniq.size === ids.length, POSTINGS_EXPLAIN_BALANCES: exp.every((b, i) => b === M.bal[i]), POSTINGS_MATCH_ACCEPTED: ids.length === M.accepted.size && ids.every((i) => M.accepted.has(i)), GL_MATCHES_POSTINGS: M.gl.length === M.posts.length && M.gl.every((p, i) => p === M.posts[i]), sum, total: A * 1000 };
  };
  return M;
}
const lab = (() => {
  const MODES = { lock: 'Ordered locking', cas: 'CAS', unord: 'Unordered locks', none: 'No synchronisation' }, FAULTS = { none: 'None', flaky: 'Flaky', outage: 'Outage' }, INV = ['TOTAL_CONSERVED', 'NO_NEGATIVE_BALANCE', 'POSTED_AT_MOST_ONCE', 'POSTINGS_EXPLAIN_BALANCES', 'POSTINGS_MATCH_ACCEPTED', 'GL_MATCHES_POSTINGS'];
  let mode = 'lock', fault = 'outage', M = null, id = 0, seed = 20261119;
  const chips = (el, map, cur, set) => { el.innerHTML = Object.entries(map).map(([k, v]) => `<button data-k="${k}" aria-pressed="${k === cur}">${v}${k === 'unord' || k === 'none' && map === MODES ? ' (unsafe)' : ''}</button>`).join(''); el.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; $$('button', el).forEach((x) => x.setAttribute('aria-pressed', x === b)); set(b.dataset.k); go(); }; };
  $('#lb-w').innerHTML = Array.from({ length: 8 }, (_, i) => `<li><b>W${i + 1}</b><span>idle</span></li>`).join(''); $('#lb-a').innerHTML = Array.from({ length: 40 }, (_, i) => `<li>${i + 1}</li>`).join(''); $('#lb-chk').innerHTML = INV.map((x) => `<li>${x}</li>`).join('');
  const W = $$('#lb-w li'), Ac = $$('#lb-a li'), Ch = $$('#lb-chk li');
  const chart = () => {
    const c = $('#lb-ts'), w = c.clientWidth, h = c.clientHeight; if (!w) return; const r = Math.min(devicePixelRatio || 1, 2); c.width = w * r; c.height = h * r; const g = c.getContext('2d'); g.setTransform(r, 0, 0, r, 0, 0); g.fillStyle = css('--raise'); g.fillRect(0, h - 8, w, 8); g.fillStyle = css('--line'); g.fillRect(0, h - 14, w, 1); if (!M?.hist.length) return;
    const H = M.hist, n = Math.max(H.length, 320), max = Math.max(20, ...H.map((x) => x[0])), X = (i) => i / n * w, Y = (v) => h - 15 - v / max * (h - 34);
    g.beginPath(); g.moveTo(0, h - 15); H.forEach((x, i) => g.lineTo(X(i), Y(x[0]))); g.lineTo(X(H.length - 1), h - 15); g.globalAlpha = .18; g.fillStyle = css('--amber'); g.fill(); g.globalAlpha = 1; g.beginPath(); H.forEach((x, i) => g.lineTo(X(i), Y(x[0]))); g.strokeStyle = css('--amber'); g.lineWidth = 1.75; g.stroke();
    const C = { closed: css('--accent'), open: css('--red'), 'half-open': css('--amber') }; H.forEach((x, i) => { g.fillStyle = C[x[1]]; g.fillRect(X(i), h - 8, w / n + 1, 8); });
    g.fillStyle = css('--muted'); g.font = '12px "Plex Mono", monospace'; g.fillText(`peak ${max === 20 ? Math.max(...H.map((x) => x[0])) : max}`, 2, 12);
  };
  const draw = () => {
    chart(); if (!M) return;
    $('#lb-q').textContent = `${M.queue.length} / 64`; $('#lb-qm').style.width = M.queue.length / 64 * 100 + '%'; $('#lb-p').textContent = `${fmt(M.gl.length)} delivered of ${M.N}`; $('#lb-pm').style.width = M.gl.length / M.N * 100 + '%';
    M.W.forEach((w, i) => { const wait = w.st === 'l1' && M.lock[w.a] >= 0 && M.lock[w.a] !== i || w.st === 'l2' && M.lock[w.b] >= 0; W[i].className = M.cycle.includes(i) ? 'dead' : !w.x ? '' : wait ? 'wait' : 'work'; W[i].lastChild.textContent = !w.x ? 'idle' : M.cycle.includes(i) ? `holds ${w.a + 1}, needs ${w.b + 1}` : wait ? `waits ${(w.st === 'l1' ? w.a : w.b) + 1}` : `${w.x.f + 1} → ${w.x.t + 1}`; });
    const want = new Set(), held = new Set(), dead = new Set(); M.W.forEach((w, i) => { if (!w.x) return; if (M.cycle.includes(i)) { dead.add(w.a); } if (w.st === 'l1') want.add(w.a); if (w.st === 'l2') want.add(w.b); if (mode === 'cas' || mode === 'none') { (held.has(w.x.f) ? want : held).add(w.x.f); (held.has(w.x.t) ? want : held).add(w.x.t); } });
    Ac.forEach((a, i) => { a.className = dead.has(i) ? 'dl' : want.has(i) && (M.lock[i] >= 0 || held.has(i)) ? 'ct' : M.lock[i] >= 0 || held.has(i) ? 'lk' : ''; });
    $('#lb-c').textContent = mode === 'cas' ? 'snapshot v' + M.ver : mode === 'none' ? 'unguarded' : `${M.lock.filter((x) => x >= 0).length} locked`; $('#lb-b').textContent = `breaker ${M.breaker}, ${M.outbox.length} waiting`;
    $('#lb-t').textContent = fmt(M.tick); $('#lb-k').textContent = fmt(M.waits); $('#lb-r').textContent = fmt(M.retries); $('#lb-d').textContent = fmt(M.dup);
  };
  const finish = () => {
    const c = M.check(), v = $('#lb-v'), bad = INV.filter((k) => !c[k]);
    if (M.end === 'deadlock') { v.innerHTML = `<b>Deadlock after ${M.tick} ticks.</b> ${[...M.cycle, M.cycle[0]].map((i) => 'W' + (i + 1)).join(' waits for ')}. The invariants can't be asserted, because the run never finishes. Ordered locking makes this cycle impossible.`; Ch.forEach((x) => { x.className = ''; }); return; }
    INV.forEach((k, i) => { Ch[i].className = c[k] ? 'pass' : 'fail'; });
    v.innerHTML = bad.length ? `<b>${bad.length} of 6 invariants failed.</b> The ledger holds ${fmt(c.sum)} instead of ${fmt(c.total)}: concurrent writers overwrote each other's balances${c.POSTED_AT_MOST_ONCE ? '' : ', and resent transfers posted twice'}.` : `<b>All six invariants hold.</b> ${fmt(M.posts.length)} transfers posted once each, ${fmt(M.rejected)} rejected for funds${M.opens ? `, and the outbox drained after the breaker opened and recovered` : M.retries ? `, with ${fmt(M.retries)} publish retries absorbed` : ''}.`;
  };
  const go = () => {
    const me = ++id; M = LabSim(mode, fault, seed); Ch.forEach((x) => { x.className = ''; }); $('#lb-v').textContent = 'Running.'; $('#lb-run').textContent = 'Restart';
    const fin = () => { draw(); finish(); $('#lb-run').textContent = 'Run again'; seed += 7; };
    if (still.matches) { while (!M.end) M.step(); fin(); return; }
    let last = performance.now(), due = 0; const f = (t) => { if (me !== id) return; due += Math.min((t - last) / 1000, .25) * (mode === 'cas' ? 210 : mode === 'unord' && M.tick < 60 ? 12 : 95); last = t; while (due > 1 && !M.end) { M.step(); due--; } draw(); M.end ? fin() : requestAnimationFrame(f); }; requestAnimationFrame(f);
  };
  chips($('#lb-m'), MODES, mode, (k) => { mode = k; }); chips($('#lb-f'), FAULTS, fault, (k) => { fault = k; }); $('#lb-run').onclick = go; themeHooks.push(draw); addEventListener('resize', draw); draw();
  return { draw, model: () => M };
})();
