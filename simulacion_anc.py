"""
Simulador del lazo de cancelación activa de ruido (ANC) en auriculares.
TFI - Tecnologías para la Automatización - K4521 - UTN FRBA

Modelo (ver secciones 6.2 y 8 del informe):
    Controlador   Gc = Kp                  [V/V]
    Actuador      Ga = Ka                  [Pa/V]
    Proceso       Gp = K e^(-Ts) / (τs+1)  [Pa/Pa]
    Medición      H  = Km                  [V/Pa]
    Referencia    R  = 0 (silencio)

    Punto suma acústico (entrada del proceso):  q(t) = d(t) + Ka·u(t)
    Proceso:   τ·dc/dt = -c + K·q(t - T)
    Medición:  b(t) = Km·c(t)
    Error:     e(t) = R - b(t) = -b(t)
    Control:   u(t) = Kp·e(t) + u_ff(t)    (u_ff = rama de prealimentación)

El parlante tiene un límite físico de tensión (saturación): cuando el lazo se
vuelve inestable, la oscilación crece hasta ese límite y se sostiene. Es el
silbido característico de un auricular mal calzado.

Uso:
    python simulacion_anc.py            -> interfaz interactiva en tiempo real
    python simulacion_anc.py --ensayos  -> genera las figuras de los ensayos

Requiere: numpy, matplotlib   (pip install numpy matplotlib)
"""

import sys
import numpy as np

# ---------------------------------------------------------------------------
# Parámetros de contexto (Tabla 4 del informe) - valores iniciales
# ---------------------------------------------------------------------------
KA = 6.0          # ganancia del parlante [Pa/V]
KM = 0.0126       # sensibilidad del micrófono interno IM73A135 [V/Pa]
T_NOM = 40e-6     # retardo total del lazo [s]
U_MAX = 3.0       # límite de tensión del parlante [V] (saturación)
FF_AJUSTE = 0.8   # fracción de la perturbación que anticipa el mic externo

CALCE = {
    "bueno": {"K": 1.0, "tau": 1.0e-3},
    "malo":  {"K": 0.6, "tau": 0.5e-3},
}

DT = 1e-6         # paso de integración [s] (T/40: el retardo queda bien resuelto)
T_MAX_BUFFER = 1e-3

# Ruido ambiente que atraviesa la vía pasiva: tonos de baja frecuencia
# (motores, cabina de avión) más un componente aleatorio de banda ancha.
TONOS = [(100.0, 0.30), (250.0, 0.20), (500.0, 0.12)]   # (frecuencia Hz, amplitud Pa)
RUIDO_BANDA_ANCHA = 0.02                                   # Pa rms
# Nota: este valor es la escala de entrada del ruido aleatorio, no el valor eficaz final.
# El filtro pasabajos de paso() (factor 0.02 por muestra) reduce el valor eficaz
# por sqrt(0.02 / (2 - 0.02)) ≈ 0.1; con el factor 7 de paso() el ruido aleatorio
# que llega al oído queda en ≈ 0.014 Pa rms.

TIPOS_PERTURBACION = {
    "Escalón": "escalon",
    "Tono": "tono",
    "Ráfaga (banda baja)": "rafaga",
    "Pérdida de sello": "sello",
}


def kp_limites(K, tau, T, Ka=KA, Km=KM):
    """Ventana de sintonía de la sección 8 para un juego de parámetros."""
    G = Ka * K * Km
    res = {"G": G,
           "kp_min20": 9.0 / G,
           "kp_min30": 30.62 / G}
    if T <= 0:
        res.update(kp_max_pade=np.inf, kp_max_exacto=np.inf, f_osc=np.nan)
        return res
    res["kp_max_pade"] = (1 + 2 * tau / T) / G
    # Límite exacto: frecuencia en la que la fase del lazo llega a -180°
    #   ω·T + atan(ω·τ) = π   ->   |GH(jω)| = 1
    lo, hi = 1.0, 1e9
    for _ in range(200):
        w = 0.5 * (lo + hi)
        if w * T + np.arctan(w * tau) > np.pi:
            hi = w
        else:
            lo = w
    res["kp_max_exacto"] = np.sqrt(1 + (w * tau) ** 2) / G
    res["f_osc"] = w / (2 * np.pi)
    return res


