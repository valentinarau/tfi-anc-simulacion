"""
Genera la carpeta evidencia/: un caso por ensayo, con su gráfico y su explicación.

Usa simulacion_anc.py sin modificarlo:
  - los gráficos son los mismos que produce `simulacion_anc.py --ensayos` (figuras 3 a 7 del informe);
  - los números se recalculan acá con la misma configuración de cada ensayo, y se controla que
    coincidan con los que informa ensayos(). Si alguien cambia un ensayo y dejan de coincidir,
    el script se detiene en lugar de generar evidencia desactualizada.

Veredicto (criterio de la sección 6.7 del informe):
  - Falla: el lazo oscila, el parlante queda saturado en forma sostenida o la atenuación en la
    banda baja queda por debajo de 20 dB.
  - Error admisible: ninguna de las anteriores.
La banda baja se mide con un tono de 50 Hz (límite inferior del contexto, Tabla 4).

Uso:
    python generar_evidencia.py
"""

import contextlib
import io
import os
import re
import shutil
import tempfile

import numpy as np

import simulacion_anc as sim

DT = sim.DT
RAIZ = os.path.dirname(os.path.abspath(__file__))
CARPETA = os.path.join(RAIZ, "evidencia")
META_DB = 20.0          # meta de servicio (secciones 2 y 6.7)
F_BANDA_BAJA = 50.0     # tono con el que se mide la banda baja [Hz]


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------
def num(x, d=1):
    """Número con coma decimal, como en el informe."""
    return f"{x:.{d}f}".replace(".", ",")


def correr(lazo, dur, transitorio=10e-3):
    """Igual que en ensayos(): simula y mide la atenuación descartando el transitorio."""
    r = lazo.paso(int(dur / DT))
    m = r["t"] >= transitorio
    return r, sim.atenuacion_db(r["coff"][m], r["c"][m])


def atenuacion_banda_baja(Kp, calce="bueno", T=sim.T_NOM, prealimentacion=False):
    """Atenuación ante un tono de 50 Hz, sin ruido ambiente, una vez asentado."""
    lazo = sim.LazoANC(Kp=Kp, T=T, ruido=0.0, prealimentacion=prealimentacion)
    lazo.set_calce(calce)
    lazo.agregar_perturbacion("tono", amplitud=0.3, duracion=0.2, frecuencia=F_BANDA_BAJA)
    r = lazo.paso(int(0.2 / DT))
    m = r["t"] >= 0.1
    return sim.atenuacion_db(r["coff"][m], r["c"][m])


def oscila(r, desde):
    """Inestabilidad vista en la señal: con ANC queda más presión que sin ANC."""
    m = r["t"] >= desde
    return np.sqrt(np.mean(r["c"][m] ** 2)) > np.sqrt(np.mean(r["coff"][m] ** 2))


def fraccion_saturada(u, umax=sim.U_MAX):
    return float(np.mean(np.abs(u) >= umax - 1e-9))


def frecuencia_dominante(x):
    x = x - np.mean(x)
    espectro = np.abs(np.fft.rfft(x * np.hanning(len(x))))
    return float(np.fft.rfftfreq(len(x), DT)[np.argmax(espectro)])


def veredicto(oscila_, saturado, banda_baja_db):
    if oscila_:
        return "Falla (oscila y satura)" if saturado else "Falla (oscila)"
    if saturado:
        return "Falla (satura)"
    if banda_baja_db < META_DB:
        return "Falla (< 20 dB en la banda baja)"
    return "Error admisible"


def si_no(ok):
    return "Sí" if ok else "**No**"


# ---------------------------------------------------------------------------
# Figuras y resumen de ensayos() (simulacion_anc.py sin cambios)
# ---------------------------------------------------------------------------
def correr_ensayos():
    tmp = tempfile.mkdtemp()
    with contextlib.redirect_stdout(io.StringIO()):
        resumen = sim.ensayos(tmp)
    return tmp, resumen


def numeros_de(resumen, ensayo):
    """Números que aparecen en el resumen de un ensayo, en orden."""
    txt = " ".join(f"{c} {r}" for e, c, r in resumen if e == ensayo)
    return [float(x) for x in re.findall(r"-?\d+\.\d+", txt)]


