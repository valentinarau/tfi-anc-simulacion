// borrar el ruido: la interfaz.
//
// Reconstruye el prototipo de diseño (web/referencia/Prototipo.dc.html) en JavaScript plano.
// Las acciones (pick, toggleCancel, toggleLoose, squeezeStart/squeezeEnd, keyDown) son las del
// prototipo. Lo que cambia: el sonido, las ondas y los dB ya no son de relleno, salen del lazo que
// corre en el AudioWorklet (procesador.js + motor.js, la traducción de LazoANC.paso).
//
//   afuera (oliva)  d: el ruido, sin modificar
//   adentro         c sin ANC (oliva fino), c − c sin ANC (rosa: lo que agrega el auricular)
//                   y c (carbón: lo que oís)

const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2, A = 120;
// Geometría del lienzo. Horizontal: la del prototipo (1920 × 1080). Vertical (celular parado): 1080 × 1920,
// misma idea (adentro a la izquierda, afuera a la derecha, la línea en el medio) con otra distribución.
const DISENO = {
  horizontal: { W: 1920, H: 1080, LX: 960, YC: 540, YG: 510, R0: 170, R1: 925, N0: 1000, N1: 1580, golpe: [0, 730] },
  vertical: { W: 1080, H: 1920, LX: 540, YC: 860, YG: 830, R0: 150, R1: 505, N0: 578, N1: 1010, golpe: [450, 1050] },
};
let G = DISENO.horizontal;
let { LX, YC, YG, R0, R1, N0, N1 } = G;
const cl = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (x) => { x = cl(x); return 1 - Math.pow(1 - x, 3); };
const jit = (x) => 1.4 * (Math.sin(x * 0.031 + 1) + 0.6 * Math.sin(x * 0.017 + 2) + 0.4 * Math.sin(x * 0.073)) / 2;
const now = () => performance.now();

const NOMBRES = ['tránsito', 'bocina', 'colectivo', 'micrófono'];
const FUENTE = { 'tránsito': 'transito', bocina: 'bocina', colectivo: 'colectivo', mic: 'mic', sample: 'sample' };
const TEMAS = 6;                          // paletas t0 a t5 del prototipo
const KP_NOMINAL = 300, KP_FLOJO = 447;   // la línea se tensa del todo cuando Kp llega al límite flojo
// Límites de la fórmula del informe (los mismos que dicen el indicador y la página de información).
// El lazo simulado silba apenas pasándolos: ~452 flojo y ~533 puesto (ver web/README.md).
const KP_PUESTO = 528;
const limite = () => (s.loose ? KP_FLOJO : KP_PUESTO);
// La ganancia queda fija al soltar. Tocar G (sin mantener) o tocar la barrita la vuelve a 300;
// arrastrar sobre la barrita la sube o la baja.
let kpFijadoAt = -1e9;                  // cuándo se fijó Kp desde la interfaz (ignora valores viejos del motor)
let gDownAt = 0, gOpDisp = 0, sqDisp = 0;
function fijarKp(v) {
  const kp = Math.round(Math.max(KP_NOMINAL, Math.min(650, v)));
  est.Kp = kp; kpFijadoAt = now();
  if (nodo) nodo.port.postMessage({ kp });
}
const RETARDO_ANC = 300;                  // [ms] el pulso llega de la oreja a la línea y el lazo arranca
// Escala de dibujo [px/Pa]: el ruido de cada fuente ocupa lo mismo que en el prototipo.
// Micrófono y sample: escala automática, pero nunca más grande que la de un ruido de 0,1 Pa eficaces
// (~74 dB SPL). Así una sala tranquila (el micrófono de la notebook en silencio da ~0,02 Pa) se ve tranquila.
const ESCALA_MIN_PA = 0.1;
const ESCALA = { transito: A / (2.5 * 0.36), bocina: A / (2.5 * 0.36), colectivo: A / (2.0 * 0.63) };
const LIM = 1.4 * A;                      // recorte suave del trazo (la bocina y el silbido no se salen)
const soft = (v) => LIM * Math.tanh(v / LIM);
const VENTANA = 0.040;                    // [s] de señal que se ven en pantalla

// ---------------------------------------------------------------- estado (como el del prototipo)
const s = {
  noise: null, prevNoise: null, noiseAt: 0, drawAt: null,
  on: false, onAt: -1e9, offAt: -1e9,
  loose: false, looseAt: -1e9,
  sqAt: null, relAt: 0, relSq: 0,
  mic: 'none', phones: false,
  help: false, helpAt: 0,
  theme: 0,
};
let sampleCargado = false;
let lazoAnc = false;      // rama de realimentación encendida en el modelo
let apretando = false;    // Kp subiendo en el modelo
let timerAnc = null, timerSq = null;