class LazoANC:
    """Integra el lazo paso a paso; conserva el estado entre llamadas.
    Todos los parámetros son atributos que pueden cambiarse en cualquier momento."""

    def __init__(self, Kp=300.0, K=1.0, tau=1.0e-3, T=T_NOM, Ka=KA, Km=KM,
                 u_max=U_MAX, ruido=1.0, anc=True, prealimentacion=False,
                 ff_ajuste=FF_AJUSTE, seed=0):
        self.Kp, self.K, self.tau, self.T = Kp, K, tau, T
        self.Ka, self.Km, self.u_max = Ka, Km, u_max
        self.ruido = ruido                      # escala del ruido ambiente (0 = sin ruido)
        self.anc = anc
        self.prealimentacion = prealimentacion
        self.ff_ajuste = ff_ajuste
        self.seed = seed
        self.reiniciar()

    def reiniciar(self):
        self.rng = np.random.default_rng(self.seed)
        self.t = 0.0
        self.c = 0.0                     # presión en el oído con ANC [Pa]
        self.c_off = 0.0                 # presión en el oído sin ANC (referencia) [Pa]
        self._nbuf = int(round(T_MAX_BUFFER / DT)) + 1
        self.buf_q = np.zeros(self._nbuf)
        self.buf_q_off = np.zeros(self._nbuf)
        self.idx = 0
        self.nb = 0.0
        self.saturado = False
        self.perturbaciones = []

    def set_calce(self, nombre):
        self.K = CALCE[nombre]["K"]
        self.tau = CALCE[nombre]["tau"]

    # --- perturbaciones manuales --------------------------------------------
    def agregar_perturbacion(self, tipo, amplitud=0.0, duracion=5e-3, frecuencia=200.0):
        """tipo: 'escalon', 'tono', 'rafaga' o 'sello'. Empieza en el instante actual."""
        p = {"tipo": tipo, "t0": self.t, "t1": self.t + duracion,
             "amp": amplitud, "f": frecuencia}
        if tipo == "rafaga":   # suma de tonos aleatorios entre 50 Hz y 1 kHz
            n = 8
            p["fs"] = self.rng.uniform(50, 1000, n)
            p["fases"] = self.rng.uniform(0, 2 * np.pi, n)
            p["a"] = amplitud * np.sqrt(2.0 / n)   # amplitud = valor eficaz de la ráfaga
        self.perturbaciones.append(p)
        return p

    def _perturbacion_manual(self, t):
        dm = np.zeros_like(t)
        sello = np.zeros(t.shape, dtype=bool)
        for p in self.perturbaciones:
            m = (t >= p["t0"]) & (t < p["t1"])
            if not m.any():
                continue
            tt = t[m] - p["t0"]
            if p["tipo"] == "escalon":
                dm[m] += p["amp"]
            elif p["tipo"] == "tono":
                dm[m] += p["amp"] * np.sin(2 * np.pi * p["f"] * tt)
            elif p["tipo"] == "rafaga":
                dm[m] += np.sum(p["a"] * np.sin(2 * np.pi * p["fs"][:, None] * tt + p["fases"][:, None]), axis=0)
            elif p["tipo"] == "sello":
                sello |= m
        return dm, sello

    def K_tau(self, t=None):
        """K y τ efectivos (cambian mientras dura una pérdida de sello)."""
        t = self.t if t is None else t
        for p in self.perturbaciones:
            if p["tipo"] == "sello" and p["t0"] <= t < p["t1"]:
                return CALCE["malo"]["K"], CALCE["malo"]["tau"]
        return self.K, self.tau

    # --- integración --------------------------------------------------------
    def paso(self, n):
        """Avanza n pasos de integración. Devuelve un dict de arreglos:
        t, d (ruido total que llega), dm (perturbación manual), coff, c, b, e, u."""
        t = self.t + DT * np.arange(n)
        amb = self.ruido * sum(a * np.sin(2 * np.pi * f * t) for f, a in TONOS)
        w = self.rng.normal(0, RUIDO_BANDA_ANCHA * 7, n)
        dm, sello = self._perturbacion_manual(t)
        K_arr = np.where(sello, CALCE["malo"]["K"], self.K)
        a_arr = DT / np.where(sello, CALCE["malo"]["tau"], self.tau)

        out = {k: np.empty(n) for k in ("d", "coff", "c", "b", "e", "u")}
        nT = int(round(min(max(self.T, 0.0), T_MAX_BUFFER) / DT))
        Kp, Ka, Km, umax = self.Kp, self.Ka, self.Km, self.u_max
        anc, pre, ff = self.anc, self.prealimentacion, self.ff_ajuste
        self.saturado = False
        for i in range(n):
            self.nb += 0.02 * (w[i] - self.nb)
            d = amb[i] + self.ruido * self.nb + dm[i]
            b = Km * self.c                       # realimentación [V]
            e = 0.0 - b                           # error, referencia nula [V]
            u = Kp * e if anc else 0.0            # ley de control proporcional [V]
            if anc and pre:
                # Prealimentación ideal: usa la misma d que llega al oído y pasa por el
                # mismo retardo que el anti-ruido. Con ff = 0.8 agrega 20·log(1/0.2) ≈ 14 dB.
                # En un auricular real el micrófono externo tiene otro camino acústico.
                u += -ff * d / Ka                 # anticipa la perturbación
            if abs(u) > umax:
                u = umax if u > 0 else -umax
                self.saturado = True
            q = d + Ka * u                        # superposición acústica [Pa]

            self.buf_q[self.idx] = q
            self.buf_q_off[self.idx] = d
            j = (self.idx - nT) % self._nbuf
            self.c += a_arr[i] * (-self.c + K_arr[i] * self.buf_q[j])
            self.c_off += a_arr[i] * (-self.c_off + K_arr[i] * self.buf_q_off[j])
            self.idx = (self.idx + 1) % self._nbuf

            out["d"][i] = d; out["coff"][i] = self.c_off; out["c"][i] = self.c
            out["b"][i] = b; out["e"][i] = e; out["u"][i] = u
        self.t += DT * n
        # descarta perturbaciones ya terminadas
        self.perturbaciones = [p for p in self.perturbaciones if p["t1"] > self.t]
        out["t"] = t
        out["dm"] = dm
        return out