def controlar(nombre, propio, de_ensayos):
    if propio != de_ensayos:
        raise SystemExit(f"{nombre}: el cálculo de evidencia ({propio}) no coincide con ensayos() "
                         f"({de_ensayos}). Revisá si cambió el ensayo en simulacion_anc.py.")


# ---------------------------------------------------------------------------
# Casos
# ---------------------------------------------------------------------------
def caso_1(resumen):
    G = sim.KA * 1.0 * sim.KM
    lim_bueno = sim.kp_limites(1.0, 1e-3, sim.T_NOM)
    lim_malo = sim.kp_limites(0.6, 0.5e-3, sim.T_NOM)
    ventana = (lim_malo["kp_min20"], lim_malo["kp_max_exacto"])
    filas = []
    for Kp in (150, 300, 450):
        r, att = correr(sim.LazoANC(Kp=Kp), 40e-3)
        estatica = 20 * np.log10(1 + Kp * G)
        bb = atenuacion_banda_baja(Kp)
        bb_malo = atenuacion_banda_baja(Kp, "malo")
        filas.append(dict(Kp=Kp, att=att, estatica=estatica, bb=bb, bb_malo=bb_malo,
                          oscila=oscila(r, 10e-3), saturado=r["u"].max() >= sim.U_MAX - 1e-9,
                          en_ventana=ventana[0] <= Kp < ventana[1]))
    controlar("Ensayo 1", [round(f["att"], 1) for f in filas], numeros_de(resumen, "Ensayo 1"))

    informe = {150: 19.1, 300: 24.7, 450: 28.1}
    crece = all(a["att"] < b["att"] for a, b in zip(filas, filas[1:]))
    for f in filas:
        f["veredicto"] = veredicto(f["oscila"], f["saturado"], f["bb"])
        f["coincide"] = (crece and f["att"] < f["estatica"] and round(f["att"], 1) == informe[f["Kp"]]
                         and not f["oscila"])

    notas = []
    for f in filas:
        if f["en_ventana"]:
            continue
        if f["Kp"] < ventana[0]:
            notas.append(
                f"**Kp = {f['Kp']} está por debajo de la ventana de diseño de la sección 8.6 "
                f"({num(ventana[0], 0)} ≤ Kp < {num(ventana[1], 0)}).** Con buen calce cumple "
                f"(unos {num(f['bb'])} dB en la banda baja), pero con mal calce daría unos "
                f"{num(f['bb_malo'])} dB, que es falla. Por eso no es un valor de diseño válido "
                f"aunque en este ensayo cumpla.")
        else:
            notas.append(
                f"**Kp = {f['Kp']} está por encima de la ventana de diseño de la sección 8.6 "
                f"({num(ventana[0], 0)} ≤ Kp < {num(ventana[1], 0)}).** Con buen calce es estable y "
                f"atenúa {num(f['bb'])} dB en la banda baja, pero con mal calce supera el Kp máximo "
                f"exacto ({num(ventana[1], 0)}) y el lazo oscila (con un tono de 50 Hz queda "
                f"{num(abs(f['bb_malo']))} dB *por encima* del valor sin ANC). Tampoco es un valor "
                f"de diseño válido aunque en este ensayo cumpla.")

    tabla = "\n".join(
        f"| Kp = {f['Kp']} | {num(f['estatica'])} dB | {num(f['att'])} dB | {num(f['bb'])} dB | "
        f"{f['veredicto']} | {si_no(f['coincide'])} |" for f in filas)
    readme = f"""# Caso 01: barrido de la ganancia Kp

![Figura del ensayo 1](figura.png)

*Es la figura 3 del informe (sección 9.2).*

## 1. Qué se prueba y por qué

Se prueba que **la atenuación crece con la ganancia del controlador**. Es la idea central del
control proporcional: cuanto más grande es Kp, más grande es la ganancia de lazo KL y más
chico el error que queda. También se prueba que la atenuación real, con un ruido que tiene
componentes de hasta 500 Hz, queda **por debajo** del valor estático, porque la ganancia de
lazo cae al subir la frecuencia.

## 2. Parámetros usados

- Kp = 150, 300 y 450 V/V.
- Buen calce: K = 1, τ = 1 ms. Retardo T = 40 µs. Ka = 6 Pa/V, Km = 0,0126 V/Pa, Umáx = 3 V.
- Ruido ambiente nominal (tonos de 100, 250 y 500 Hz más ruido aleatorio), sin prealimentación.
- 40 ms simulados; la atenuación se mide descartando los primeros 10 ms (transitorio).
- Banda baja: tono de 50 Hz sin ruido ambiente, medido entre 100 y 200 ms.

## 3. Qué predice el informe

- **Sección 8.3:** la atenuación en estado estable es 20·log(1 + KL), con KL = Kp·Ka·K·Km.
  Crece con Kp. Al subir en frecuencia la ganancia de lazo cae y la atenuación disminuye.
- **Sección 6.7:** es falla si la atenuación en la banda baja queda por debajo de 20 dB.
- **Sección 9.2** reporta 19,1, 24,7 y 28,1 dB para Kp = 150, 300 y 450.

## 4. Qué dio la simulación

| Kp | Atenuación estática (8.3) | Atenuación medida (ruido completo) | Banda baja (50 Hz) | Veredicto | ¿Coincide con la predicción? |
|---|---|---|---|---|---|
{tabla}

La atenuación crece con Kp y en los tres casos queda por debajo del valor estático, como
predice la sección 8.3. Los valores medidos coinciden con los de la sección 9.2.

## 5. Veredicto

Los tres valores son **error admisible** en este ensayo (buen calce): el lazo es estable y la
banda baja supera los 20 dB. Sobre el ruido completo, Kp = 150 da 19,1 dB, apenas por debajo
de la meta, pero el criterio de la sección 6.7 se aplica a la banda baja.

{chr(10).join("> " + n + chr(10) for n in notas)}
"""
    fila_indice = []
    for f in filas:
        nota = " Fuera de la ventana de diseño: con mal calce fallaría." if not f["en_ventana"] else ""
        fila_indice.append(dict(
            caso=f"1. Barrido de Kp: Kp = {f['Kp']}", seccion="8.3, 9.2",
            predice=f"Crece con Kp y queda bajo el valor estático ({num(f['estatica'])} dB); 9.2 reporta {num(informe[f['Kp']])} dB",
            dio=f"{num(f['att'])} dB (ruido completo), {num(f['bb'])} dB en la banda baja",
            veredicto=f["veredicto"] + ("." + nota if nota else ""), coincide=f["coincide"]))
    return readme, fila_indice