// ---------------------------------------------------------------- audio y simulación
let ac = null, nodo = null, cargando = null, micStream = null, micSrc = null;
let SR = 48000, NW = 1920, RING = 19200;
let ring = null, tot = 0, lpD = 0;
const est = { Kp: KP_NOMINAL, env: 0, wRaw: 0, anc: false, eOff: 0, eOn: 0 };

function ensureAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return cargando; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return Promise.resolve();
  try { ac = new AC({ sampleRate: 48000, latencyHint: 'interactive' }); } catch (e) { ac = new AC(); }
  SR = ac.sampleRate; NW = Math.round(VENTANA * SR); RING = Math.round(0.4 * SR);
  ring = { d: new Float32Array(RING), cOff: new Float32Array(RING), c: new Float32Array(RING), lp: new Float32Array(RING) };
  cargando = ac.audioWorklet.addModule('procesador.js?v=3').then(() => {
    nodo = new AudioWorkletNode(ac, 'anc', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
    nodo.connect(ac.destination);
    nodo.port.onmessage = (e) => recibir(e.data);
    if (micStream && !micSrc) { micSrc = ac.createMediaStreamSource(micStream); micSrc.connect(nodo); }
    sincronizar();
  }).catch((err) => console.error('No se pudo cargar el AudioWorklet', err));
  return cargando;
}

// Lo que la interfaz le pide al modelo.
function sincronizar() {
  if (!nodo) return;
  const playable = !!s.noise && (s.mic === 'none' || (s.mic === 'ok' && s.phones));
  const fuente = s.mic === 'ok' ? 'mic' : (s.mic === 'none' && s.noise ? FUENTE[s.noise] : null);
  nodo.port.postMessage({ fuente, anc: lazoAnc, calce: s.loose ? 'malo' : 'bueno', apretar: apretando, sonido: playable });
}

function recibir(m) {
  const n = m.d.length, a = 1 - Math.exp(-2 * Math.PI * 40 / SR);   // pasabajos de 40 Hz para el disparo
  let sOff = 0, sOn = 0;
  // Afuera (oliva) se dibuja el sonido completo; con micrófono o sample, al lazo entra lo que pasa la almohadilla.
  const dF = m.fuera || m.d;
  for (let i = 0; i < n; i++) {
    const k = (tot + i) % RING;
    ring.d[k] = dF[i]; ring.cOff[k] = m.cOff[i]; ring.c[k] = m.c[i];
    lpD += a * (dF[i] - lpD); ring.lp[k] = lpD;
    sOff += m.cOff[i] * m.cOff[i]; sOn += m.c[i] * m.c[i];
  }
  tot += n;
  const al = 1 - Math.exp(-(n / SR) / 0.25);
  est.eOff += al * (sOff / n - est.eOff);
  est.eOn += al * (sOn / n - est.eOn);
  // Silba: el parlante satura o el lazo amplifica en lugar de atenuar (lo decide el modelo).
  const satFrac = m.sat / Math.max(1, m.pasos);
  est.wRaw = satFrac > 0.01 || (m.anc && sOn > 4 * sOff && sOn / n > 1e-4) ? 1 : 0;
  est.env = m.env; est.anc = m.anc;
  if (now() - kpFijadoAt > 150) est.Kp = m.Kp;   // recién fijado desde la interfaz: puede venir un valor viejo
}

