# Simulador del lazo ANC

Trabajo Final Integrador de **Tecnologías para la Automatización** (Teoría de Control), curso K4521, UTN FRBA.
Profesor: Omar Oscar Civale. Integrantes: Thomas Leandro Pereyra y Valentina Luján Rau Robayo.

Simula en tiempo real el lazo de cancelación activa de ruido (ANC) de un auricular tipo AirPods Pro 3:
control proporcional por umbral sobre una cavidad de primer orden con retardo,
`Gp(s) = K·e^(−Ts) / (τs + 1)`, con referencia nula (silencio).

## Requisitos

Python 3 con `numpy` y `matplotlib`.

## Cómo correrlo

Crear el entorno virtual dentro de la carpeta del repositorio.

**Mac / Linux**

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python simulacion_anc.py
```

**Windows**

```bat
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python simulacion_anc.py
```

Si `python` no responde en Windows, usar `py` en su lugar.

## Modos

| Comando | Qué hace |
|---|---|
| `python simulacion_anc.py` | Abre la interfaz interactiva en tiempo real |
| `python simulacion_anc.py --ensayos` | Genera las figuras de los 5 ensayos en la carpeta `figuras/`, sin abrir la ventana |

## Ensayos

1. Barrido de Kp con buen calce.
2. Retardo creciente con Kp = 300.
3. Pérdida de sello con Kp = 480: estable con buen calce, oscila con mal calce.
4. Realimentación sola frente al esquema híbrido (con prealimentación).
5. Escalón de perturbación de 0,5 Pa sin ruido ambiente: verifica `c_ss = K·A/(1+KL)`.

## Simplificaciones del modelo

- El estado "INESTABLE" de la tabla y del ensayo 2 se calcula con la condición analítica
  (`Kp ≥ Kp máx exacto`), no a partir de la señal simulada. Ambos coinciden en la práctica.
- La prealimentación es ideal: usa la misma perturbación `d` y el mismo retardo que el anti-ruido,
  por lo que con un ajuste del 80 % agrega exactamente 20·log(1/0,2) ≈ 14 dB.

## Demo web ("borrar el ruido")

En `web/` está la demo interactiva para el público: el mismo lazo, traducido a JavaScript, corriendo
en el navegador con sonido. Cómo probarla, cómo se verifica contra este simulador y cómo publicarla
con GitHub Pages: ver [web/README.md](web/README.md).
