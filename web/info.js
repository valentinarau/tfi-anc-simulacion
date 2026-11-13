// Página de información: revelado al scrollear, menú, parallax, "el calce" y "el silbido".
// Lógica traducida de web/referencia/Info.dc.html (especificación en web/referencia/INFO.md).

import { aplicarFavicon } from './favicon.js?v=1';

const $ = (id) => document.getElementById(id);
const pg = $('pg');
const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Foto del micrófono: una por paleta (t0 vereda, t1 sillón, t2 rojo, t3 blanca, t4 bn, t5 colgando).
const FOTO_TEMA = ['vereda', 'sillon', 'rojo', 'blanca', 'bn', 'colgando'];
const tema = Math.max(0, parseInt((document.documentElement.className.match(/t(\d)/) || [])[1] || '0', 10));
for (const img of document.querySelectorAll('[data-foto]')) img.hidden = img.dataset.foto !== FOTO_TEMA[tema];
aplicarFavicon(tema);

// ---------------------------------------------------------------- revelado
// Cada sección aparece una sola vez cuando se ve el 15 %. GRACIAS entra cada vez que el pie vuelve a verse.
let io = null;
const secciones = Array.from(document.querySelectorAll('.rv'));
const fin = $('fin');
if (!reduce && 'IntersectionObserver' in window) {
  pg.setAttribute('data-anim', '');
  io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      const el = en.target;
      if (el === fin) el.classList.toggle('in', en.isIntersecting);
      else if (en.isIntersecting) { el.classList.add('in'); io.unobserve(el); }
    }
  }, { threshold: 0.15 });
  for (const el of secciones) io.observe(el);
  io.observe(fin);
}

// ---------------------------------------------------------------- menú y "volver arriba"
// Va a la posición real de la sección (offsetTop no cuenta el desplazamiento del revelado).
// "Cómo funciona" queda centrada en la ventana si entra entera.
function ir(k, e) {
  const el = $(k);
  if (!el) return;
  if (e) e.preventDefault();
  let y = 0;
  for (let n = el; n; n = n.offsetParent) y += n.offsetTop;
  el.classList.add('in');
  if (io && el !== fin) io.unobserve(el);
  if (k === 'funciona') { const vh = window.innerHeight || 0, h = el.offsetHeight; if (h < vh) y -= (vh - h) / 2; }
  if (k === 'top') y = 0;
  window.scrollTo({ top: Math.max(0, y), behavior: reduce ? 'auto' : 'smooth' });
}
for (const a of document.querySelectorAll('[data-ir]')) a.addEventListener('click', (e) => ir(a.dataset.ir, e));

// Curva suave que pasa por los puntos (Catmull-Rom → Bézier), como en el diseño.
function trazo(xs, ys) {
  let d = 'M' + xs[0].toFixed(1) + ',' + ys[0].toFixed(1);
  for (let i = 0; i < xs.length - 1; i++) {
    const i0 = Math.max(0, i - 1), i3 = Math.min(xs.length - 1, i + 2);
    d += ' C' + (xs[i] + (xs[i + 1] - xs[i0]) / 6).toFixed(1) + ',' + (ys[i] + (ys[i + 1] - ys[i0]) / 6).toFixed(1) + ' '
      + (xs[i + 1] - (xs[i3] - xs[i]) / 6).toFixed(1) + ',' + (ys[i + 1] - (ys[i3] - ys[i]) / 6).toFixed(1) + ' '
      + xs[i + 1].toFixed(1) + ',' + ys[i + 1].toFixed(1);
  }
  return d;
}