def caso_2(resumen):
    Kp = 300
    informe_kpmax = {40: 528, 60: 355, 80: 268, 100: 216}
    filas = []
    for T_us in (40, 60, 80, 100):
        T = T_us * 1e-6
        r, att = correr(sim.LazoANC(Kp=Kp, T=T), 40e-3)
        lim = sim.kp_limites(1.0, 1e-3, T)
        estable_teo = Kp < lim["kp_max_exacto"]
        osc = oscila(r, 30e-3)
        sat = fraccion_saturada(r["u"][r["t"] >= 30e-3])
        bb = atenuacion_banda_baja(Kp, T=T)
        filas.append(dict(T=T_us, att=att, kpmax=lim["kp_max_exacto"], estable_teo=estable_teo,
                          oscila=osc, sat=sat, bb=bb))
    controlar("Ensayo 2", ["estable" if f["estable_teo"] else "inestable" for f in filas],
              [c for e, _, c in resumen if e == "Ensayo 2"])

    for f in filas:
        f["veredicto"] = veredicto(f["oscila"], f["sat"] > 0.05, f["bb"])
        f["coincide"] = (round(f["kpmax"]) == informe_kpmax[f["T"]] and f["oscila"] == (not f["estable_teo"])
                         and (not f["estable_teo"] or round(f["att"], 1) == 24.7))
    tabla = "\n".join(
        f"| {f['T']} µs | {num(f['kpmax'], 0)} | {'estable' if f['estable_teo'] else 'inestable'} | "
        f"{'oscila' if f['oscila'] else 'no oscila'} | "
        f"{num(f['att']) + ' dB' if not f['oscila'] else 'amplifica (' + num(f['att']) + ' dB)'} | "
        f"{num(100 * f['sat'], 0)} % | {f['veredicto']} | {si_no(f['coincide'])} |" for f in filas)
    readme = f"""# Caso 02: retardo creciente

![Figura del ensayo 2](figura.png)

*Es la figura 4 del informe (sección 9.3).*

## 1. Qué se prueba y por qué

Se prueba que **el retardo es lo que vuelve condicional la estabilidad**. Sin retardo, el lazo
sería estable con cualquier Kp; con retardo, existe un Kp máximo, y ese máximo baja cuando el
retardo crece. Con Kp fijo, alcanza con aumentar el retardo para que el lazo oscile. Es la
razón por la que el control no puede depender de una red (sección 10.2).

## 2. Parámetros usados

- Kp = 300 V/V, buen calce (K = 1, τ = 1 ms), Umáx = 3 V, ruido ambiente nominal.
- Retardo T = 40, 60, 80 y 100 µs.
- 40 ms simulados. Atenuación medida desde los 10 ms; oscilación y saturación medidas en los
  últimos 10 ms.
- "Oscila" se decide **mirando la señal**: con ANC queda más presión que sin ANC.

## 3. Qué predice el informe

- **Sección 8.4:** sin retardo el lazo es estable para cualquier Kp; el retardo impone un Kp
  máximo.
- **Sección 9.3:** el Kp máximo exacto cae a 528, 355, 268 y 216. Con 40 y 60 µs el lazo es
  estable y atenúa 24,7 dB; con 80 y 100 µs, Kp = 300 supera el límite y el lazo oscila.

## 4. Qué dio la simulación

| Retardo | Kp máx exacto | Predicción (Kp = 300) | Señal simulada | Atenuación | Tiempo saturado | Veredicto | ¿Coincide con la predicción? |
|---|---|---|---|---|---|---|---|
{tabla}

La señal confirma la predicción analítica en los cuatro casos: con 80 y 100 µs la presión con
ANC supera a la presión sin ANC y el parlante pasa buena parte del tiempo saturado en ±3 V.

## 5. Veredicto

- **T = 40 y 60 µs: error admisible.** Estable y con más de 20 dB en la banda baja.
- **T = 80 y 100 µs: falla (oscila y satura).** Es la falla que el ensayo busca provocar, y
  ocurre exactamente donde la predice el informe.
"""
    fila_indice = [
        dict(caso="2. Retardo: T = 40 y 60 µs", seccion="8.4, 9.3",
             predice="Kp máx 528 y 355 > 300: estable, 24,7 dB",
             dio=f"Estable; {num(filas[0]['att'])} y {num(filas[1]['att'])} dB",
             veredicto=veredicto(False, False, min(filas[0]["bb"], filas[1]["bb"])),
             coincide=filas[0]["coincide"] and filas[1]["coincide"]),
        dict(caso="2. Retardo: T = 80 y 100 µs", seccion="8.4, 9.3",
             predice="Kp máx 268 y 216 < 300: oscila",
             dio=f"Oscila; saturado el {num(100 * filas[2]['sat'], 0)} y {num(100 * filas[3]['sat'], 0)} % del tiempo",
             veredicto="Falla (oscila y satura). Buscada por el ensayo",
             coincide=filas[2]["coincide"] and filas[3]["coincide"]),
    ]
    return readme, fila_indice