// Últimos VENTANA segundos, empezando en un cruce por cero del ruido (como un osciloscopio).
const snap = { d: null, cOff: null, c: null };
const disp = { d: null, cOff: null, c: null, anti: null, listo: false };
let periodo = 0;                          // muestras entre cruces por cero del ruido
const DERIVA = 0.12;                      // ventanas por segundo
function instantanea(tt) {
  if (!ring || tot < NW + RING / 4) return false;
  if (!snap.d || snap.d.length !== NW) {
    for (const k of ['d', 'cOff', 'c']) { snap[k] = new Float32Array(NW); disp[k] = new Float32Array(NW); }
    disp.anti = new Float32Array(NW); disp.listo = false;
  }
  // Disparo + deriva: la ventana arranca en un cruce por cero y se corre despacio dentro del período
  // (en el prototipo las ondas avanzan ~0,12 ventanas por segundo). Sin la deriva, un ruido periódico
  // como el colectivo queda quieto.
  const delta = periodo > 0 ? ((tt / 1000) * DERIVA * NW) % periodo : 0;
  const desde = tot - NW - Math.floor(delta);
  const tope = Math.round(0.08 * SR);
  const cruces = [];
  for (let k = desde; k > desde - tope && cruces.length < 2; k--) {
    if (ring.lp[(k - 1) % RING] < 0 && ring.lp[k % RING] >= 0) cruces.push(k);
  }
  let ini = tot - NW;
  if (cruces.length) ini = cruces[0] + Math.floor(delta);
  if (cruces.length === 2) {
    const p = cruces[0] - cruces[1];
    if (p > 0.003 * SR) periodo = Math.abs(p - periodo) > 0.1 * periodo ? p : periodo + 0.1 * (p - periodo);
  }
  for (let i = 0; i < NW; i++) {
    const k = (ini + i) % RING;
    snap.d[i] = ring.d[k]; snap.cOff[i] = ring.cOff[k]; snap.c[i] = ring.c[k];
  }
  // Mezcla con el cuadro anterior: el trazo cambia con calma, como en el prototipo.
  const kb = disp.listo ? 0.4 : 1;
  for (let i = 0; i < NW; i++) {
    disp.d[i] += kb * (snap.d[i] - disp.d[i]);
    disp.cOff[i] += kb * (snap.cOff[i] - disp.cOff[i]);
    disp.c[i] += kb * (snap.c[i] - disp.c[i]);
    if (est.anc) disp.anti[i] += kb * (snap.c[i] - snap.cOff[i] - disp.anti[i]);   // si se apaga, queda la última
  }
  disp.listo = true;
  return true;
}
const valor = (arr, u) => {
  if (!arr) return 0;
  const x = cl(u) * (arr.length - 1), i = Math.floor(x), fr = x - i;
  return arr[i] * (1 - fr) + arr[Math.min(arr.length - 1, i + 1)] * fr;
};