// ---------------------------------------------------------------- el calce
const cuerda = (() => {
  const W = 480, H = 240, N = 48;
  // Forma a mano de la línea: recta (bien puesto) y abombada hacia adentro (flojo).
  const B = {
    puesta: [240.5, 240.5, 240.4, 240.2, 239.8, 239.4, 239.0, 238.7, 238.5, 238.6, 238.9, 239.4, 239.9, 240.5, 241.0, 241.3, 241.4, 241.3, 241.0, 240.7, 240.3, 240.0, 239.8, 239.7, 239.7, 239.8, 239.9, 240.0, 240.0, 240.0, 239.9, 239.7, 239.5, 239.3, 239.2, 239.2, 239.3, 239.5, 239.7, 240.0, 240.3, 240.5, 240.7, 240.9, 240.9, 240.9, 240.9, 240.7, 240.6],
    floja: [239.9, 239.5, 239.1, 238.9, 238.8, 239.1, 239.6, 240.2, 240.8, 241.1, 241.0, 240.5, 239.8, 239.2, 238.6, 238.1, 237.4, 236.1, 234.1, 231.0, 227.1, 223.0, 219.2, 216.5, 215.4, 216.1, 218.4, 221.8, 225.8, 229.9, 233.6, 236.6, 238.8, 240.2, 240.6, 240.4, 239.8, 239.2, 238.8, 238.8, 239.1, 239.7, 240.2, 240.5, 240.6, 240.4, 240.1, 239.8, 239.7],
  };
  // Seguimiento del mouse: sin resorte ni rebote.
  const conf = { puesta: { max: 3, gain: 0.05, ease: 0.14, sig: 0.18 }, floja: { max: 7, gain: 0.09, ease: 0.08, sig: 0.24 } };
  const ys = Array.from({ length: N + 1 }, (_, i) => -4 + (H + 8) * i / N);
  const svg = $('cuerda'), path = $('cuerdaPath'), aire = $('aire');
  const st = { calce: 'puesta', x: 0, tgt: 0, y: 0.5, m: 0, last: '' };
  path.setAttribute('d', trazo(B.puesta, ys));

  function set(k) {
    st.calce = k;
    aire.classList.toggle('on', k === 'floja');
    for (const b of document.querySelectorAll('.c-btn')) {
      const on = b.dataset.calce === k;
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    for (const p of document.querySelectorAll('.c-txt')) p.classList.toggle('on', p.dataset.calce === k);
  }
  const alternar = () => set(st.calce === 'puesta' ? 'floja' : 'puesta');
  svg.addEventListener('click', alternar);
  svg.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar(); } });
  svg.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const r = svg.getBoundingClientRect(), c = conf[st.calce];
    const px = (e.clientX - r.left) / (r.width || 1) * W, py = (e.clientY - r.top) / (r.height || 1);
    st.y = Math.max(0.05, Math.min(0.95, py));
    st.tgt = Math.max(-c.max, Math.min(c.max, (px - W / 2) * c.gain));
  });
  svg.addEventListener('pointerleave', () => { st.tgt = 0; });
  for (const b of document.querySelectorAll('.c-btn')) b.addEventListener('click', () => set(b.dataset.calce));

  st.paso = () => {
    const c = conf[st.calce], mt = st.calce === 'floja' ? 1 : 0;
    st.m = reduce ? mt : st.m + (mt - st.m) * 0.08;
    st.x = reduce ? st.tgt : st.x + (st.tgt - st.x) * c.ease;
    const xs = B.puesta.map((bp, i) => bp + (B.floja[i] - bp) * st.m + st.x * Math.exp(-Math.pow((i / N - st.y) / c.sig, 2)));
    const d = trazo(xs, ys);
    if (d !== st.last) { path.setAttribute('d', d); st.last = d; }
  };
  return st;
})();

// ---------------------------------------------------------------- el silbido
// Onda horizontal y quieta: cambia de forma al elegir otro número y queda fija (no se anima en el tiempo).
const silbido = (() => {
  const W = 520, H = 140, YC = H / 2, N = 160;
  // 300: onda chica y lenta (el ruido que queda). 447 / 528: oscilación rápida que crece hasta el tope.
  const conf = { g300: { a: 7, k: 2.2, w: 0.035 }, g447: { a: 34, k: 11, w: 0.32 }, g528: { a: 52, k: 13, w: 0.42 } };
  const st = { gan: 'g447', a: 7, k: 2.2, w: 0.035, ph: 0.6, last: '' };
  const xs = Array.from({ length: N + 1 }, (_, i) => 8 + (W - 16) * i / N);
  const onda = $('sOnda'), path = $('sPath');
  for (const b of document.querySelectorAll('.s-num')) {
    b.addEventListener('click', () => {
      st.gan = b.dataset.gan;
      onda.classList.toggle('on', st.gan !== 'g300');
      for (const o of document.querySelectorAll('.s-num')) {
        const on = o === b;
        o.classList.toggle('on', on); o.setAttribute('aria-pressed', on ? 'true' : 'false');
      }
    });
  }
  st.paso = () => {
    const c = conf[st.gan];
    if (reduce) { st.a = c.a; st.k = c.k; st.w = c.w; }
    else { st.a += (c.a - st.a) * 0.04; st.k += (c.k - st.k) * 0.04; st.w += (c.w - st.w) * 0.05; }
    const ys = xs.map((x, i) => {
      const u = i / N;
      const env = 0.35 + 0.65 * u;            // crece hacia la derecha
      const y = st.a * env * Math.sin(2 * Math.PI * st.k * u - st.ph) + 3 * Math.sin(2 * Math.PI * 1.3 * u + st.ph * 0.2);
      return YC - 58 * Math.tanh(y / 58);     // tope suave
    });
    const d = trazo(xs, ys);
    if (d !== st.last) { path.setAttribute('d', d); st.last = d; }
  };
  return st;
})();

// ---------------------------------------------------------------- cuadro a cuadro
const par = $('parallax');
function bucle() {
  cuerda.paso();
  silbido.paso();
  // Parallax suave (±6 %) de la foto de "Cómo funciona"
  if (!reduce) {
    const vh = window.innerHeight || 1, box = par.parentElement.getBoundingClientRect();
    if (box.bottom > 0 && box.top < vh) {
      const p = Math.max(-1, Math.min(1, (box.top + box.height / 2 - vh / 2) / vh));
      par.style.transform = 'translate3d(0,' + (p * 6).toFixed(2) + '%,0)';
    }
  }
  requestAnimationFrame(bucle);
}
requestAnimationFrame(bucle);