def caso_3(resumen):
    Kp = 480
    G = sim.KA * 1.0 * sim.KM
    lazo = sim.LazoANC(Kp=Kp)
    r1, att1 = correr(lazo, 30e-3)
    lazo.set_calce("malo")
    r2 = lazo.paso(int(30e-3 / DT))
    controlar("Ensayo 3", [round(att1, 1)], numeros_de(resumen, "Ensayo 3"))

    lim_bueno = sim.kp_limites(1.0, 1e-3, sim.T_NOM)
    lim_malo = sim.kp_limites(0.6, 0.5e-3, sim.T_NOM)
    estatica = 20 * np.log10(1 + Kp * G)
    bb = atenuacion_banda_baja(Kp)
    osc1 = oscila(r1, 10e-3)
    m2 = r2["t"] >= 40e-3
    osc2 = oscila(r2, 40e-3)
    sat2 = fraccion_saturada(r2["u"][m2])
    f_osc = frecuencia_dominante(r2["c"][m2])
    ok_antes = (not osc1) and round(att1, 1) == 28.6 and Kp < lim_bueno["kp_max_exacto"]
    ok_despues = (osc2 and sat2 > 0.05 and round(lim_malo["kp_max_exacto"]) == 447
                  and abs(f_osc - 6400) / 6400 < 0.05 and lim_malo["kp_max_pade"] > Kp)
    v_antes = veredicto(osc1, False, bb)
    v_despues = veredicto(osc2, sat2 > 0.05, -np.inf)

    readme = f"""# Caso 03: pérdida de sello

![Figura del ensayo 3](figura.png)

*Es la figura 5 del informe (sección 9.4).*

## 1. Qué se prueba y por qué

Se prueba que **la ventana de sintonía tiene que evaluarse con el peor calce**. Un Kp que
funciona bien con el auricular bien puesto puede hacer oscilar el lazo cuando el auricular se
afloja, porque el mal calce baja el Kp máximo. Es el silbido de un auricular mal calzado, y es
el caso en que la aproximación de Padé daría el lazo por estable cuando no lo es.

## 2. Parámetros usados

- Kp = 480 V/V, T = 40 µs, Umáx = 3 V, ruido ambiente nominal.
- De 0 a 30 ms, buen calce (K = 1, τ = 1 ms). A los 30 ms el auricular se afloja: mal calce
  (K = 0,6, τ = 0,5 ms) hasta los 60 ms.
- Atenuación antes de aflojarse medida entre 10 y 30 ms. Oscilación, saturación y frecuencia
  medidas en los últimos 20 ms.

## 3. Qué predice el informe

- **Sección 8.6:** con buen calce, Kp = 480 es estable (Kp máx exacto {num(lim_bueno['kp_max_exacto'], 0)}) y da
  unos 31 dB de atenuación estática. Con mal calce, el Kp máximo exacto baja a 447 y el lazo
  oscila en torno a 6,4 kHz, aunque Padé lo daría por estable (Kp máx Padé {num(lim_malo['kp_max_pade'], 0)}).
- **Sección 6.7:** la oscilación y la saturación sostenida son falla; la pérdida de sello es
  perturbación si es momentánea y falla si persiste.
- **Sección 9.4** reporta 28,6 dB con buen calce y, al aflojarse, oscilación con la salida
  saturada en ±3 V.

## 4. Qué dio la simulación

| Tramo | Kp máx exacto | Resultado | Veredicto | ¿Coincide con la predicción? |
|---|---|---|---|---|
| Buen calce (0 a 30 ms) | {num(lim_bueno['kp_max_exacto'], 0)} | Estable; {num(att1)} dB sobre el ruido completo ({num(estatica)} dB estático), {num(bb)} dB en la banda baja | {v_antes} | {si_no(ok_antes)} |
| Mal calce (30 a 60 ms) | {num(lim_malo['kp_max_exacto'], 0)} | Oscila a {num(f_osc / 1000, 2)} kHz; parlante saturado el {num(100 * sat2, 0)} % del tiempo | {v_despues} | {si_no(ok_despues)} |

## 5. Veredicto

- **Antes de aflojarse: error admisible.**
- **Después de aflojarse: falla (oscila y satura).** Como la pérdida de sello persiste hasta el
  final del ensayo, por la sección 6.7 es falla y no perturbación. Es la falla que el ensayo
  busca provocar, y ocurre como la predice el informe.
"""
    fila_indice = [
        dict(caso="3. Pérdida de sello: antes de aflojarse", seccion="8.6, 9.4",
             predice="Kp = 480 < 528: estable; 9.4 reporta 28,6 dB",
             dio=f"Estable; {num(att1)} dB", veredicto=v_antes, coincide=ok_antes),
        dict(caso="3. Pérdida de sello: después de aflojarse", seccion="6.7, 8.6, 9.4",
             predice="Kp = 480 > 447: oscila (~6,4 kHz) y satura",
             dio=f"Oscila a {num(f_osc / 1000, 2)} kHz; saturado el {num(100 * sat2, 0)} % del tiempo",
             veredicto=v_despues + ". Buscada por el ensayo", coincide=ok_despues),
    ]
    return readme, fila_indice