// ---------------------------------------------------------------- acciones (las del prototipo)
// Apagar el ruido: silencio, sin cancelar (el auricular queda flojo o puesto, como estaba).
function apagar() {
  const n = now();
  clearTimeout(timerSq);
  apretando = false;
  Object.assign(s, { noise: null, prevNoise: null, drawAt: null, on: false, offAt: n, sqAt: null,
    mic: 'none', phones: false, help: false });
  setAnc(false);
}
function seleccionado(name) {
  return name === 'micrófono' ? (s.mic && s.mic !== 'none') : s.noise === name;
}
function pick(name) {
  ensureAudio();
  const n = now();
  // Tocar el ruido que ya está elegido lo apaga (1 a 4 funcionan como interruptor).
  if (name !== 'sample' && seleccionado(name)) { apagar(); return; }
  if (name === 'micrófono') {
    Object.assign(s, { mic: 'ask', noise: null, prevNoise: null, on: false, offAt: -1e9, drawAt: null, help: false });
    setAnc(false);
    pedirMic();
    return;
  }
  const fromSilence = !s.noise || (s.mic && s.mic !== 'none');
  Object.assign(s, { mic: 'none', phones: false, prevNoise: fromSilence ? null : s.noise, noise: name, noiseAt: n,
    drawAt: fromSilence ? n : s.drawAt, help: false });
  sincronizar();
}
function canCancel() { return !!s.noise && (!s.mic || s.mic === 'none' || s.mic === 'ok'); }
function setAnc(v) {
  clearTimeout(timerAnc);
  lazoAnc = v;
  sincronizar();
}
function toggleCancel() {
  if (!canCancel()) return;
  ensureAudio();
  const n = now();
  if (s.on) { Object.assign(s, { on: false, offAt: n }); setAnc(false); }
  else {
    Object.assign(s, { on: true, onAt: n });
    clearTimeout(timerAnc);
    timerAnc = setTimeout(() => { if (s.on) setAnc(true); }, RETARDO_ANC);
  }
}
// Tocar el título: volver al principio, sin nada sonando (como al abrir la página).
function volverAlInicio() {
  const n = now();
  clearTimeout(timerSq);
  apretando = false;
  fijarKp(KP_NOMINAL);
  Object.assign(s, { noise: null, prevNoise: null, drawAt: null, on: false, offAt: n, sqAt: null, relAt: 0, relSq: 0,
    mic: 'none', phones: false, help: false });
  if (s.loose) Object.assign(s, { loose: false, looseAt: n });
  setAnc(false);
}
function nextTheme() {
  s.theme = ((s.theme || 0) + 1) % TEMAS;
  aplicarTema();
  guardarTema();
}
// La paleta elegida se recuerda (en este navegador) para que la página de información use la misma.
// Cambia solo la clase de la paleta (así no se pierde la clase "vertical" del celular parado).
function aplicarTema() {
  for (let i = 0; i < TEMAS; i++) el.escena.classList.toggle('t' + i, i === s.theme);
  el.escena.classList.add('tema');
}
function guardarTema() { try { localStorage.setItem('anc-tema', String(s.theme)); } catch (e) { /* sin almacenamiento */ } }
function leerTema() {
  try { const n = parseInt(localStorage.getItem('anc-tema'), 10); return n >= 0 && n < TEMAS ? n : 0; } catch (e) { return 0; }
}
// 05 sample: un archivo de audio propio, en loop, que entra al lazo como cualquier otro ruido.
async function onFile(e) {
  const f = e.target && e.target.files && e.target.files[0];
  if (!f) return;
  try { e.target.value = ''; } catch (er) { /* nada */ }
  await ensureAudio();
  if (!ac || !nodo) return;
  try {
    const buf = await ac.decodeAudioData(await f.arrayBuffer());
    const mono = new Float32Array(buf.length);
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < d.length; i++) mono[i] += d[i] / buf.numberOfChannels;
    }
    nodo.port.postMessage({ sample: mono }, [mono.buffer]);
    sampleCargado = true;
    pick('sample');
  } catch (er) {
    console.error('No se pudo leer el archivo de audio', er);
  }
}
function sampleClick(e) {
  if (sampleCargado && s.noise !== 'sample') { e.preventDefault(); pick('sample'); }
}
function toggleLoose() { Object.assign(s, { loose: !s.loose, looseAt: now() }); sincronizar(); }
function squeezeStart(delay) {
  if (s.sqAt) return;
  s.sqAt = now() + delay;
  clearTimeout(timerSq);
  timerSq = setTimeout(() => { if (s.sqAt) { apretando = true; sincronizar(); } }, delay);
}
function squeezeEnd() {
  const n = now();
  if (!s.sqAt) return;
  clearTimeout(timerSq);
  const sq = n >= s.sqAt ? tension() : 0;
  Object.assign(s, { sqAt: null, relAt: n, relSq: sq });
  apretando = false;
  sincronizar();
}
let pd = 0, pdown = false;
function lineDown() { ensureAudio(); pd = now(); pdown = true; squeezeStart(350); }
function lineUp() {
  if (!pdown) return;
  pdown = false;
  const held = now() - pd;
  if (held < 350) {
    clearTimeout(timerSq);
    Object.assign(s, { sqAt: null, loose: !s.loose, looseAt: now() });
    apretando = false;
    sincronizar();
  } else squeezeEnd();
}
let hv = {}, hcur = 0;
function hoverMove(e) {
  const r = e.currentTarget.getBoundingClientRect();
  const lxl = (e.clientX - r.left) * (90 / (r.width || 90));
  const ly = G.golpe[0] + (e.clientY - r.top) * (G.golpe[1] / (r.height || G.golpe[1]));
  hv = { active: true, y: ly, dx: Math.max(-13, Math.min(13, (lxl - 45) * 0.32)) };
}
function hoverOut() { hv = { active: false, y: hv.y || YG - 145, leaveAt: now(), leaveDx: hcur || hv.dx || 0 }; }

function phones(yes) {
  const n = now();
  ensureAudio();
  Object.assign(s, { mic: 'ok', phones: yes, noise: 'mic', prevNoise: null, noiseAt: n, drawAt: n });
  sincronizar();
}
async function pedirMic() {
  try {
    if (!micStream) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('sin getUserMedia');
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      await ensureAudio();
      if (nodo && !micSrc) { micSrc = ac.createMediaStreamSource(micStream); micSrc.connect(nodo); }
    }
    if (s.mic === 'ask') s.mic = 'phones';
  } catch (e) {
    if (s.mic === 'ask') Object.assign(s, { mic: 'denied', noise: null, on: false });
    setAnc(false);
  }
}

function keyDown(e) {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  if (k === 'g' || k === 'G') { e.preventDefault(); if (!e.repeat) { ensureAudio(); gDownAt = now(); squeezeStart(0); } return; }
  if (k === ' ' || k === 'Spacebar') { e.preventDefault(); if (!e.repeat) toggleCancel(); return; }
  if (e.repeat) return;
  if (k === '1') pick('tránsito');
  else if (k === '2') pick('bocina');
  else if (k === '3') pick('colectivo');
  else if (k === '4') pick('micrófono');
  else if (k === 'f' || k === 'F') toggleLoose();
  else if (k === '?' || (k === '/' && e.shiftKey)) Object.assign(s, { help: true, helpAt: now() });
  else if (k === 'Escape') {
    if (s.help) s.help = false;
    else if (s.mic === 'phones') phones(false);
    else if (s.mic === 'ask') s.mic = 'none';
  }
}
function keyUp(e) {
  const k = e.key;
  if (k === 'g' || k === 'G') {
    squeezeEnd();
    if (now() - gDownAt < 250) fijarKp(KP_NOMINAL);   // tocar G sin mantener: vuelve a 300
  }
  if (k === ' ' || k === 'Spacebar') e.preventDefault();
}

