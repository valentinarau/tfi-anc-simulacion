// Motor de la demo: el mismo lazo que LazoANC.paso de simulacion_anc.py, en JavaScript.
//
// Modelo (secciones 6.2 y 8 del informe):
//   Controlador  Gc = Kp                   [V/V]
//   Actuador     Ga = Ka                   [Pa/V]
//   Proceso      Gp = K e^(-Ts) / (τs+1)   [Pa/Pa]
//   Medición     H  = Km                   [V/Pa]
//   Referencia   R  = 0 (silencio)
//
//   q(t) = d(t) + Ka·u(t)            punto suma acústico
//   τ·dc/dt = -c + K·q(t - T)        proceso (Euler, paso DT = 1 µs)
//   b = Km·c,  e = R - b,  u = Kp·e  (recortada a ±Umáx: saturación del parlante)
//
// c_off es el mismo proceso sin el controlador (sin ANC): lo que llegaría al oído por la vía pasiva.
//
// Este archivo lo usan la app (dentro del AudioWorklet, ver procesador.js) y la verificación
// con node (test/comparar.js). No depende del navegador.

export const KA = 6.0;            // ganancia del parlante [Pa/V]
export const KM = 0.0126;         // sensibilidad del micrófono interno [V/Pa]
export const T_NOM = 40e-6;       // retardo total del lazo [s]
export const U_MAX = 3.0;         // límite de tensión del parlante [V]
export const DT = 1e-6;           // paso de integración [s]
export const T_MAX_BUFFER = 1e-3;
export const CALCE = {
  bueno: { K: 1.0, tau: 1.0e-3 },
  malo: { K: 0.6, tau: 0.5e-3 },
};

// Ruidos urbanos (sección 8.7), las mismas fórmulas que simulacion_anc.py
export const BOCINA_F0 = 420.0;   // fundamental; armónicos 1..8 con amplitud 1/n
export const BOCINA_SUBIDA = 5e-3;
export const COLECTIVO = [[35.0, 1.0], [70.0, 0.7], [105.0, 0.5], [140.0, 0.35]];
export const TRANSITO_BANDAS = [[50.0, 100.0, 1.0], [800.0, 1250.0, 0.5]];
export const TRANSITO_TONOS_POR_BANDA = 20;

// Niveles en el oído (valor eficaz, Pa). Bocina: 100 dB SPL, como el caso 06 de la evidencia.
// Tránsito: 85 dB SPL (contexto de la Tabla 4). Colectivo: 90 dB SPL.
export const NIVEL = { transito: 0.36, colectivo: 0.63, bocina: 2.0 };

// ---------------------------------------------------------------------------
// Ventana de sintonía (igual que kp_limites de Python)
export function kpLimites(K, tau, T, Ka = KA, Km = KM) {
  const G = Ka * K * Km;
  const res = { G, kpMin20: 9.0 / G, kpMin30: 30.62 / G };
  if (T <= 0) return Object.assign(res, { kpMaxPade: Infinity, kpMaxExacto: Infinity, fOsc: NaN });
  res.kpMaxPade = (1 + 2 * tau / T) / G;
  let lo = 1.0, hi = 1e9, w = 0;
  for (let i = 0; i < 200; i++) {
    w = 0.5 * (lo + hi);
    if (w * T + Math.atan(w * tau) > Math.PI) hi = w; else lo = w;
  }
  res.kpMaxExacto = Math.sqrt(1 + (w * tau) ** 2) / G;
  res.fOsc = w / (2 * Math.PI);
  return res;
}

// ---------------------------------------------------------------------------
// El lazo
export class LazoANC {
  constructor({ Kp = 300, K = 1.0, tau = 1.0e-3, T = T_NOM, Ka = KA, Km = KM, uMax = U_MAX, anc = true } = {}) {
    Object.assign(this, { Kp, K, tau, T, Ka, Km, uMax, anc });
    this.reiniciar();
  }

  reiniciar() {
    this.nbuf = Math.round(T_MAX_BUFFER / DT) + 1;
    this.bufQ = new Float64Array(this.nbuf);
    this.bufQoff = new Float64Array(this.nbuf);
    this.idx = 0;
    this.c = 0;        // presión en el oído con ANC [Pa]
    this.cOff = 0;     // presión en el oído sin ANC [Pa]
    this.u = 0;        // salida de control [V]
    this.saturados = 0;
  }

