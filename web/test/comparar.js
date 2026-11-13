// Verificación del motor JavaScript de la app contra el simulador en Python.
//
// Uso (desde la raíz del repo):
//   node web/test/comparar.js               compara y muestra la tabla
//   node web/test/comparar.js --evidencia   además escribe evidencia/07_app_web/README.md
//
// Toma los valores de Python de web/test/referencia_python.json. Si encuentra Python con numpy
// (venv/bin/python o python3), primero lo regenera corriendo web/test/referencia_python.py.
//
// Qué compara (tolerancia ±0,5 dB y ±1 % en Kp y en el escalón):
//   A. El lazo paso a paso (1 µs), con exactamente el mismo ruido que sorteó Python.
//   B. El camino de la app: ruido calculado a 48 kHz, el lazo avanza ~21 pasos de 1 µs por muestra
//      (lo mismo que hace el AudioWorklet), con el ruido que sortea la propia app.
//   C. Kp máximo: la fórmula exacta y el límite que aparece al simular (búsqueda por bisección).
//   D. Escalón de 0,5 Pa: c en estado estable.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LazoANC, CALCE, DT, T_NOM, NIVEL, kpLimites, azar, sortearTonos, valorTonos, envolventeBocina,
  Demo, BOCINA_DURA,
} from '../motor.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..');
const TOL_DB = 0.5, TOL_REL = 0.01;
const SR = 48000;

// ---------------------------------------------------------------- referencia de Python
function refrescarPython() {
  for (const py of [join(RAIZ, 'venv', 'bin', 'python'), 'python3', 'python']) {
    if (py.includes('/') && !existsSync(py)) continue;
    const r = spawnSync(py, [join(AQUI, 'referencia_python.py')], { cwd: RAIZ, encoding: 'utf8' });
    if (r.status === 0) return py;
  }
  return null;
}
const pyUsado = refrescarPython();
const ref = JSON.parse(readFileSync(join(AQUI, 'referencia_python.json'), 'utf8'));

// ---------------------------------------------------------------- utilidades
const rms = (a, i0, i1) => { let s = 0; for (let i = i0; i < i1; i++) s += a[i] * a[i]; return Math.sqrt(s / (i1 - i0)); };
const atenuacion = (cOff, c, i0, i1) => 20 * Math.log10(rms(cOff, i0, i1) / Math.max(rms(c, i0, i1), 1e-12));
const media = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const f = (x, d = 2) => x.toFixed(d).replace('.', ',');
const NOMBRE = { transito: 'Tránsito', colectivo: 'Colectivo', bocina: 'Bocina' };

// Ruido de un caso: la suma de tonos (con la envolvente si es la bocina).
function senal(tonos, tipo, dur) {
  return (tt) => {
    const s = valorTonos(tonos, tt);
    return tipo === 'bocina' ? s * envolventeBocina(tt, dur) : s;
  };
}

// A. Paso a paso, 1 µs, como Python: 5 ms en reposo y después el ruido.
function corridaPaso(tipo, calce, tonos, dur, medir) {
  const lazo = new LazoANC({ Kp: ref.Kp });
  lazo.setCalce(calce);
  for (let i = 0; i < Math.round(5e-3 / DT); i++) lazo.paso(0);
  const n = Math.round(dur / DT), d = senal(tonos, tipo, dur);
  const c = new Float64Array(n), cOff = new Float64Array(n);
  for (let i = 0; i < n; i++) { lazo.paso(d(i * DT)); c[i] = lazo.c; cOff[i] = lazo.cOff; }
  return atenuacion(cOff, c, Math.round(medir[0] / DT), Math.round(medir[1] / DT));
}