// Tensión de la línea: sigue a Kp en el modelo (0 con Kp = 300, 1 al llegar al límite flojo, 447).
// Como en el prototipo final, el límite depende del calce: 447 flojo, 528 puesto.
function tension() { return cl((est.Kp - KP_NOMINAL) / (limite() - KP_NOMINAL)); }

// ---------------------------------------------------------------- dibujo
let wl = 0, ultimo = 0, esc = ESCALA.transito, micRms = 0.05, phr = null, phrAt = 0;
const el = {};

function dibujar(tt, dt) {
  const visible = !!s.noise && (!s.mic || s.mic === 'none' || s.mic === 'ok');
  if (visible) instantanea(tt);

  // cancelar
  const on = !!s.on, onAt = s.onAt, offAt = s.offAt;
  let a = 0, b = 0, c = 0;
  if (on) { a = cl((tt - onAt) / 300); b = ease((tt - onAt - 300) / 400); c = ease((tt - onAt - 700) / 800); }
  else { b = 1 - ease((tt - offAt) / 400); c = 1 - ease((tt - offAt) / 600); }
  // aflojar
  const lg = s.loose ? ease((tt - s.looseAt) / 600) : 1 - ease((tt - s.looseAt) / 400);
  // apretar: la tensión sigue a Kp; el silbido lo decide el modelo
  const sqOn = s.sqAt != null && tt >= s.sqAt;
  // Kp queda fijo al soltar, así que la línea sigue tensa mientras la ganancia no vuelva a 300.
  sqDisp += (tension() - sqDisp) * Math.min(1, dt / 120);
  const sq = sqDisp;
  wl = est.wRaw && visible ? Math.min(1, wl + dt / 700) : Math.max(0, wl - dt / 1000);
  const w = wl * wl * (3 - 2 * wl);

  // escala de dibujo
  const fuente = s.mic === 'ok' ? 'mic' : FUENTE[s.noise];
  const auto = fuente === 'mic' || fuente === 'sample';
  if (auto && disp.listo) {
    let q = 0; for (let i = 0; i < NW; i += 4) q += disp.d[i] * disp.d[i];
    micRms += 0.05 * (Math.sqrt(q / (NW / 4)) - micRms);
  }
  const escObj = auto ? A / (2.5 * Math.max(micRms, ESCALA_MIN_PA)) : (ESCALA[fuente] || esc);
  esc += 0.15 * (escObj - esc);

  // trazos
  const path = (x0, x1, n, fy) => {
    if (x1 - x0 < 2) return '';
    let d = '';
    for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n; d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + (YC + fy(x)).toFixed(1); }
    return d;
  };
  const dA = s.drawAt;
  const rOut = dA != null ? ease((tt - dA) / 1200) : 0;
  const rIn = dA != null ? ease((tt - dA - 500) / 900) : 0;
  const uN = (x) => (x - N0) / (N1 - N0), uR = (x) => (x - R0) / (R1 - R0);
  const hay = visible && disp.listo;
  const out = hay ? path(N1 - rOut * (N1 - N0), N1, 290, (x) => soft(esc * valor(disp.d, uN(x))) + jit(x)) : path(N0, N1, 40, (x) => jit(x));
  const nW = w > 0.02 ? 380 : 150;
  const xIn0 = R1 - rIn * (R1 - R0);
  // lo que oís: c. Mientras el carbón "se achica" (0,8 s) se mezcla con c sin ANC, como en el prototipo.
  const residV = (u) => { const co = valor(disp.cOff, u); return co + c * (valor(disp.c, u) - co); };
  const resid = hay ? path(xIn0, R1, nW, (x) => soft(esc * residV(uR(x))) + jit(x + 300)) : path(R0, R1, 40, (x) => jit(x + 300));
  const ghost = hay && b > 0.01 ? path(xIn0, R1, 150, (x) => soft(esc * valor(disp.cOff, uR(x))) + jit(x + 600)) : '';
  const aFront = R1 - Math.max(b, w) * (R1 - R0);
  const anti = hay && (b > 0.01 || w > 0.01) ? path(Math.max(aFront, xIn0), R1, nW, (x) => soft(esc * valor(disp.anti, uR(x))) + jit(x + 900)) : '';

  // la línea
  if (hv.active) hcur += (hv.dx - hcur) * 0.3; else hcur = 0;
  const hAmp = hv.active ? hcur : (hv.leaveAt ? hv.leaveDx * Math.exp(-(tt - hv.leaveAt) / 260) * Math.cos(TAU * (tt - hv.leaveAt) / 170) : 0);
  const hy = hv.y || YG - 145;
  const hvf = (y) => (Math.abs(hAmp) < 0.05 ? 0 : hAmp * Math.exp(-Math.pow((y - hy) / 110, 2)));
  const lx = (y) => LX + hvf(y) + 2 * jit(y * 1.7) - 80 * lg * Math.exp(-Math.pow((y - YG) / 95, 2))
    + (1.5 + 4.5 * sq) * sq * Math.sin(y / 4.5 + tt * 0.09) + 9 * w * Math.sin(TAU * y / 15 + tt * 0.05);
  const step = (w > 0.02 || sq > 0.02) ? 5 : 12;
  let line = '', region = '', first = true;
  const gap = 78 * lg;
  // La línea y el oliva siguen más allá del lienzo de 1920 × 1080, así el margen que sobra cuando la
  // ventana tiene otra proporción no se nota.
  const yFin = G.H + 1210;
  for (let y = -1200; y <= yFin; y += step) {
    const x = lx(y).toFixed(1);
    region += (y === -1200 ? 'M' : 'L') + x + ' ' + y;
    const inGap = gap > 4 && y > YG - gap && y < YG + gap;
    if (inGap) { first = true; continue; }
    line += (first ? 'M' : 'L') + x + ' ' + y; first = false;
  }
  region += 'L6000 ' + yFin + 'L6000 -1200Z';

  // frase
  const golpe = s.noise === 'bocina' && est.env > 0.15;
  let phrase = '', pc = 'var(--oliva)';
  if (s.mic === 'ask') phrase = '¿me prestás el micrófono?';
  else if (s.mic === 'denied' || s.mic === 'phones') phrase = '';
  else if (w > 0.5) { phrase = 'silba'; pc = 'var(--ladrillo)'; }
  else if (!s.noise) phrase = '';
  else if (on && golpe && c > 0.5) phrase = 'un golpe';
  else if (s.loose) phrase = 'flojo';
  else if (on && c > 0.3) phrase = 'casi silencio';
  else phrase = 'ruido';
  if (phrase !== phr) { phr = phrase; phrAt = tt; }
  const phraseOp = cl((tt - phrAt) / 400);

  // número: atenuación medida en la simulación (c sin ANC / c, valores eficaces)
  const db = est.anc && est.eOn > 0 ? 10 * Math.log10(est.eOff / est.eOn) : 0;
  const showNum = visible && on && c > 0.02 && w < 0.5;
  const num = Math.round(Math.max(0, db) * c) + ' dB';
  const numColor = db < 20 ? 'var(--ladrillo)' : 'var(--oliva)';

  // pulso escucha → responde
  const pulseX = 84 + (LX - 84) * ease(a);
  const pulseOp = on && tt - onAt < 450 ? (a < 1 ? 1 : 1 - cl((tt - onAt - 300) / 150)) : 0;
  const pulseX2 = 84 + (LX - 84) * ease(cl((tt - onAt - 60) / 300));

  // ---- al DOM
  el.region.setAttribute('d', region);
  el.out.setAttribute('d', out); el.out.setAttribute('opacity', visible ? 1 : 0.4);
  el.ghost.setAttribute('d', ghost); el.ghost.setAttribute('opacity', (0.55 * b).toFixed(2));
  el.anti.setAttribute('d', anti);
  el.resid.setAttribute('d', resid); el.resid.setAttribute('opacity', visible ? 1 : 0.3);
  el.line.setAttribute('d', line); el.line.setAttribute('stroke-width', (5 - 1.5 * sq + 3 * w).toFixed(2));
  el.pulso1.setAttribute('cx', pulseX.toFixed(1)); el.pulso1.setAttribute('opacity', pulseOp.toFixed(2));
  el.pulso2.setAttribute('cx', pulseX2.toFixed(1)); el.pulso2.setAttribute('opacity', (pulseOp * 0.45).toFixed(2));
  if (el.frase.textContent !== phrase) el.frase.textContent = phrase;
  el.frase.style.color = pc; el.frase.style.opacity = phraseOp.toFixed(2);
  el.numero.hidden = !showNum;
  if (showNum) { el.numVal.textContent = num; el.numVal.style.color = numColor; }

  const can = canCancel();
  el.cancelar.style.opacity = can ? 1 : 0.45;
  el.cancelar.setAttribute('aria-pressed', on ? 'true' : 'false');
  el.cCirc.style.fill = on ? 'var(--rosa)' : 'var(--papel)';
  el.cCirc.style.stroke = on ? 'var(--rosa)' : 'var(--oliva)';
  el.cDot.style.fill = on ? 'var(--papel)' : 'var(--oliva)';
  el.cDot.setAttribute('r', on ? 9 : 7);

  el.pedir.hidden = s.mic !== 'ask';
  el.bloqueado.hidden = s.mic !== 'denied';
  el.auris.hidden = s.mic !== 'phones';

  const beat = 0.5 + 0.5 * Math.sin(tt / 255);
  const idle = !s.noise && (!s.mic || s.mic === 'none');
  el.items.forEach((bt, i) => {
    const nm = NOMBRES[i];
    const sel = nm === 'micrófono' ? (s.mic && s.mic !== 'none') : s.noise === nm;
    const pulse = idle && i === 0;
    bt.setAttribute('aria-pressed', sel ? 'true' : 'false');
    bt.style.fontWeight = sel ? 600 : 400;
    bt.style.opacity = pulse ? (0.6 + 0.4 * beat).toFixed(2) : 1;
    bt.style.transform = 'scale(' + (pulse ? (1 + 0.06 * beat).toFixed(3) : 1) + ')';
    bt.style.textDecoration = nm === 'micrófono' && s.mic === 'denied' ? 'line-through' : 'none';
    bt.querySelector('.icono').style.visibility = sel ? 'visible' : 'hidden';
  });

  const sOn = s.noise === 'sample';
  el.sample.style.fontWeight = sOn ? 600 : 400;
  el.sample.querySelector('.icono').style.visibility = sOn ? 'visible' : 'hidden';

  // Indicador "ganancia 300 → N": mientras se aprieta la línea; al soltar se desvanece en 0,3 s.
  // Queda a la vista mientras se aprieta o mientras la ganancia no sea 300; aparece y se va en 0,3 s.
  const gVer = sqOn || est.Kp > KP_NOMINAL + 0.5;
  gOpDisp = gVer ? Math.min(1, gOpDisp + dt / 300) : Math.max(0, gOpDisp - dt / 300);
  const gOp = gOpDisp;
  el.ganancia.hidden = gOp <= 0.01;
  el.ganancia.style.pointerEvents = gVer ? 'auto' : 'none';
  if (gOp > 0.01) {
    const kp = est.Kp, lim = limite();
    el.ganancia.style.opacity = gOp.toFixed(2);
    el.ganancia.style.color = kp > lim ? 'var(--ladrillo)' : 'var(--carbon)';
    el.gKp.textContent = Math.round(kp);
    el.gPunto.setAttribute('cx', (230 * cl((kp - KP_NOMINAL) / 400)).toFixed(1));
    const lx = (230 * (lim - KP_NOMINAL) / 400).toFixed(1);
    el.gLim.setAttribute('x1', lx); el.gLim.setAttribute('x2', lx);
    el.gLimTxt.setAttribute('x', lx); el.gLimTxt.textContent = lim;
  }

  const hA = cl((tt - s.helpAt) / 350);
  el.ayudaCapa.hidden = !s.help;
  el.ayuda.style.opacity = hA.toFixed(2);
  el.ayuda.style.transform = `translateY(${(-20 * (1 - ease(hA))).toFixed(1)}px) rotate(-1deg)`;
}

