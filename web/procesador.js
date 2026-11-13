// AudioWorklet: corre el lazo de motor.js a la frecuencia de muestreo del audio (48 kHz),
// con ~21 pasos de 1 µs por muestra. La salida de audio es c, la presión en el oído.
// Cada ~21 ms le manda a la interfaz las señales (d, c sin ANC, c) para dibujar las ondas.

import { Demo } from './motor.js?v=3';   // ?v=N: que el navegador no use una versión vieja en caché

const BLOQUE = 1024;

class ProcesadorANC extends AudioWorkletProcessor {
  constructor() {
    super();
    this.demo = new Demo(sampleRate);
    this.port.onmessage = (e) => this.demo.mensaje(e.data);
    this.nuevo();
  }

  nuevo() {
    this.buf = { d: new Float32Array(BLOQUE), cOff: new Float32Array(BLOQUE), c: new Float32Array(BLOQUE),
      fuera: new Float32Array(BLOQUE) };
    this.k = 0; this.sat = 0; this.env = 0;
  }

  process(inputs, outputs) {
    const salida = outputs[0];
    const audio = salida[0];
    const n = audio.length;
    const ent = inputs[0] && inputs[0].length ? inputs[0][0] : null;
    let hecho = 0;
    while (hecho < n) {
      const m = Math.min(n - hecho, BLOQUE - this.k);
      const k = this.k;
      const r = this.demo.procesar(ent ? ent.subarray(hecho, hecho + m) : null, audio.subarray(hecho, hecho + m), m,
        { d: this.buf.d.subarray(k, k + m), cOff: this.buf.cOff.subarray(k, k + m), c: this.buf.c.subarray(k, k + m),
          fuera: this.buf.fuera.subarray(k, k + m) });
      this.sat += r.sat; this.env = Math.max(this.env, r.env);
      this.k += m; hecho += m;
      if (this.k === BLOQUE) {
        const lazo = this.demo.lazo;
        this.port.postMessage({
          d: this.buf.d, cOff: this.buf.cOff, c: this.buf.c, fuera: this.buf.fuera, sat: this.sat, env: this.env,
          Kp: lazo.Kp, anc: lazo.anc, pasos: Math.round(BLOQUE * this.demo.pasosPorMuestra),
        }, [this.buf.d.buffer, this.buf.cOff.buffer, this.buf.c.buffer, this.buf.fuera.buffer]);
        this.nuevo();
      }
    }
    for (let ch = 1; ch < salida.length; ch++) salida[ch].set(audio);
    return true;
  }
}

registerProcessor('anc', ProcesadorANC);