// B. Camino de la app: d a 48 kHz, el lazo avanza de a 1 µs con d interpolada (LazoANC.pasos).
function corridaApp(tipo, calce, tonos, dur, medir) {
  const lazo = new LazoANC({ Kp: ref.Kp });
  lazo.setCalce(calce);
  const ppm = 1 / (SR * DT);
  let acum = 0, dAnt = 0;
  const avanzar = (dv) => { acum += ppm; const np = Math.floor(acum); acum -= np; lazo.pasos(dAnt, dv, np); dAnt = dv; };
  for (let k = 0; k < Math.round(5e-3 * SR); k++) avanzar(0);
  const n = Math.round(dur * SR), d = senal(tonos, tipo, dur);
  const c = new Float64Array(n), cOff = new Float64Array(n);
  for (let k = 0; k < n; k++) { avanzar(d(k / SR)); c[k] = lazo.c; cOff[k] = lazo.cOff; }
  return atenuacion(cOff, c, Math.round(medir[0] * SR), Math.round(medir[1] * SR));
}

// C. ¿Oscila con este Kp? Un empujón chico y se mira si la oscilación crece.
function oscila(Kp, calce) {
  const lazo = new LazoANC({ Kp });
  lazo.setCalce(calce);
  const n = Math.round(80e-3 / DT), c = new Float64Array(n);
  for (let i = 0; i < n; i++) { lazo.paso(i < 100 ? 0.01 : 0); c[i] = lazo.c; }
  if (lazo.saturados > 0) return true;
  const a = Math.round(40e-3 / DT), b = Math.round(60e-3 / DT);
  return rms(c, b, n) > rms(c, a, b);
}
function kpMaxSimulado(calce) {
  let lo = 300, hi = 800;
  while (hi - lo > 0.25) { const m = 0.5 * (lo + hi); if (oscila(m, calce)) hi = m; else lo = m; }
  return 0.5 * (lo + hi);
}

// D. Escalón de 0,5 Pa durante 15 ms (caso 05).
function escalon() {
  const lazo = new LazoANC({ Kp: ref.Kp });
  const n = Math.round(ref.escalon.dur / DT);
  for (let i = 0; i < n; i++) lazo.paso(ref.escalon.amp);
  return lazo.c;
}

// ---------------------------------------------------------------- comparaciones
const filas = [];
let todoOk = true;
const fila = (grupo, que, py, js, dif, tol, ok) => { filas.push({ grupo, que, py, js, dif, tol, ok }); todoOk &&= ok; };

// A y B: por tipo de ruido y calce
for (const tipo of ['transito', 'bocina', 'colectivo']) {
  for (const calce of ['bueno', 'malo']) {
    const casos = ref.ruidos.filter((r) => r.tipo === tipo && r.calce === calce);
    const pyMedia = media(casos.map((r) => r.atenuacion_db));
    const nombre = `${NOMBRE[tipo]}, ${calce === 'bueno' ? 'buen' : 'mal'} calce`;
    // A: mismas fases que Python, todas las semillas
    const difsA = casos.map((r) => corridaPaso(tipo, calce, { fs: r.fs, fases: r.fases, aVec: r.a_vec }, r.dur, r.medir) - r.atenuacion_db);
    const peorA = difsA.reduce((m, x) => (Math.abs(x) > Math.abs(m) ? x : m), 0);
    fila('A', nombre, pyMedia, pyMedia + media(difsA), peorA, TOL_DB, Math.abs(peorA) <= TOL_DB);
    // B: camino de la app (48 kHz), con el ruido que sortea la app (5 semillas)
    const r0 = casos[0];
    const jsB = [1, 2, 3, 4, 5].map((s) => corridaApp(tipo, calce, sortearTonos(tipo, NIVEL[tipo], azar(s)), r0.dur, r0.medir));
    const difB = media(jsB) - pyMedia;
    fila('B', nombre, pyMedia, media(jsB), difB, TOL_DB, Math.abs(difB) <= TOL_DB);
  }
}