function bucle(ts) {
  if (ts - ultimo > 30) { const dt = Math.min(200, ts - ultimo); ultimo = ts; dibujar(ts, dt); }
  requestAnimationFrame(bucle);
}

// ---------------------------------------------------------------- escala del lienzo 1920 × 1080
function ajustar() {
  const W = window.innerWidth, H = window.innerHeight;
  const vertical = H > W;
  const nuevo = vertical ? DISENO.vertical : DISENO.horizontal;
  if (nuevo !== G) {
    G = nuevo; ({ LX, YC, YG, R0, R1, N0, N1 } = G);
    hv = {};
  }
  el.escena.classList.toggle('vertical', vertical);
  el.lienzo.style.width = G.W + 'px'; el.lienzo.style.height = G.H + 'px';
  for (const sv of el.lienzo.querySelectorAll(':scope > svg')) {
    sv.setAttribute('width', G.W); sv.setAttribute('height', G.H); sv.setAttribute('viewBox', `0 0 ${G.W} ${G.H}`);
  }
  el.oreja.setAttribute('transform', `translate(0 ${YC - 540})`);
  el.pulso1.setAttribute('cy', YC); el.pulso2.setAttribute('cy', YC);
  const k = Math.min(W / G.W, H / G.H);
  el.lienzo.style.transform = `translate(${((W - G.W * k) / 2).toFixed(1)}px, ${((H - G.H * k) / 2).toFixed(1)}px) scale(${k})`;
}