def caso_4(resumen):
    Kp = 300
    res = {}
    for pre in (False, True):
        r, att = correr(sim.LazoANC(Kp=Kp, prealimentacion=pre), 40e-3)
        res[pre] = dict(att=att, oscila=oscila(r, 10e-3), bb=atenuacion_banda_baja(Kp, prealimentacion=pre))
    controlar("Ensayo 4", [round(res[False]["att"], 1), round(res[True]["att"], 1)],
              numeros_de(resumen, "Ensayo 4"))
    mejora_teo = 20 * np.log10(1 / (1 - sim.FF_AJUSTE))
    mejora = res[True]["att"] - res[False]["att"]
    ok = (abs(mejora - mejora_teo) < 0.1 and round(res[False]["att"], 1) == 24.7
          and round(res[True]["att"], 1) == 38.7)
    v = {pre: veredicto(res[pre]["oscila"], False, res[pre]["bb"]) for pre in res}

    readme = f"""# Caso 04: realimentación sola y esquema híbrido

![Figura del ensayo 4](figura.png)

*Es la figura 6 del informe (sección 9.5).*

## 1. Qué se prueba y por qué

Se prueba cuánto agrega la **prealimentación**: un micrófono externo escucha el ruido antes de
que entre y el parlante lo anticipa, sin esperar a que aparezca un error. La realimentación
sola siempre llega tarde y deja un error de tipo 0; la prealimentación cancela de antemano una
parte del ruido y la realimentación solo tiene que ocuparse del resto.

## 2. Parámetros usados

- Kp = 300 V/V, buen calce (K = 1, τ = 1 ms), T = 40 µs, Umáx = 3 V, ruido ambiente nominal.
- Prealimentación apagada y encendida con un ajuste del {num(100 * sim.FF_AJUSTE, 0)} %.
- 40 ms simulados; atenuación medida desde los 10 ms.

## 3. Qué predice el informe

- **Sección 9.5:** la prealimentación con un ajuste del 80 % mejora la atenuación en
  20·log(1/(1 − 0,8)) = {num(mejora_teo, 2)} dB, porque en el simulador es ideal (usa la misma
  perturbación que llega al oído y el mismo retardo que el anti-ruido). Reporta 24,7 dB sin
  prealimentación y 38,7 dB con ella.

## 4. Qué dio la simulación

| Esquema | Atenuación (ruido completo) | Banda baja (50 Hz) | Veredicto |
|---|---|---|---|
| Solo realimentación | {num(res[False]['att'])} dB | {num(res[False]['bb'])} dB | {v[False]} |
| Híbrido (con prealimentación) | {num(res[True]['att'])} dB | {num(res[True]['bb'])} dB | {v[True]} |

Mejora medida: **{num(mejora, 2)} dB**, frente a {num(mejora_teo, 2)} dB predichos.
¿Coincide con la predicción? **{si_no(ok)}**.

## 5. Veredicto

**Error admisible en los dos esquemas.** Aclaración: la mejora de 14 dB vale para la
prealimentación ideal del simulador. En un auricular real el micrófono externo escucha el
ruido por otro camino acústico y la mejora sería menor (ver README del repositorio,
"Simplificaciones del modelo").
"""
    fila_indice = [dict(
        caso="4. Híbrido: con y sin prealimentación", seccion="9.5",
        predice=f"Mejora de {num(mejora_teo, 1)} dB; 9.5 reporta 24,7 → 38,7 dB",
        dio=f"{num(res[False]['att'])} → {num(res[True]['att'])} dB (+{num(mejora, 1)} dB)",
        veredicto=v[False] if v[False] == v[True] else f"{v[False]} / {v[True]}", coincide=ok)]
    return readme, fila_indice