// C: Kp máximo
const kpInfo = {};
for (const calce of ['bueno', 'malo']) {
  const py = ref.kp_max[calce].exacto;
  const { K, tau } = CALCE[calce];
  const formula = kpLimites(K, tau, T_NOM).kpMaxExacto;
  const simulado = kpMaxSimulado(calce);
  const pySim = ref.kp_max[calce].simulado;
  const nombre = calce === 'bueno' ? 'buen' : 'mal';
  fila('C', `Kp máx exacto, ${nombre} calce (fórmula)`, py, formula, (formula - py) / py, TOL_REL, Math.abs(formula - py) / py <= TOL_REL);
  fila('C', `Kp máx, ${nombre} calce (simulando el lazo)`, pySim, simulado, (simulado - pySim) / pySim, TOL_REL, Math.abs(simulado - pySim) / pySim <= TOL_REL);
  kpInfo[calce] = { exacto: py, simulado, conMedioPaso: kpLimites(K, tau, T_NOM + DT / 2).kpMaxExacto };
}

// D: escalón
const cssJs = escalon();
fila('D', 'Escalón de 0,5 Pa: c al final (Pa)', ref.escalon.c_final, cssJs, (cssJs - ref.escalon.c_final) / ref.escalon.c_final, TOL_REL,
  Math.abs(cssJs - ref.escalon.c_final) / ref.escalon.c_final <= TOL_REL);
fila('D', 'Escalón de 0,5 Pa: contra K·A/(1+KL) (Pa)', ref.escalon.c_ss_teorico, cssJs, (cssJs - ref.escalon.c_ss_teorico) / ref.escalon.c_ss_teorico, TOL_REL,
  Math.abs(cssJs - ref.escalon.c_ss_teorico) / ref.escalon.c_ss_teorico <= TOL_REL);

// Humo: la clase Demo (la que corre en el AudioWorklet) con cada ruido, 1 s, ANC encendido.
const humo = {};
for (const fuente of ['transito', 'bocina', 'colectivo']) {
  const demo = new Demo(SR);
  demo.mensaje({ fuente, anc: true, calce: 'bueno' });
  const n = SR, sal = { d: new Float32Array(n), cOff: new Float32Array(n), c: new Float32Array(n) };
  const audio = new Float32Array(n);
  demo.procesar(null, audio, n, sal);
  const i0 = Math.round(0.2 * SR);
  humo[fuente] = atenuacion(sal.cOff, sal.c, fuente === 'bocina' ? Math.round(0.02 * SR) : i0, fuente === 'bocina' ? Math.round(BOCINA_DURA * SR) : n);
}
// Humo: apretar la línea hace silbar (flojo antes que puesto).
function tiempoHastaSilbar(calce) {
  const demo = new Demo(SR);
  demo.mensaje({ fuente: 'transito', anc: true, calce, apretar: true });
  const bloque = 480;
  for (let k = 0; k < 10 * SR / bloque; k++) {
    const r = demo.procesar(null, null, bloque, null);
    if (r.sat > 0) return { t: (k + 1) * bloque / SR, Kp: demo.lazo.Kp };
  }
  return null;
}
const silbaFlojo = tiempoHastaSilbar('malo'), silbaPuesto = tiempoHastaSilbar('bueno');

// ---------------------------------------------------------------- salida
const fmtVal = (r) => (r.grupo === 'A' || r.grupo === 'B' ? [f(r.py), f(r.js), (r.dif >= 0 ? '+' : '') + f(r.dif), '±' + f(r.tol, 1) + ' dB']
  : r.grupo === 'C' ? [f(r.py, 1), f(r.js, 1), (r.dif >= 0 ? '+' : '') + f(100 * r.dif, 2) + ' %', '±1 %']
    : [f(r.py, 5), f(r.js, 5), (r.dif >= 0 ? '+' : '') + f(100 * r.dif, 2) + ' %', '±1 %']);