  setCalce(nombre) {
    this.K = CALCE[nombre].K;
    this.tau = CALCE[nombre].tau;
  }

  // Un paso de DT con la perturbación d [Pa]. Mismo orden de operaciones que LazoANC.paso.
  paso(d) {
    const nT = Math.round(Math.min(Math.max(this.T, 0), T_MAX_BUFFER) / DT);
    const a = DT / this.tau;
    const b = this.Km * this.c;          // realimentación [V]
    const e = 0.0 - b;                   // error, referencia nula [V]
    let u = this.anc ? this.Kp * e : 0.0;
    if (Math.abs(u) > this.uMax) { u = u > 0 ? this.uMax : -this.uMax; this.saturados++; }
    const q = d + this.Ka * u;           // superposición acústica [Pa]
    this.bufQ[this.idx] = q;
    this.bufQoff[this.idx] = d;
    let j = (this.idx - nT) % this.nbuf; if (j < 0) j += this.nbuf;
    this.c += a * (-this.c + this.K * this.bufQ[j]);
    this.cOff += a * (-this.cOff + this.K * this.bufQoff[j]);
    this.idx = (this.idx + 1) % this.nbuf;
    this.u = u;
    return this.c;
  }

  // n pasos con d interpolada linealmente de d0 (excluido) a d1 (incluido).
  // Es lo que usa el AudioWorklet: d se calcula a 48 kHz y el lazo avanza de a 1 µs.
  pasos(d0, d1, n) {
    const nT = Math.round(Math.min(Math.max(this.T, 0), T_MAX_BUFFER) / DT);
    const a = DT / this.tau, K = this.K, Km = this.Km, Ka = this.Ka, umax = this.uMax;
    const kp = this.anc ? this.Kp : 0, nbuf = this.nbuf, bq = this.bufQ, bo = this.bufQoff;
    let c = this.c, co = this.cOff, idx = this.idx, u = 0, sat = 0;
    const dd = (d1 - d0) / n;
    for (let i = 1; i <= n; i++) {
      const d = d0 + dd * i;
      u = kp * (0.0 - Km * c);
      if (u > umax) { u = umax; sat++; } else if (u < -umax) { u = -umax; sat++; }
      bq[idx] = d + Ka * u;
      bo[idx] = d;
      let j = idx - nT; if (j < 0) j += nbuf;
      c += a * (-c + K * bq[j]);
      co += a * (-co + K * bo[j]);
      idx++; if (idx === nbuf) idx = 0;
    }
    this.c = c; this.cOff = co; this.idx = idx; this.u = u; this.saturados += sat;
    return sat;
  }
}

// ---------------------------------------------------------------------------
// Ruidos: suma de tonos (mismas fórmulas que agregar_perturbacion de Python)

