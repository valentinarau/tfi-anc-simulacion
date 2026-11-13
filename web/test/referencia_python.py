"""
Valores de referencia del simulador en Python para comparar con el motor JavaScript de la app web.

Usa simulacion_anc.py tal cual (no lo modifica) y escribe referencia_python.json al lado de este
archivo. Además del resultado de cada corrida, guarda las frecuencias, fases y amplitudes que sorteó
Python para cada ruido, así el motor JS puede repetir exactamente la misma entrada.

Uso (desde la raíz del repo):  python web/test/referencia_python.py
"""

import json
import os
import sys

import numpy as np

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(AQUI, "..", "..")))
import simulacion_anc as sim  # noqa: E402

DT = sim.DT
KP = 300.0
SEMILLAS = range(5)
# Niveles de cada ruido en el oído (valor eficaz, Pa). La bocina es la del caso 06 de la evidencia
# (2 Pa, 100 dB SPL). Tránsito: 85 dB SPL (nivel de contexto de la Tabla 4). Colectivo: 90 dB SPL.
# Como el lazo es lineal mientras no satura, la atenuación no depende del nivel.
RUIDOS = {
    "transito": {"amp": 0.36, "dur": 0.25, "medir": (20e-3, 220e-3)},
    "colectivo": {"amp": 0.63, "dur": 0.25, "medir": (20e-3, 220e-3)},   # 200 ms = 7 períodos de 35 Hz
    "bocina": {"amp": 2.0, "dur": 0.2, "medir": (20e-3, 0.2 - sim.BOCINA_SUBIDA)},   # como el caso 06
}


def corrida_ruido(tipo, calce, seed):
    cfg = RUIDOS[tipo]
    lazo = sim.LazoANC(Kp=KP, ruido=0.0, seed=seed)
    lazo.set_calce(calce)
    lazo.paso(int(round(5e-3 / DT)))            # 5 ms de lazo en reposo antes del ruido
    p = lazo.agregar_perturbacion(tipo, amplitud=cfg["amp"], duracion=cfg["dur"])
    r = lazo.paso(int(round(cfg["dur"] / DT)))
    tb = r["t"] - r["t"][0]
    m = (tb >= cfg["medir"][0]) & (tb < cfg["medir"][1])
    return {
        "tipo": tipo, "calce": calce, "seed": seed, "amp": cfg["amp"], "dur": cfg["dur"],
        "medir": list(cfg["medir"]),
        "fs": p["fs"].tolist(), "fases": p["fases"].tolist(), "a_vec": p["a_vec"].tolist(),
        "atenuacion_db": float(sim.atenuacion_db(r["coff"][m], r["c"][m])),
        "u_max": float(np.max(np.abs(r["u"]))),
    }


def escalon():
    """Caso 05: escalón de 0,5 Pa, Kp = 300, buen calce, sin ruido ambiente."""
    lazo = sim.LazoANC(Kp=KP, ruido=0.0)
    lazo.agregar_perturbacion("escalon", amplitud=0.5, duracion=15e-3)
    r = lazo.paso(int(round(15e-3 / DT)))
    KL = KP * sim.KA * 1.0 * sim.KM
    return {"amp": 0.5, "dur": 15e-3, "c_final": float(r["c"][-1]), "c_ss_teorico": 1.0 * 0.5 / (1 + KL)}


def oscila(Kp, calce):
    """Un empujón de 0,01 Pa durante 100 µs y se mira si la oscilación crece en 80 ms."""
    lazo = sim.LazoANC(Kp=Kp, ruido=0.0)
    lazo.set_calce(calce)
    lazo.agregar_perturbacion("escalon", amplitud=0.01, duracion=100 * DT)
    n = int(round(80e-3 / DT))
    r = lazo.paso(n)
    if np.any(np.abs(r["u"]) >= sim.U_MAX):
        return True
    a, b = int(round(40e-3 / DT)), int(round(60e-3 / DT))
    c = r["c"]
    return np.sqrt(np.mean(c[b:] ** 2)) > np.sqrt(np.mean(c[a:b] ** 2))


def kp_max_simulado(calce):
    """Kp a partir del cual el lazo simulado oscila (bisección)."""
    lo, hi = 300.0, 800.0
    while hi - lo > 0.25:
        m = 0.5 * (lo + hi)
        if oscila(m, calce):
            hi = m
        else:
            lo = m
    return 0.5 * (lo + hi)


def main():
    ref = {"Kp": KP, "DT": DT, "T": sim.T_NOM, "KA": sim.KA, "KM": sim.KM, "U_MAX": sim.U_MAX,
           "CALCE": sim.CALCE, "ruidos": [], "kp_max": {}, "escalon": None}
    for tipo in RUIDOS:
        for calce in ("bueno", "malo"):
            for s in SEMILLAS:
                c = corrida_ruido(tipo, calce, s)
                ref["ruidos"].append(c)
                print(f"{tipo:10s} {calce:5s} semilla {s}: {c['atenuacion_db']:.2f} dB", flush=True)
    for calce in ("bueno", "malo"):
        lim = sim.kp_limites(sim.CALCE[calce]["K"], sim.CALCE[calce]["tau"], sim.T_NOM)
        ref["kp_max"][calce] = {"exacto": float(lim["kp_max_exacto"]), "pade": float(lim["kp_max_pade"]),
                                "f_osc": float(lim["f_osc"]), "simulado": kp_max_simulado(calce)}
        print(f"Kp máx {calce}: {lim['kp_max_exacto']:.1f} (f = {lim['f_osc']:.0f} Hz); "
              f"simulado {ref['kp_max'][calce]['simulado']:.1f}")
    ref["escalon"] = escalon()
    print(f"escalón: c final {ref['escalon']['c_final']:.5f} Pa")
    with open(os.path.join(AQUI, "referencia_python.json"), "w", encoding="utf-8") as f:
        json.dump(ref, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