console.log(`Referencia de Python: ${pyUsado ? 'recién generada con ' + pyUsado : 'referencia_python.json guardado (no se encontró Python con numpy)'}`);
for (const r of filas) {
  const [p, j, d, t] = fmtVal(r);
  console.log(`${r.ok ? 'OK   ' : 'FALLA'} ${r.grupo}  ${r.que.padEnd(46)} Python ${p.padStart(9)}  JS ${j.padStart(9)}  dif ${d.padStart(8)}  (${t})`);
}
for (const calce of ['bueno', 'malo']) {
  const k = kpInfo[calce];
  console.log(`Kp máx ${calce}: el lazo simulado (Python y JS) oscila desde ${f(k.simulado, 1)}, ${f(100 * (k.simulado - k.exacto) / k.exacto, 2)} % debajo de la fórmula (${f(k.exacto, 1)}); la fórmula con T + DT/2 da ${f(k.conMedioPaso, 1)}`);
}
console.log(`Humo (clase Demo, 48 kHz, 1 s): tránsito ${f(humo.transito)} dB, bocina ${f(humo.bocina)} dB, colectivo ${f(humo.colectivo)} dB`);
console.log(`Apretar la línea: flojo silba a los ${silbaFlojo ? f(silbaFlojo.t) + ' s (Kp ' + f(silbaFlojo.Kp, 0) + ')' : '—'}; puesto a los ${silbaPuesto ? f(silbaPuesto.t) + ' s (Kp ' + f(silbaPuesto.Kp, 0) + ')' : '—'}`);
console.log(todoOk ? '\nTodo dentro de la tolerancia.' : '\nHay comparaciones fuera de la tolerancia.');