def atenuacion_db(c_off, c):
    """Atenuación medida: relación entre los valores eficaces sin y con ANC."""
    r_off = np.sqrt(np.mean(c_off ** 2))
    r_on = np.sqrt(np.mean(c ** 2))
    if r_off < 1e-12:
        return np.nan
    return 20 * np.log10(r_off / max(r_on, 1e-12))


# ---------------------------------------------------------------------------
# Ensayos: generan las figuras para el informe
# ---------------------------------------------------------------------------
def ensayos(carpeta="."):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import os
    os.makedirs(carpeta, exist_ok=True)
    resumen = []

    def correr(lazo, dur, transitorio=10e-3):
        r = lazo.paso(int(dur / DT))
        m = r["t"] >= transitorio
        return r, atenuacion_db(r["coff"][m], r["c"][m])

    ms = 1e3

    # Ensayo 1: barrido de Kp con buen calce
    fig, ax = plt.subplots(figsize=(9, 4.5))
    primero = True
    for Kp, col in [(150, "#d08c2b"), (300, "#2f6db5"), (450, "#2a8a4a")]:
        r, att = correr(LazoANC(Kp=Kp), 40e-3)
        if primero:
            ax.plot(r["t"] * ms, r["coff"], color="#9a9a9a", lw=1, label="Sin ANC")
            primero = False
        ax.plot(r["t"] * ms, r["c"], color=col, lw=1, label=f"Kp = {Kp}  ({att:.1f} dB)")
        resumen.append(("Ensayo 1", f"Kp={Kp}, buen calce", f"{att:.1f} dB"))
    ax.set_xlim(20, 40); ax.set_xlabel("Tiempo [ms]"); ax.set_ylabel("Presión en el oído [Pa]")
    ax.set_title("Ensayo 1. Barrido de la ganancia Kp (buen calce)")
    ax.legend(loc="upper right", fontsize=8); ax.grid(alpha=0.3)
    fig.tight_layout(); fig.savefig(os.path.join(carpeta, "ensayo1_barrido_kp.png"), dpi=150); plt.close(fig)

    # Ensayo 2: retardo creciente con Kp fijo
    Kp = 300
    fig, axs = plt.subplots(4, 1, figsize=(9, 7), sharex=True)
    for ax, T in zip(axs, [40e-6, 60e-6, 80e-6, 100e-6]):
        r, att = correr(LazoANC(Kp=Kp, T=T), 40e-3)
        lim = kp_limites(1.0, 1e-3, T)
        # "estable" es la predicción analítica (Kp < Kp máx exacto), no una detección
        # sobre la señal simulada. En la práctica ambas coinciden.
        estable = Kp < lim["kp_max_exacto"]
        ax.plot(r["t"] * ms, r["coff"], color="#9a9a9a", lw=0.8)
        ax.plot(r["t"] * ms, r["c"], color="#2f6db5" if estable else "#c0392b", lw=0.8)
        txt = f"T = {T*1e6:.0f} µs  ·  Kp máx exacto = {lim['kp_max_exacto']:.0f}  ·  " + \
              (f"estable, {att:.1f} dB" if estable else "inestable (oscila)")
        ax.set_title(txt, fontsize=9, loc="left"); ax.grid(alpha=0.3); ax.set_ylabel("Pa")
        resumen.append(("Ensayo 2", f"Kp={Kp}, T={T*1e6:.0f} µs", "estable" if estable else "inestable"))
    axs[-1].set_xlabel("Tiempo [ms]"); axs[-1].set_xlim(20, 40)
    fig.suptitle("Ensayo 2. Retardo creciente con Kp = 300 (buen calce)")
    fig.tight_layout(); fig.savefig(os.path.join(carpeta, "ensayo2_retardo.png"), dpi=150); plt.close(fig)

    # Ensayo 3: el auricular se afloja con Kp fijo
    Kp = 480
    lazo = LazoANC(Kp=Kp)
    r1, att1 = correr(lazo, 30e-3)
    lazo.set_calce("malo")                     # pérdida de sello a los 30 ms
    r2 = lazo.paso(int(30e-3 / DT))
    t = np.concatenate([r1["t"], r2["t"]]) * ms
    c = np.concatenate([r1["c"], r2["c"]]); coff = np.concatenate([r1["coff"], r2["coff"]])
    u = np.concatenate([r1["u"], r2["u"]])
    fig, axs = plt.subplots(2, 1, figsize=(9, 5.5), sharex=True)
    axs[0].plot(t, coff, color="#9a9a9a", lw=0.8, label="Sin ANC")
    axs[0].plot(t, c, color="#c0392b", lw=0.8, label=f"Con ANC, Kp = {Kp}")
    axs[0].axvline(30, color="k", ls="--", lw=1)
    axs[0].text(30.3, axs[0].get_ylim()[1] * 0.8, "se afloja el auricular", fontsize=8)
    axs[0].set_ylabel("Presión [Pa]"); axs[0].legend(loc="lower left", fontsize=8); axs[0].grid(alpha=0.3)
    axs[1].plot(t, u, color="#7a4fa3", lw=0.8); axs[1].set_ylabel("Señal de control u [V]")
    axs[1].axhline(U_MAX, color="k", ls=":", lw=0.8); axs[1].axhline(-U_MAX, color="k", ls=":", lw=0.8)
    axs[1].set_xlabel("Tiempo [ms]"); axs[1].grid(alpha=0.3)
    fig.suptitle(f"Ensayo 3. Pérdida de sello con Kp = {Kp}: estable con buen calce, oscila con mal calce")
    fig.tight_layout(); fig.savefig(os.path.join(carpeta, "ensayo3_mal_calce.png"), dpi=150); plt.close(fig)
    resumen.append(("Ensayo 3", f"Kp={Kp}, buen calce", f"{att1:.1f} dB"))
    resumen.append(("Ensayo 3", f"Kp={Kp}, mal calce", "inestable (silbido, actuador saturado)"))

    # Ensayo 4: realimentación sola vs híbrido
    Kp = 300
    fig, ax = plt.subplots(figsize=(9, 4.5))
    for pre, col, nom in [(False, "#2f6db5", "Solo realimentación"), (True, "#2a8a4a", "Híbrido (con prealimentación)")]:
        r, att = correr(LazoANC(Kp=Kp, prealimentacion=pre), 40e-3)
        if not pre:
            ax.plot(r["t"] * ms, r["coff"], color="#9a9a9a", lw=1, label="Sin ANC")
        ax.plot(r["t"] * ms, r["c"], color=col, lw=1, label=f"{nom}  ({att:.1f} dB)")
        resumen.append(("Ensayo 4", f"Kp={Kp}, {nom.lower()}", f"{att:.1f} dB"))
    ax.set_xlim(20, 40); ax.set_xlabel("Tiempo [ms]"); ax.set_ylabel("Presión en el oído [Pa]")
    ax.set_title("Ensayo 4. Realimentación sola frente al esquema híbrido (Kp = 300, buen calce)")
    ax.legend(loc="upper right", fontsize=8); ax.grid(alpha=0.3)
    fig.tight_layout(); fig.savefig(os.path.join(carpeta, "ensayo4_hibrido.png"), dpi=150); plt.close(fig)

    # Ensayo 5: escalón de perturbación sin ruido ambiente -> verifica c_ss de la sección 8.3
    Kp, A = 300, 0.5
    lazo = LazoANC(Kp=Kp, ruido=0.0)
    lazo.paso(int(2e-3 / DT))
    lazo.agregar_perturbacion("escalon", amplitud=A, duracion=15e-3)
    r = lazo.paso(int(20e-3 / DT))
    KL = Kp * KA * 1.0 * KM
    css_teo = 1.0 * A / (1 + KL)
    m = (r["t"] > 12e-3) & (r["t"] < 17e-3)
    css_sim = float(np.mean(r["c"][m]))
    fig, ax = plt.subplots(figsize=(9, 4.5))
    ax.plot(r["t"] * ms, r["coff"], color="#9a9a9a", lw=1.2, label=f"Sin ANC (tiende a K·A = {A:.2f} Pa)")
    ax.plot(r["t"] * ms, r["c"], color="#2f6db5", lw=1.2, label=f"Con ANC, Kp = {Kp}")
    ax.axhline(css_teo, color="#2f6db5", ls=":", lw=1, label=f"c_ss teórico = K·A/(1+KL) = {css_teo:.4f} Pa")
    ax.set_xlabel("Tiempo [ms]"); ax.set_ylabel("Presión en el oído [Pa]"); ax.grid(alpha=0.3)
    ax.set_title(f"Ensayo 5. Escalón de perturbación A = {A} Pa sin ruido ambiente (simulado: {css_sim:.4f} Pa)")
    ax.legend(loc="upper right", fontsize=8)
    fig.tight_layout(); fig.savefig(os.path.join(carpeta, "ensayo5_escalon.png"), dpi=150); plt.close(fig)
    resumen.append(("Ensayo 5", f"escalón {A} Pa, Kp={Kp}", f"c_ss teórico {css_teo:.4f} Pa / simulado {css_sim:.4f} Pa"))

    for fila in resumen:
        print(" | ".join(fila))
    return resumen