function iniciar() {
  for (const id of ['escena', 'lienzo', 'region', 'out', 'ghost', 'anti', 'resid', 'line', 'pulso1', 'pulso2', 'frase', 'numero', 'numVal',
    'cancelar', 'cCirc', 'cDot', 'oreja', 'pedir', 'bloqueado', 'auris', 'ayudaCapa', 'ayuda', 'sample',
    'ganancia', 'gKp', 'gPunto', 'gLim', 'gLimTxt']) el[id] = $(id);
  s.theme = leerTema();
  aplicarTema();
  el.items = Array.from(document.querySelectorAll('.item'));
  el.items.forEach((bt) => bt.addEventListener('click', () => pick(NOMBRES[+bt.dataset.i])));
  el.cancelar.addEventListener('click', toggleCancel);
  const ln = $('linea');
  ln.addEventListener('pointerdown', (e) => { try { ln.setPointerCapture(e.pointerId); } catch (er) { /* nada */ } lineDown(e); });
  ln.addEventListener('pointerup', lineUp);
  ln.addEventListener('pointercancel', lineUp);
  ln.addEventListener('pointerleave', () => { hoverOut(); lineUp(); });
  ln.addEventListener('pointerenter', hoverMove);
  ln.addEventListener('pointermove', hoverMove);
  ln.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); toggleLoose(); } });
  $('micBtn').addEventListener('click', () => { ensureAudio(); pedirMic(); });
  $('aurisSi').addEventListener('click', () => phones(true));
  $('aurisNo').addEventListener('click', () => phones(false));
  el.sample.addEventListener('click', sampleClick);
  $('archivo').addEventListener('change', onFile);
  $('temaBtn').addEventListener('click', nextTheme);
  const titulo = $('titulo');
  titulo.addEventListener('click', volverAlInicio);
  titulo.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); volverAlInicio(); } });
  $('ayudaBtn').addEventListener('click', () => Object.assign(s, { help: true, helpAt: now() }));
  $('ayudaFondo').addEventListener('click', () => { s.help = false; });
  // Barrita de la ganancia: tocarla vuelve a 300; arrastrar sobre ella la sube o la baja.
  const gBarra = el.ganancia.querySelector('svg');
  let gArr = null;
  const kpEn = (x) => { const r = gBarra.getBoundingClientRect(); return KP_NOMINAL + 400 * (x - r.left) / (r.width || 1); };
  el.ganancia.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    gArr = { x: e.clientX, mueve: false };
    try { el.ganancia.setPointerCapture(e.pointerId); } catch (er) { /* nada */ }
  });
  el.ganancia.addEventListener('pointermove', (e) => {
    if (!gArr) return;
    if (!gArr.mueve && Math.abs(e.clientX - gArr.x) > 6) gArr.mueve = true;
    if (gArr.mueve) fijarKp(kpEn(e.clientX));
  });
  const gFin = () => { if (gArr && !gArr.mueve) fijarKp(KP_NOMINAL); gArr = null; };
  el.ganancia.addEventListener('pointerup', gFin);
  el.ganancia.addEventListener('pointercancel', () => { gArr = null; });
  document.addEventListener('keydown', keyDown);
  document.addEventListener('keyup', keyUp);
  window.addEventListener('resize', ajustar);
  // Navegadores sin overflow: clip: si el foco desplaza la escena, volverla a su lugar.
  el.escena.addEventListener('scroll', () => { el.escena.scrollLeft = 0; el.escena.scrollTop = 0; });
  ajustar();
  requestAnimationFrame(bucle);
}

iniciar();

// Para revisar desde la consola: ancEstado() muestra lo que reporta la simulación.
window.ancEstado = () => ({
  muestras: tot, sr: SR, segundos: tot / SR, Kp: est.Kp, anc: est.anc, silba: est.wRaw, silbaDibujo: wl,
  atenuacionDb: est.eOn > 0 ? 10 * Math.log10(est.eOff / est.eOn) : null, contexto: ac && ac.state,
});