// ---------------------------------------------------------------- evidencia
if (process.argv.includes('--evidencia')) {
  const dest = join(RAIZ, 'evidencia', '07_app_web');
  mkdirSync(dest, { recursive: true });
  const tabla = (g, cab) => [cab, '|---|---|---|---|---|---|',
    ...filas.filter((r) => r.grupo === g).map((r) => { const [p, j, d, t] = fmtVal(r); return `| ${r.que} | ${p} | ${j} | ${d} | ${t} | ${r.ok ? 'Sí' : 'No'} |`; })].join('\n');
  const md = `# Caso 07: motor de la app web contra el simulador en Python

Se prueba que la app web (\`web/\`, la demo "borrar el ruido") usa el mismo lazo que
\`simulacion_anc.py\`: el motor \`web/motor.js\` es la traducción de \`LazoANC.paso\` a JavaScript
(mismos Ka, Km, K, τ, T, Umáx = ±3 V, retardo con buffer y paso de 1 µs) y los ruidos salen de las
mismas fórmulas (suma de tonos de \`agregar_perturbacion\`).

**Cómo se generó:** \`node web/test/comparar.js --evidencia\` (Node ${process.version}). Los valores de
Python los produce \`web/test/referencia_python.py\`, que importa \`simulacion_anc.py\` sin modificarlo.

## Parámetros

- Kp = ${ref.Kp}, T = 40 µs, Ka = ${ref.KA} Pa/V, Km = ${String(ref.KM).replace('.', ',')} V/Pa, Umáx = ±${ref.U_MAX} V.
  Buen calce K = 1, τ = 1 ms; mal calce K = 0,6, τ = 0,5 ms. Sin ruido ambiente: cada ruido solo.
- Niveles en el oído: tránsito 0,36 Pa (85 dB SPL), colectivo 0,63 Pa (90 dB SPL), bocina 2 Pa
  (100 dB SPL, como el caso 06). Mientras el lazo no satura, la atenuación no depende del nivel.
- Atenuación = 20·log10(c₀ ef / c ef), descartando los primeros 20 ms. Tránsito y colectivo:
  ventana de 200 ms (7 períodos del colectivo). Bocina: 20 a 195 ms, como el caso 06.
- 5 semillas por caso. Tolerancia: ±${f(TOL_DB, 1)} dB en atenuación, ±1 % en Kp y en el escalón.

## A. El lazo, paso a paso, con el mismo ruido que Python

Mismas frecuencias y fases que sorteó Python. Se muestra el promedio de las 5 semillas y la
diferencia más grande entre una corrida de Python y la misma corrida en JavaScript.

${tabla('A', '| Caso | Python [dB] | JavaScript [dB] | Peor diferencia [dB] | Tolerancia | ¿Coincide? |')}

## B. El camino de la app (AudioWorklet a 48 kHz)

El ruido se calcula a 48 kHz y el lazo avanza ~21 pasos de 1 µs por muestra, con el ruido
interpolado entre muestras (lo mismo que hace el AudioWorklet). Los ruidos son los que sortea la
app: tienen las mismas fórmulas, pero el generador al azar no es el de numpy, así que las
frecuencias del tránsito y las fases son otras. Se compara el promedio de 5 semillas.

${tabla('B', '| Caso | Python [dB] | App [dB] | Diferencia [dB] | Tolerancia | ¿Coincide? |')}

## C. Kp máximo (límite de estabilidad)

La fórmula exacta (fase de −180°: ω·T + atan(ω·τ) = π) y el Kp a partir del cual el lazo
simulado oscila (bisección: un empujón de 0,01 Pa y se mira si la oscilación crece en 80 ms),
en Python y en JavaScript con el mismo procedimiento.

${tabla('C', '| Caso | Python | JavaScript | Diferencia | Tolerancia | ¿Coincide? |')}

**Nota.** El lazo simulado (en los dos lenguajes) empieza a oscilar un poco antes que lo que da
la fórmula: buen calce ${f(kpInfo.bueno.simulado, 1)} frente a ${f(kpInfo.bueno.exacto, 1)} (${f(100 * (kpInfo.bueno.simulado - kpInfo.bueno.exacto) / kpInfo.bueno.exacto, 2)} %),
mal calce ${f(kpInfo.malo.simulado, 1)} frente a ${f(kpInfo.malo.exacto, 1)} (${f(100 * (kpInfo.malo.simulado - kpInfo.malo.exacto) / kpInfo.malo.exacto, 2)} %). No es un error de la
traducción: el integrador de Euler (paso de 1 µs) suma medio paso de retardo. Con T + 0,5 µs la
fórmula da ${f(kpInfo.bueno.conMedioPaso, 1)} y ${f(kpInfo.malo.conMedioPaso, 1)}, lo mismo que la simulación.
El ensayo 3 (Kp = 480 con mal calce) oscila con cualquiera de los dos valores.

## D. Escalón de 0,5 Pa (caso 05)

${tabla('D', '| Caso | Python | JavaScript | Diferencia | Tolerancia | ¿Coincide? |')}

## Otras comprobaciones de la app

- Clase \`Demo\` (la que corre en el AudioWorklet), 1 s con ANC y buen calce: tránsito
  ${f(humo.transito)} dB, bocina ${f(humo.bocina)} dB (durante el golpe), colectivo ${f(humo.colectivo)} dB.
- Mantener apretada la línea (Kp sube desde 300 a ${'73,5'} por segundo): con el auricular flojo el
  parlante empieza a saturar (silba) a los ${silbaFlojo ? f(silbaFlojo.t) + ' s, con Kp = ' + f(silbaFlojo.Kp, 0) : '—'};
  puesto, a los ${silbaPuesto ? f(silbaPuesto.t) + ' s, con Kp = ' + f(silbaPuesto.Kp, 0) : '—'}. Los límites teóricos son 447 y 528.

## Veredicto

${todoOk ? '**Coincide.** Todas las comparaciones quedan dentro de la tolerancia: la app muestra y hace sonar el mismo lazo que el simulador del informe.' : '**No coincide.** Hay comparaciones fuera de la tolerancia (ver tablas).'}
`;
  writeFileSync(join(dest, 'README.md'), md);
  console.log('Escrito evidencia/07_app_web/README.md');
}
process.exit(todoOk ? 0 : 1);
