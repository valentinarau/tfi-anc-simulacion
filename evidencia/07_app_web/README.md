# Caso 07: motor de la app web contra el simulador en Python

Se prueba que la app web (`web/`, la demo "borrar el ruido") usa el mismo lazo que
`simulacion_anc.py`: el motor `web/motor.js` es la traducción de `LazoANC.paso` a JavaScript
(mismos Ka, Km, K, τ, T, Umáx = ±3 V, retardo con buffer y paso de 1 µs) y los ruidos salen de las
mismas fórmulas (suma de tonos de `agregar_perturbacion`).

**Cómo se generó:** `node web/test/comparar.js --evidencia` (Node v24.22.1). Los valores de
Python los produce `web/test/referencia_python.py`, que importa `simulacion_anc.py` sin modificarlo.

## Parámetros

- Kp = 300, T = 40 µs, Ka = 6 Pa/V, Km = 0,0126 V/Pa, Umáx = ±3 V.
  Buen calce K = 1, τ = 1 ms; mal calce K = 0,6, τ = 0,5 ms. Sin ruido ambiente: cada ruido solo.
- Niveles en el oído: tránsito 0,36 Pa (85 dB SPL), colectivo 0,63 Pa (90 dB SPL), bocina 2 Pa
  (100 dB SPL, como el caso 06). Mientras el lazo no satura, la atenuación no depende del nivel.
- Atenuación = 20·log10(c₀ ef / c ef), descartando los primeros 20 ms. Tránsito y colectivo:
  ventana de 200 ms (7 períodos del colectivo). Bocina: 20 a 195 ms, como el caso 06.
- 5 semillas por caso. Tolerancia: ±0,5 dB en atenuación, ±1 % en Kp y en el escalón.

## A. El lazo, paso a paso, con el mismo ruido que Python

Mismas frecuencias y fases que sorteó Python. Se muestra el promedio de las 5 semillas y la
diferencia más grande entre una corrida de Python y la misma corrida en JavaScript.

| Caso | Python [dB] | JavaScript [dB] | Peor diferencia [dB] | Tolerancia | ¿Coincide? |
|---|---|---|---|---|---|
| Tránsito, buen calce | 25,64 | 25,64 | -0,00 | ±0,5 dB | Sí |
| Tránsito, mal calce | 22,18 | 22,18 | +0,00 | ±0,5 dB | Sí |
| Bocina, buen calce | 16,73 | 16,73 | +0,00 | ±0,5 dB | Sí |
| Bocina, mal calce | 17,26 | 17,26 | +0,00 | ±0,5 dB | Sí |
| Colectivo, buen calce | 26,85 | 26,85 | -0,00 | ±0,5 dB | Sí |
| Colectivo, mal calce | 23,10 | 23,10 | +0,00 | ±0,5 dB | Sí |

## B. El camino de la app (AudioWorklet a 48 kHz)

El ruido se calcula a 48 kHz y el lazo avanza ~21 pasos de 1 µs por muestra, con el ruido
interpolado entre muestras (lo mismo que hace el AudioWorklet). Los ruidos son los que sortea la
app: tienen las mismas fórmulas, pero el generador al azar no es el de numpy, así que las
frecuencias del tránsito y las fases son otras. Se compara el promedio de 5 semillas.

| Caso | Python [dB] | App [dB] | Diferencia [dB] | Tolerancia | ¿Coincide? |
|---|---|---|---|---|---|
| Tránsito, buen calce | 25,64 | 25,54 | -0,10 | ±0,5 dB | Sí |
| Tránsito, mal calce | 22,18 | 22,11 | -0,07 | ±0,5 dB | Sí |
| Bocina, buen calce | 16,73 | 16,74 | +0,01 | ±0,5 dB | Sí |
| Bocina, mal calce | 17,26 | 17,27 | +0,01 | ±0,5 dB | Sí |
| Colectivo, buen calce | 26,85 | 26,85 | +0,00 | ±0,5 dB | Sí |
| Colectivo, mal calce | 23,10 | 23,10 | -0,00 | ±0,5 dB | Sí |

## C. Kp máximo (límite de estabilidad)

La fórmula exacta (fase de −180°: ω·T + atan(ω·τ) = π) y el Kp a partir del cual el lazo
simulado oscila (bisección: un empujón de 0,01 Pa y se mira si la oscilación crece en 80 ms),
en Python y en JavaScript con el mismo procedimiento.

| Caso | Python | JavaScript | Diferencia | Tolerancia | ¿Coincide? |
|---|---|---|---|---|---|
| Kp máx exacto, buen calce (fórmula) | 527,9 | 527,9 | +0,00 % | ±1 % | Sí |
| Kp máx, buen calce (simulando el lazo) | 521,3 | 521,3 | +0,00 % | ±1 % | Sí |
| Kp máx exacto, mal calce (fórmula) | 447,0 | 447,0 | +0,00 % | ±1 % | Sí |
| Kp máx, mal calce (simulando el lazo) | 441,2 | 441,2 | +0,00 % | ±1 % | Sí |

**Nota.** El lazo simulado (en los dos lenguajes) empieza a oscilar un poco antes que lo que da
la fórmula: buen calce 521,3 frente a 527,9 (-1,25 %),
mal calce 441,2 frente a 447,0 (-1,29 %). No es un error de la
traducción: el integrador de Euler (paso de 1 µs) suma medio paso de retardo. Con T + 0,5 µs la
fórmula da 521,5 y 441,7, lo mismo que la simulación.
El ensayo 3 (Kp = 480 con mal calce) oscila con cualquiera de los dos valores.

## D. Escalón de 0,5 Pa (caso 05)

| Caso | Python | JavaScript | Diferencia | Tolerancia | ¿Coincide? |
|---|---|---|---|---|---|
| Escalón de 0,5 Pa: c al final (Pa) | 0,02111 | 0,02111 | +0,00 % | ±1 % | Sí |
| Escalón de 0,5 Pa: contra K·A/(1+KL) (Pa) | 0,02111 | 0,02111 | -0,00 % | ±1 % | Sí |

## Otras comprobaciones de la app

- Clase `Demo` (la que corre en el AudioWorklet), 1 s con ANC y buen calce: tránsito
  25,75 dB, bocina 16,98 dB (durante el golpe), colectivo 26,85 dB.
- Mantener apretada la línea (Kp sube desde 300 a 73,5 por segundo): con el auricular flojo el
  parlante empieza a saturar (silba) a los 2,07 s, con Kp = 452;
  puesto, a los 3,17 s, con Kp = 533. Los límites teóricos son 447 y 528.

## Veredicto

**Coincide.** Todas las comparaciones quedan dentro de la tolerancia: la app muestra y hace sonar el mismo lazo que el simulador del informe.