def caso_5(resumen):
    Kp, A, K = 300, 0.5, 1.0
    lazo = sim.LazoANC(Kp=Kp, ruido=0.0)
    lazo.paso(int(2e-3 / DT))
    lazo.agregar_perturbacion("escalon", amplitud=A, duracion=15e-3)
    r = lazo.paso(int(20e-3 / DT))
    KL = Kp * sim.KA * K * sim.KM
    css_teo = K * A / (1 + KL)
    m = (r["t"] > 12e-3) & (r["t"] < 17e-3)
    css_sim = float(np.mean(r["c"][m]))
    controlar("Ensayo 5", [round(css_teo, 4), round(css_sim, 4)], numeros_de(resumen, "Ensayo 5")[1:])

    # Respuesta al escalón: sobrepico y tiempo de asentamiento al 2 % (sección 6.5)
    me = (r["t"] >= 2e-3) & (r["t"] < 17e-3)
    c, t = r["c"][me], r["t"][me] - 2e-3
    sobrepico = (c.max() - css_sim) / css_sim
    fuera = np.nonzero(np.abs(c - css_sim) > 0.02 * css_sim)[0]
    t_asent = float(t[fuera[-1] + 1])
    residuo = css_sim / (K * A)
    # El informe (6.5) da el sobrepico con un decimal: 41,5 %.
    ok = (round(css_sim, 4) == round(css_teo, 4) == 0.0211 and round(100 * sobrepico, 1) == 41.5
          and round(1e3 * t_asent, 2) == 0.43)
    v = veredicto(False, False, -20 * np.log10(residuo))

    readme = f"""# Caso 05: error en estado estable ante un escalón

![Figura del ensayo 5](figura.png)

*Es la figura 7 del informe (sección 9.6).*

## 1. Qué se prueba y por qué

Se prueba la fórmula del **error en estado estable** de la sección 8.3, obtenida con el
teorema del valor final. El lazo es de tipo 0 (no tiene polos en el origen), así que ante una
perturbación escalón el error no se anula: queda un valor finito, K·A/(1 + KL), que es más
chico cuanto más grande es KL. También se prueba la forma de la respuesta: con el retardo, el
lazo responde como un sistema subamortiguado, con sobrepico.

## 2. Parámetros usados

- Kp = 300 V/V, buen calce (K = 1, τ = 1 ms), T = 40 µs, Umáx = 3 V.
- **Sin ruido ambiente**, para que el escalón se vea limpio.
- Escalón de perturbación de A = {num(A)} Pa aplicado a los 2 ms, de 15 ms de duración.
- KL = Kp·Ka·K·Km = {num(KL, 2)}.
- Valor final medido como promedio entre 12 y 17 ms. Asentamiento: último instante fuera de
  la banda de ±2 % del valor final.

## 3. Qué predice el informe

- **Sección 8.3:** sin ANC la presión tiende a K·A = {num(K * A)} Pa; con ANC, a
  K·A/(1 + KL) = **{num(css_teo, 4)} Pa**. No se anula porque el sistema es de tipo 0.
- **Sección 6.5:** con el retardo la respuesta es subamortiguada (coeficiente de
  amortiguamiento 0,41 con la aproximación de Padé). Reporta que en este ensayo la presión
  supera en un 41,5 % su valor final y se asienta dentro del 2 % en unos 0,43 ms.
- **Sección 9.6** reporta 0,0211 Pa.

## 4. Qué dio la simulación

| Magnitud | Predicción | Simulación |
|---|---|---|
| Valor final sin ANC | {num(K * A, 4)} Pa | {num(float(np.mean(r['coff'][m])), 4)} Pa |
| Valor final con ANC (c_ss) | {num(css_teo, 4)} Pa | {num(css_sim, 4)} Pa |
| Residuo respecto de sin ANC | {num(100 / (1 + KL), 1)} % | {num(100 * residuo, 1)} % |
| Sobrepico | 41,5 % (6.5) | {num(100 * sobrepico, 1)} % |
| Tiempo de asentamiento (2 %) | 0,43 ms (6.5) | {num(1e3 * t_asent, 3)} ms |

¿Coincide con la predicción? **{si_no(ok)}**.

## 5. Veredicto

**{v}.** Queda el {num(100 * residuo, 1)} % del escalón, dentro de la banda de error que admite
la meta de 20 dB (como máximo la décima parte, sección 6.7). Que el error no sea cero no es una
falla: es el error en estado estable propio de un sistema de tipo 0 con acción proporcional.
"""
    fila_indice = [dict(
        caso="5. Escalón de 0,5 Pa", seccion="6.5, 8.3, 9.6",
        predice=f"c_ss = K·A/(1+KL) = {num(css_teo, 4)} Pa; sobrepico 41,5 %, asentamiento 0,43 ms",
        dio=f"c_ss = {num(css_sim, 4)} Pa ({num(100 * residuo, 1)} % del escalón); sobrepico {num(100 * sobrepico, 1)} %, {num(1e3 * t_asent, 2)} ms",
        veredicto=v, coincide=ok)]
    return readme, fila_indice