// Generador pseudoaleatorio con semilla (mulberry32). Python usa otro generador (numpy), así que
// los sorteos no son los mismos números; la verificación compara también con las mismas fases.
export function azar(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Frecuencias, fases y amplitudes de un ruido. amplitud = valor eficaz total [Pa].
export function sortearTonos(tipo, amplitud, rnd) {
  let fs, pesos;
  if (tipo === 'bocina') {
    fs = []; pesos = [];
    for (let n = 1; n <= 8; n++) { fs.push(BOCINA_F0 * n); pesos.push(1 / n); }
  } else if (tipo === 'colectivo') {
    fs = COLECTIVO.map((x) => x[0]); pesos = COLECTIVO.map((x) => x[1]);
  } else if (tipo === 'transito') {
    fs = []; pesos = [];
    for (const [lo, hi, a] of TRANSITO_BANDAS) {
      for (let i = 0; i < TRANSITO_TONOS_POR_BANDA; i++) { fs.push(lo + (hi - lo) * rnd()); pesos.push(a); }
    }
  } else throw new Error('ruido desconocido: ' + tipo);
  const fases = fs.map(() => 2 * Math.PI * rnd());
  const suma2 = pesos.reduce((s, p) => s + p * p, 0);
  const aVec = pesos.map((p) => amplitud * p * Math.sqrt(2.0 / suma2));
  return { tipo, fs, fases, aVec };
}

// Valor de la suma de tonos a tt segundos del comienzo.
export function valorTonos(t, tt) {
  let s = 0;
  const fs = t.fs, fa = t.fases, av = t.aVec;
  for (let i = 0; i < fs.length; i++) s += av[i] * Math.sin(2 * Math.PI * fs[i] * tt + fa[i]);
  return s;
}

// Envolvente de la bocina de Python: sube en rampa 5 ms y baja igual al final.
export function envolventeBocina(tt, dur) {
  const r = dur - tt;
  return Math.min(Math.max(tt / BOCINA_SUBIDA, 0), 1) * Math.min(Math.max(r / BOCINA_SUBIDA, 0), 1);
}

// ---------------------------------------------------------------------------
// La demo: lo que corre dentro del AudioWorklet (sin depender de él, para poder probarlo con node).
//
// Fuentes de ruido (d, lo que llega desde afuera):
//   transito   tránsito sostenido (85 dB SPL)
//   bocina     tránsito a la mitad + bocina de 1 s cada 3 s (100 dB SPL)
//   colectivo  colectivo en ralentí (90 dB SPL)
//   mic        el micrófono de la compu
//   sample     un archivo de audio cargado por el usuario, en loop, llevado al nivel del tránsito
// Salida de audio: c (lo que oís), con la rama de realimentación encendida o apagada.

export const KP_NOMINAL = 300;
export const KP_SUBA = 73.5;      // [1/s] al mantener apretada la línea: 300 → 447 en 2 s
export const KP_TOPE = 650;       // pasa los dos límites (447 flojo, 528 puesto)
export const BOCINA_CADA = 3.0;   // [s]
export const BOCINA_DURA = 1.0;   // [s]
export const CAMBIO = 0.6;        // [s] fundido al cambiar de ruido
export const SALIDA = 0.15;       // escala de audio: 1 Pa en el oído -> 0,15 de fondo de escala
export const MIC_PA = 1 / SALIDA; // escala del micrófono: así, sin ANC y con K = 1, sale lo que entra

// Almohadilla pasiva (suposición de la app, no es un dato del informe): la punta de silicona del
// auricular frena los agudos antes de que lleguen al oído y al micrófono interno. Se aplica solo al
// micrófono y al sample, que traen todo el espectro (incluido el soplido propio del micrófono de la
// compu, casi todo entre 3 y 10 kHz, justo donde el lazo ya no atenúa). Los ruidos generados quedan
// como en Python. Pasabajos de 2.º orden (Butterworth) en 1 kHz: −3 dB a 1 kHz, ~−19 dB a 3 kHz,
// ~−31 dB a 6 kHz.
export const ALMOHADILLA_FC = 1000;   // [Hz]
export const ALMOHADILLA_EN = ['mic', 'sample'];

export class Pasabajos2 {
  constructor(fc, sr) {
    // Biquad pasabajos (fórmulas de R. Bristow-Johnson), Q = 1/√2
    const w0 = 2 * Math.PI * fc / sr, al = Math.sin(w0) / (2 * Math.SQRT1_2), cw = Math.cos(w0);
    const a0 = 1 + al;
    this.b0 = (1 - cw) / 2 / a0; this.b1 = (1 - cw) / a0; this.b2 = this.b0;
    this.a1 = -2 * cw / a0; this.a2 = (1 - al) / a0;
    this.reiniciar();
  }
  reiniciar() { this.z1 = 0; this.z2 = 0; }
  paso(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

export class Demo {
  constructor(sr, seed = 1) {
    this.sr = sr;
    this.lazo = new LazoANC({ Kp: KP_NOMINAL, anc: false });
    this.pasosPorMuestra = 1 / (sr * DT);   // ~20,8 a 48 kHz
    this.acum = 0;
    this.t = 0;                              // tiempo de audio [s]
    const rnd = azar(seed);
    this.tonos = {
      transito: sortearTonos('transito', NIVEL.transito, rnd),
      colectivo: sortearTonos('colectivo', NIVEL.colectivo, rnd),
      bocina: sortearTonos('bocina', NIVEL.bocina, rnd),
    };
    this.fuente = null; this.fuenteAntes = null;
    this.tFuente = 0;                        // cuándo empezó la fuente actual
    this.apretando = false;
    this.sonido = false;
    this.dAnt = 0;
    this.bocinaEnv = 0;
    this.sample = null; this.sampleGanancia = 0;
    this.almohadilla = {};
    for (const f of ALMOHADILLA_EN) this.almohadilla[f] = new Pasabajos2(ALMOHADILLA_FC, sr);
  }

  // Lo que pasa la almohadilla (solo micrófono y sample; el resto pasa igual).
  pasarAlmohadilla(nombre, v) {
    const f = this.almohadilla[nombre];
    return f ? f.paso(v) : v;
  }

  // Mensajes de la interfaz: { fuente, anc, calce, apretar, kp, sonido, sample }
  // apretar: Kp sube mientras dura; al soltar queda fijo donde llegó. kp: fija Kp (300 = de fábrica).
  mensaje(m) {
    if (m.sample) {
      // Audio de un archivo (a la frecuencia del audio). Se lleva al valor eficaz del tránsito.
      const b = m.sample;
      let q = 0; for (let i = 0; i < b.length; i++) q += b[i] * b[i];
      const ef = Math.sqrt(q / Math.max(1, b.length));
      this.sample = b; this.sampleGanancia = ef > 1e-6 ? NIVEL.transito / ef : 0;
    }
    if ('fuente' in m && m.fuente !== this.fuente) {
      this.fuenteAntes = this.fuente; this.fuente = m.fuente; this.tFuente = this.t;
      if (this.almohadilla[m.fuente]) this.almohadilla[m.fuente].reiniciar();
    }
    if ('anc' in m) this.lazo.anc = !!m.anc;
    if ('calce' in m) this.lazo.setCalce(m.calce);
    if ('apretar' in m) this.apretando = !!m.apretar;
    if ('kp' in m) this.lazo.Kp = Math.max(KP_NOMINAL, Math.min(KP_TOPE, +m.kp || KP_NOMINAL));
    if ('sonido' in m) this.sonido = !!m.sonido;
  }

  // Valor de una fuente a tt segundos de su comienzo (x = muestra del micrófono).
  valorFuente(nombre, tt, x) {
    if (nombre === 'transito') return valorTonos(this.tonos.transito, tt);
    if (nombre === 'colectivo') return valorTonos(this.tonos.colectivo, tt);
    if (nombre === 'bocina') {
      const fondo = 0.5 * valorTonos(this.tonos.transito, tt);
      const ph = tt % BOCINA_CADA;
      const env = ph < BOCINA_DURA ? envolventeBocina(ph, BOCINA_DURA) : 0;
      this.bocinaEnv = env;
      return fondo + (env > 0 ? env * valorTonos(this.tonos.bocina, ph) : 0);
    }
    if (nombre === 'mic') return x * MIC_PA;
    if (nombre === 'sample') {
      const b = this.sample;
      return b ? b[Math.floor(tt * this.sr) % b.length] * this.sampleGanancia : 0;
    }
    return 0;
  }

  // Procesa n muestras. entrada: muestras del micrófono (o null). Devuelve en las salidas
  // d, cOff y c de cada muestra (Pa) y en audio la señal para los auriculares.
  // d es lo que entra al lazo (después de la almohadilla); si sal trae fuera, ahí va el sonido
  // completo de afuera, el que se dibuja en oliva.
  procesar(entrada, audio, n, sal) {
    const lazo = this.lazo, dtA = 1 / this.sr;
    let sat = 0, env = 0;
    for (let i = 0; i < n; i++) {
      if (this.apretando && lazo.Kp < KP_TOPE) lazo.Kp = Math.min(KP_TOPE, lazo.Kp + KP_SUBA * dtA);
      const x = entrada ? entrada[i] : 0;
      const tt = this.t - this.tFuente;
      this.bocinaEnv = 0;
      let fuera = this.valorFuente(this.fuente, tt, x);
      env = Math.max(env, this.bocinaEnv);
      let d = this.pasarAlmohadilla(this.fuente, fuera);
      if (this.fuenteAntes !== null && tt < CAMBIO) {
        const k = tt / CAMBIO;
        // la fuente anterior sigue su propio tiempo
        const vA = this.valorFuente(this.fuenteAntes, this.t, x);
        fuera = k * fuera + (1 - k) * vA;
        d = k * d + (1 - k) * this.pasarAlmohadilla(this.fuenteAntes, vA);
      }
      this.acum += this.pasosPorMuestra;
      const np = Math.floor(this.acum);
      this.acum -= np;
      sat += lazo.pasos(this.dAnt, d, np);
      this.dAnt = d;
      this.t += dtA;
      if (sal) { sal.d[i] = d; sal.cOff[i] = lazo.cOff; sal.c[i] = lazo.c; if (sal.fuera) sal.fuera[i] = fuera; }
      if (audio) audio[i] = this.sonido ? Math.tanh(SALIDA * lazo.c) : 0;
    }
    return { sat, env };
  }
}