# ---------------------------------------------------------------------------
# Interfaz interactiva en tiempo real
# ---------------------------------------------------------------------------
def construir_interfaz():
    import matplotlib.pyplot as plt
    from matplotlib.widgets import TextBox, RadioButtons, CheckButtons, Button
    from matplotlib.patches import Rectangle
    import time

    VENTANA = 20e-3          # tiempo visible en pantalla [s]
    POR_CUADRO = 0.5e-3      # tiempo simulado por cuadro [s] (cámara lenta: la ventana se recorre en ~1,2 s)
    INTERVALO_MS = 30        # cada cuánto se actualiza la pantalla [ms]
    DEC = 5                  # se dibuja 1 de cada 5 muestras (la tabla usa todas)
    REFRESCO_TABLA = 0.5     # cada cuánto se reescriben los números de la tabla [s reales]
    # Escribir el texto de la tabla es lo más costoso de cada cuadro; hacerlo en todos los
    # cuadros dejaba los números ilegibles y sin tiempo libre para atender los clics.

    # Sin resaltado al pasar el mouse: matplotlib redibuja la ventana entera en cada
    # entrada/salida del puntero, y eso producía saltos en la animación.
    SIN_HOVER_TB = {"color": "0.95", "hovercolor": "0.95"}
    SIN_HOVER_B = {"color": "0.85", "hovercolor": "0.85"}

    lazo = LazoANC()
    n_ven = int(VENTANA / DT)
    claves = ("t", "d", "dm", "coff", "c", "b", "e", "u")
    hist = {k: np.zeros(n_ven) for k in claves}
    est = {"pausa": False, "cursor": None, "saturado": False, "sucio": True, "t_tabla": 0.0}

    fig = plt.figure(figsize=(16, 9.5))
    try:
        fig.canvas.manager.set_window_title("Simulador ANC - TFI Tecnologías para la Automatización")
    except Exception:
        pass

    # ---- gráficos (eje de tiempo fijo: los últimos 20 ms) -----------------
    ax_p = fig.add_axes([0.065, 0.67, 0.52, 0.28])
    ax_u = fig.add_axes([0.065, 0.37, 0.52, 0.24], sharex=ax_p)
    ax_e = fig.add_axes([0.065, 0.07, 0.52, 0.24], sharex=ax_p)
    ejes = (ax_p, ax_u, ax_e)
    l_off, = ax_p.plot([], [], color="#9a9a9a", lw=1, label="Sin ANC (vía pasiva)")
    l_on, = ax_p.plot([], [], color="#2f6db5", lw=1, label="Con ANC (respuesta c)")
    l_dm, = ax_p.plot([], [], color="#e67e22", lw=1, ls="--", label="Perturbación manual dₘ")
    l_u, = ax_u.plot([], [], color="#7a4fa3", lw=1, label="Salida de control u")
    l_umax, = ax_u.plot([], [], color="k", ls=":", lw=0.8, label="Límite del parlante ±Umáx")
    l_umin, = ax_u.plot([], [], color="k", ls=":", lw=0.8)
    l_e, = ax_e.plot([], [], color="#d08c2b", lw=1, label="Error e = R − b")
    ax_p.set_ylabel("Presión en el oído [Pa]")
    ax_u.set_ylabel("Salida de control [V]")
    ax_e.set_ylabel("Error [V]")
    ax_e.set_xlabel("Tiempo relativo al último instante simulado [ms]   (el tiempo absoluto está en la tabla)")
    ax_p.set_title("Presión sonora residual en el canal auditivo")
    for ax in ejes:
        ax.grid(alpha=0.3)
        ax.legend(loc="upper right", fontsize=8)
    ax_p.set_xlim(-VENTANA * 1e3, 0)
    for ax, lim in ((ax_p, 0.8), (ax_u, 0.2), (ax_e, 8e-4)):
        ax.set_ylim(-lim, lim)
    cursores = [ax.axvline(0, color="k", ls="--", lw=1, visible=False) for ax in ejes]

    # ---- parámetros del lazo (columna A) ---------------------------------
    fig.text(0.655, 0.935, "Parámetros del lazo", fontsize=11, weight="bold")
    PARAMS = [  # atributo, etiqueta, factor a SI, mínimo, máximo (en la unidad mostrada)
        ("Kp", "Kp [V/V]", 1.0, 0, 5000),
        ("Ka", "Ka [Pa/V]", 1.0, 0.01, 100),
        ("Km", "Km [V/Pa]", 1.0, 1e-4, 1),
        ("K", "K [Pa/Pa]", 1.0, 0.01, 10),
        ("tau", "τ [ms]", 1e-3, 0.01, 100),
        ("T", "T [µs]", 1e-6, 0, 1000),
        ("u_max", "Umáx [V]", 1.0, 0.01, 100),
        ("ruido", "Ruido amb. [×]", 1.0, 0, 10),
        ("ff_ajuste", "Prealim. [%]", 1e-2, 0, 150),
    ]
    cajas = {}
    mensaje = fig.text(0.655, 0.012, "", fontsize=8, color="#555555")

    def fmt(v):
        return f"{v:.6g}"

    def avisar(txt, color="#555555"):
        mensaje.set_text(txt)
        mensaje.set_color(color)
        fig.canvas.draw_idle()

    def crear_submit(attr, etiqueta, factor, lo, hi):
        def on_submit(texto):
            try:
                v = float(texto.replace(",", "."))
            except ValueError:
                v = None
            if v is None or not (lo <= v <= hi):
                avisar(f"Valor inválido para {etiqueta}: debe estar entre {lo:g} y {hi:g}", "#c0392b")
                actual = fmt(getattr(lazo, attr) / factor)
                if cajas[attr].text != actual:
                    cajas[attr].set_val(actual)
                return
            setattr(lazo, attr, v * factor)
            est["sucio"] = True
            avisar(f"{etiqueta} = {v:g}")
        return on_submit

    y = 0.885
    for attr, etiqueta, factor, lo, hi in PARAMS:
        tb = TextBox(fig.add_axes([0.735, y, 0.065, 0.032]), etiqueta + "  ",
                     initial=fmt(getattr(lazo, attr) / factor), **SIN_HOVER_TB)
        tb.on_submit(crear_submit(attr, etiqueta, factor, lo, hi))
        cajas[attr] = tb
        y -= 0.045
    fig.text(0.655, y + 0.012, "Escribí el valor y apretá Enter", fontsize=7.5, color="#777777")

    r_calce = RadioButtons(fig.add_axes([0.655, 0.40, 0.145, 0.065]),
                           ("Preset: calce bueno", "Preset: calce malo"))

    def on_calce(etiqueta):
        nombre = "bueno" if "bueno" in etiqueta else "malo"
        cajas["K"].set_val(fmt(CALCE[nombre]["K"]))
        cajas["tau"].set_val(fmt(CALCE[nombre]["tau"] * 1e3))
    r_calce.on_clicked(on_calce)

    # ---- perturbación manual y simulación (columna B) --------------------
    fig.text(0.815, 0.935, "Perturbación manual", fontsize=11, weight="bold")
    r_tipo = RadioButtons(fig.add_axes([0.815, 0.775, 0.165, 0.145]), tuple(TIPOS_PERTURBACION))
    pert = {}
    for clave, etiqueta, inicial, yy in [("amp", "Amplitud [Pa]", "0.3", 0.725),
                                         ("dur", "Duración [ms]", "5", 0.68),
                                         ("f", "Frecuencia [Hz]", "200", 0.635)]:
        pert[clave] = TextBox(fig.add_axes([0.905, yy, 0.075, 0.032]), etiqueta + "  ", initial=inicial, **SIN_HOVER_TB)
    b_aplicar = Button(fig.add_axes([0.815, 0.575, 0.165, 0.042]), "Aplicar perturbación", **SIN_HOVER_B)

    def on_aplicar(_=None):
        etiqueta = r_tipo.value_selected
        tipo = TIPOS_PERTURBACION[etiqueta]
        try:
            amp = float(pert["amp"].text.replace(",", "."))
            dur = float(pert["dur"].text.replace(",", ".")) * 1e-3
            f = float(pert["f"].text.replace(",", "."))
        except ValueError:
            avisar("Revisá amplitud, duración y frecuencia: deben ser números", "#c0392b")
            return
        if not (0 < dur <= 1.0):
            avisar("La duración debe estar entre 0 y 1000 ms", "#c0392b")
            return
        if tipo == "tono" and not (0 < f <= 20000):
            avisar("La frecuencia del tono debe estar entre 0 y 20000 Hz", "#c0392b")
            return
        lazo.agregar_perturbacion(tipo, amp, dur, f)
        detalle = {"escalon": f"{amp:g} Pa", "tono": f"{amp:g} Pa, {f:g} Hz",
                   "rafaga": f"{amp:g} Pa ef.",
                   "sello": f"K={CALCE['malo']['K']}, τ={CALCE['malo']['tau']*1e3:g} ms"}[tipo]
        sufijo = " (arranca al reanudar)" if est["pausa"] else ""
        avisar(f"Perturbación aplicada en t = {lazo.t*1e3:.1f} ms: {etiqueta}, {detalle}, {dur*1e3:g} ms{sufijo}")
    b_aplicar.on_clicked(on_aplicar)

    fig.text(0.815, 0.53, "Simulación", fontsize=11, weight="bold")
    c_ops = CheckButtons(fig.add_axes([0.815, 0.44, 0.165, 0.08]),
                         ("ANC encendido", "Prealimentación"), (True, False))

    def on_ops(_):
        lazo.anc, lazo.prealimentacion = c_ops.get_status()
        est["sucio"] = True
    c_ops.on_clicked(on_ops)

    b_pausa = Button(fig.add_axes([0.815, 0.39, 0.08, 0.042]), "Pausa", **SIN_HOVER_B)
    b_reset = Button(fig.add_axes([0.90, 0.39, 0.08, 0.042]), "Reiniciar", **SIN_HOVER_B)

    # ---- tabla de valores (dibujada a mano para poder actualizarla rápido) -
    ax_t = fig.add_axes([0.655, 0.035, 0.325, 0.315])
    ax_t.axis("off")
    ax_t.set_xlim(0, 1); ax_t.set_ylim(0, 1)
    FILAS = [  # (magnitud, símbolo, unidad)
        ("Tiempo", "t", "ms"),
        ("Ruido que llega (vía pasiva)", "d", "Pa"),
        ("   del cual, perturbación manual", "dₘ", "Pa"),
        ("Presión sin ANC", "c₀", "Pa"),
        ("Presión con ANC (respuesta)", "c", "Pa"),
        ("Realimentación (mic interno)", "b", "mV"),
        ("Error  e = R − b", "e", "mV"),
        ("Salida de control", "u", "V"),
        ("Presión del parlante", "Ka·u", "Pa"),
        # Valores eficaces: misma media ventana (últimos 10 ms) que la atenuación medida
        ("Presión sin ANC, valor eficaz", "c₀ ef", "Pa"),
        ("Presión con ANC, valor eficaz", "c ef", "Pa"),
        ("Salida de control, valor eficaz", "u ef", "V"),
        ("Condición del proceso", "K, τ", ""),
        ("Ganancia estática de lazo", "KL", "—"),
        ("Kp mínimo para 20 dB", "", "V/V"),
        ("Kp mínimo para 30 dB", "", "V/V"),
        ("Kp máximo (Padé y Routh)", "", "V/V"),
        ("Kp máximo (exacto)", "", "V/V"),
        ("Atenuación medida (ventana)", "", "dB"),
        ("Estado del lazo", "", ""),
    ]
    n_f = len(FILAS) + 1
    h = 1.0 / n_f
    xs = (0.0, 0.48, 0.60, 0.86, 1.0)
    for i in range(n_f):
        cara = "#e8e8e8" if i == 0 else ("#f6f6f6" if i > 12 else "white")
        ax_t.add_patch(Rectangle((0, 1 - (i + 1) * h), 1, h, facecolor=cara, edgecolor="#cccccc", lw=0.6))
    ax_t.vlines(xs[1:-1], 0, 1, colors="#cccccc", lw=0.6)
    yc = [1 - (i + 0.5) * h for i in range(n_f)]
    for x0, txt in zip(xs, ("Magnitud", "Símbolo", "Valor", "Unidad")):
        ax_t.text(x0 + 0.01, yc[0], txt, fontsize=7.5, weight="bold", va="center")
    valores_txt = []
    for i, (m, s, u) in enumerate(FILAS, start=1):
        ax_t.text(xs[0] + 0.01, yc[i], m, fontsize=7.5, va="center")
        ax_t.text(xs[1] + 0.01, yc[i], s, fontsize=7.5, va="center")
        ax_t.text(xs[3] + 0.01, yc[i], u, fontsize=7.5, va="center")
        valores_txt.append(ax_t.text(xs[2] + 0.01, yc[i], "", fontsize=7.5, va="center"))
    titulo_tabla = ax_t.text(0, 1.02, "", fontsize=9, va="bottom")

    # ---- dibujo rápido (blitting): solo se redibuja lo que cambia ----------
    animados = [l_off, l_on, l_dm, l_u, l_umax, l_umin, l_e, *cursores, *valores_txt, titulo_tabla,
                b_pausa.label]   # el texto Pausa/Reanudar cambia sin redibujar toda la ventana
    for a in animados:
        a.set_animated(True)
    fondo = {"img": None}

    def on_draw(_):
        fondo["img"] = fig.canvas.copy_from_bbox(fig.bbox)
        for a in animados:
            fig.draw_artist(a)
    fig.canvas.mpl_connect("draw_event", on_draw)

    from matplotlib.transforms import Bbox, TransformedBbox

    def zonas():
        """Rectángulos de pantalla que cambian: los tres gráficos y la tabla con su título."""
        tabla_zona = TransformedBbox(Bbox.from_extents(0.645, 0.03, 0.99, 0.385), fig.transFigure)
        return [ax.bbox for ax in ejes] + [tabla_zona, b_pausa.ax.bbox]

    animados_graficos = [l_off, l_on, l_dm, l_u, l_umax, l_umin, l_e, *cursores]

    def blit(con_tabla=True):
        if fondo["img"] is None:
            fig.canvas.draw_idle()
            return
        if not con_tabla:
            # Solo los gráficos: la tabla queda dibujada como estaba en el cuadro anterior.
            cajas_ejes = [ax.bbox.padded(2) for ax in ejes]
            for z in cajas_ejes:
                fig.canvas.restore_region(fondo["img"], bbox=z, xy=(0, 0))  # xy = origen del fondo guardado (figura entera)
            for a in animados_graficos:
                fig.draw_artist(a)
            for z in cajas_ejes:
                fig.canvas.blit(z)
            return
        fig.canvas.restore_region(fondo["img"])
        for a in animados:
            fig.draw_artist(a)
        for z in zonas():
            fig.canvas.blit(z)

    def actualizar_tabla():
        i = est["cursor"] if (est["pausa"] and est["cursor"] is not None) else n_ven - 1
        v = {k: hist[k][i] for k in claves}
        K, tau = lazo.K_tau(v["t"])
        lim = kp_limites(K, tau, lazo.T, lazo.Ka, lazo.Km)
        KL = lazo.Kp * lim["G"]
        att = atenuacion_db(hist["coff"][n_ven // 2:], hist["c"][n_ven // 2:]) if lazo.anc else np.nan
        sello = " (sello perdido)" if (K, tau) != (lazo.K, lazo.tau) else ""
        ef = {k: np.sqrt(np.mean(hist[k][n_ven // 2:] ** 2)) for k in ("coff", "c", "u")}
        textos = [f"{v['t']*1e3:.3f}", f"{v['d']:+.4f}", f"{v['dm']:+.4f}", f"{v['coff']:+.4f}",
                  f"{v['c']:+.4f}", f"{v['b']*1e3:+.3f}", f"{v['e']*1e3:+.3f}", f"{v['u']:+.4f}",
                  f"{lazo.Ka*v['u']:+.4f}",
                  f"{ef['coff']:.4f}", f"{ef['c']:.4f}", f"{ef['u']:.4f}",
                  f"{K:g}; {tau*1e3:g} ms{sello}", f"{KL:.2f}",
                  f"{lim['kp_min20']:.0f}", f"{lim['kp_min30']:.0f}", f"{lim['kp_max_pade']:.0f}",
                  f"{lim['kp_max_exacto']:.0f}", "—" if np.isnan(att) else f"{att:.1f}"]
        for txt_art, txt in zip(valores_txt, textos):
            txt_art.set_text(txt)
            txt_art.set_color("#c0392b" if sello and txt.endswith(sello) else "black")
        if not lazo.anc:
            estado, color = "ANC apagado", "#555555"
        elif lazo.Kp >= lim["kp_max_exacto"]:
            # Predicción analítica a partir de los parámetros, no detección sobre la señal.
            estado, color = "INESTABLE", "#c0392b"
        elif est["saturado"]:
            estado, color = "Estable, saturado", "#d08c2b"
        else:
            estado, color = "ESTABLE", "#2a8a4a"
        valores_txt[-1].set_text(estado)
        valores_txt[-1].set_color(color)
        l_on.set_color("#c0392b" if estado == "INESTABLE" else "#2f6db5")
        if est["pausa"]:
            titulo_tabla.set_text(f"EN PAUSA · valores en t = {v['t']*1e3:.3f} ms (clic en un gráfico para mover el cursor)")
        else:
            titulo_tabla.set_text("Valores instantáneos (último instante simulado, se actualizan cada 0,5 s)")

    def actualizar_lineas():
        x = (hist["t"][::DEC] - hist["t"][-1]) * 1e3
        l_off.set_data(x, hist["coff"][::DEC]); l_on.set_data(x, hist["c"][::DEC])
        l_dm.set_data(x, hist["dm"][::DEC])
        l_u.set_data(x, hist["u"][::DEC]); l_e.set_data(x, hist["e"][::DEC])
        xx = [-VENTANA * 1e3, 0]
        l_umax.set_data(xx, [lazo.u_max] * 2); l_umin.set_data(xx, [-lazo.u_max] * 2)

    def ajustar_escalas():
        """Cambia la escala vertical solo cuando hace falta (eso obliga a redibujar todo)."""
        cambio = False
        for ax, datos, minimo in ((ax_p, (hist["coff"], hist["c"], hist["dm"]), 0.05),
                                  (ax_u, (hist["u"],), 0.01), (ax_e, (hist["e"],), 1e-4)):
            pico = max(np.max(np.abs(d)) for d in datos)
            lim = ax.get_ylim()[1]
            if pico > lim or max(pico, minimo) < 0.35 * lim:
                nuevo = 1.3 * max(pico, minimo)
                ax.set_ylim(-nuevo, nuevo)
                cambio = True
        return cambio

    def tick():
        if est["pausa"] and not est["sucio"]:
            return          # en pausa y sin cambios: no hay nada que redibujar
        cambio_usuario = est["sucio"]   # el usuario tocó algo: la tabla se actualiza ya
        est["sucio"] = False
        if not est["pausa"]:
            n = int(POR_CUADRO / DT)
            r = lazo.paso(n)
            for k in claves:
                hist[k] = np.concatenate([hist[k][n:], r[k]])
            est["saturado"] = lazo.saturado
            actualizar_lineas()
        ahora = time.monotonic()
        con_tabla = cambio_usuario or est["pausa"] or ahora - est["t_tabla"] >= REFRESCO_TABLA
        if con_tabla:
            actualizar_tabla()
            est["t_tabla"] = ahora
        if not est["pausa"] and ajustar_escalas():
            fig.canvas.draw_idle()
        else:
            blit(con_tabla)

    def mostrar_cursor(i):
        est["cursor"] = i
        est["sucio"] = True
        x = (hist["t"][i] - hist["t"][-1]) * 1e3
        for cl in cursores:
            cl.set_xdata([x, x])
            cl.set_visible(True)

    def on_pausa(_=None):
        est["pausa"] = not est["pausa"]
        b_pausa.label.set_text("Reanudar" if est["pausa"] else "Pausa")
        if est["pausa"]:
            mostrar_cursor(n_ven - 1)
        else:
            est["cursor"] = None
            for cl in cursores:
                cl.set_visible(False)
            est["sucio"] = True                 # la tabla deja de decir "EN PAUSA" enseguida
            if not np.allclose(ax_p.get_xlim(), (-VENTANA * 1e3, 0)):
                ax_p.set_xlim(-VENTANA * 1e3, 0)    # deshace un posible zoom
                fig.canvas.draw_idle()              # cambian los ejes: hay que redibujar todo
        # Sin zoom de por medio no hace falta redibujar toda la ventana: el próximo cuadro
        # actualiza solo el botón, los cursores y la tabla (ver blit).
        est["sucio"] = True
    b_pausa.on_clicked(on_pausa)

    def on_reset(_=None):
        lazo.reiniciar()
        for k in claves:
            hist[k][:] = 0
        est["sucio"] = True
        actualizar_lineas()
        avisar("Simulación reiniciada (se conservan los parámetros)")
    b_reset.on_clicked(on_reset)

    def on_click(ev):
        if not est["pausa"] or ev.inaxes not in ejes or ev.xdata is None:
            return
        tb = getattr(fig.canvas, "toolbar", None)
        if tb is not None and getattr(tb, "mode", "") not in ("", None):
            return   # zoom o desplazamiento activo: no mover el cursor
        x = (hist["t"] - hist["t"][-1]) * 1e3
        mostrar_cursor(int(np.argmin(np.abs(x - ev.xdata))))
    fig.canvas.mpl_connect("button_press_event", on_click)

    actualizar_lineas()
    actualizar_tabla()
    timer = fig.canvas.new_timer(interval=INTERVALO_MS)
    timer.add_callback(tick)
    timer.start()
    fig._timer = timer
    fig._widgets = [r_calce, r_tipo, c_ops, b_aplicar, b_pausa, b_reset, *cajas.values(), *pert.values()]
    return {"fig": fig, "lazo": lazo, "hist": hist, "est": est, "actualizar": tick,
            "on_pausa": on_pausa, "on_aplicar": on_aplicar, "on_reset": on_reset, "on_click": on_click,
            "cajas": cajas, "pert": pert, "r_tipo": r_tipo, "r_calce": r_calce, "ejes": ejes}


def interfaz():
    import matplotlib.pyplot as plt
    g = construir_interfaz()
    plt.show()
    return g


if __name__ == "__main__":
    if "--ensayos" in sys.argv:
        ensayos("figuras")
    else:
        interfaz()