CASOS = [
    ("01_barrido_kp", "ensayo1_barrido_kp.png", "Barrido de la ganancia Kp", "9.2", caso_1),
    ("02_retardo", "ensayo2_retardo.png", "Retardo creciente", "9.3", caso_2),
    ("03_perdida_sello", "ensayo3_mal_calce.png", "Pérdida de sello", "9.4", caso_3),
    ("04_hibrido", "ensayo4_hibrido.png", "Realimentación sola y esquema híbrido", "9.5", caso_4),
    ("05_escalon", "ensayo5_escalon.png", "Error en estado estable ante un escalón", "9.6", caso_5),
]


def main():
    tmp, resumen = correr_ensayos()
    try:
        filas = []
        for carpeta, png, _, _, fn in CASOS:
            readme, fi = fn(resumen)
            destino = os.path.join(CARPETA, carpeta)
            os.makedirs(destino, exist_ok=True)
            shutil.copyfile(os.path.join(tmp, png), os.path.join(destino, "figura.png"))
            with open(os.path.join(destino, "README.md"), "w", encoding="utf-8") as f:
                f.write(readme.rstrip() + "\n")
            filas.append(fi)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    todas = [f for fi in filas for f in fi]
    tabla = "\n".join(f"| {f['caso']} | {f['seccion']} | {f['predice']} | {f['dio']} | "
                      f"{f['veredicto']} | {si_no(f['coincide'])} |" for f in todas)
    n_falla = sum(f["veredicto"].startswith("Falla") for f in todas)
    todas_ok = all(f["coincide"] for f in todas)
    imagenes = "\n\n".join(
        f"### [{carpeta[:2]}. {titulo}]({carpeta}/README.md) (sección {sec})\n\n"
        f"![{titulo}]({carpeta}/figura.png)" for carpeta, _, titulo, sec, _ in CASOS)

    indice = f"""# Evidencia de los ensayos

Un caso por cada ensayo de la sección 9 del informe. Cada carpeta tiene el gráfico
(`figura.png`, el mismo que va en el informe) y un README con qué se prueba, los parámetros,
qué predice el informe, qué dio la simulación y el veredicto.

**Cómo se generó:** `python generar_evidencia.py`, que usa `simulacion_anc.py` sin modificarlo.
La simulación usa una semilla fija, así que volver a generarla da los mismos números.

**Veredicto** (criterio de la sección 6.7): *falla* si el lazo oscila, si el parlante queda
saturado en forma sostenida o si la atenuación en la banda baja (tono de 50 Hz) queda por
debajo de 20 dB; *error admisible* en los demás casos. **¿Coincide con la predicción?** indica
si la simulación da lo que predice el informe, también cuando lo predicho es una falla.

## Resumen

| Caso | Sección del informe | Qué predice el informe | Qué dio la simulación | Veredicto | ¿Coincide con la predicción? |
|---|---|---|---|---|---|
{tabla}

Hay {n_falla} situaciones de falla y son buscadas: los ensayos 2 y 3 existen para provocarlas.
{"En todos los casos la simulación coincide con lo que predice el informe." if todas_ok else "**Hay casos en que la simulación no coincide con el informe: ver la tabla.**"}

## Casos

{imagenes}
"""
    with open(os.path.join(CARPETA, "README.md"), "w", encoding="utf-8") as f:
        f.write(indice)
    print(f"Evidencia generada en {CARPETA}: {len(CASOS)} casos, {len(todas)} situaciones, "
          f"{n_falla} fallas, {'todas coinciden' if todas_ok else 'HAY DIFERENCIAS'}.")


if __name__ == "__main__":
    main()
