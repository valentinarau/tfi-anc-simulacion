# TFI ANC — contexto para Claude

TFI de Tecnologías para la Automatización (Teoría de Control), K4521, UTN FRBA, prof. Omar Civale.
Tema: cancelación activa de ruido (ANC) en auriculares tipo AirPods Pro 3.
Lazo realimentado, referencia nula (regulador), control proporcional por umbral,
proceso `Gp(s) = K·e^(−Ts)/(τs+1)`, medición `H = Km` (no unitaria).

- Informe (Google Doc "TFI_ANC"): https://docs.google.com/document/d/1snAkCpKFiEjC8VF6U9jXPklUjeFYLCWExgvCDUDFMY4/edit
- Simulador: `simulacion_anc.py` (este repo). Ver README para correrlo.

## Cómo trabajamos

- Hay más de una sesión de Claude tocando este repo: hacer `git pull` antes de empezar y commit + push al terminar.
- No modificar el informe ni el código sin preguntar antes.
- No borrar líneas existentes (incluidos comentarios) por iniciativa propia.
- Explicar en español rioplatense, de lo simple a lo complejo, sin dar nada por sabido.

## Estado del informe (nov 2026)

Hecho: correcciones al texto existente (umbral = saturación ±3 V del parlante; perturbaciones
interna/contexto; superposición en 8.2; senoidal → escalón y validez del TVF en 8.3; tipo 0;
atenuación por frecuencia; Padé sobreestima ~28 %; "garantiza" acotado a la banda baja; planitud desde 50 Hz).

Falta escribir: sección de simulación (interfaz + 5 ensayos), IoT y calidad de servicio,
señales del lazo y scan, criterio de falla, fundamentación P vs on-off/PI/PID, conclusión,
consideraciones especiales, puntos de interconexión, rango de salida del controlador,
amplificador de error, características de la respuesta, cargas asociadas, fecha en carátula,
copia de la consigna, y rehacer las figuras 1 y 2 en el formato del profesor.

Actualización (12/11/2026): ya están escritas en el informe todas las secciones de la lista anterior
(6.3 a 6.7, 7.1, 9 Simulación, 10 IoT y calidad de servicio, 11 Conclusión, 12 Consideraciones
especiales, copia de las pautas). Bibliografía pasó a ser la 13.
Sigue faltando: fecha de entrega (dice "[a completar]"), rehacer figuras 1 y 2, insertar las
figuras 3 a 7 de los ensayos (`python simulacion_anc.py --ensayos`, van donde dice
"[Figura N: insertar ...]") y actualizar el índice en Google Docs.

Actualización (12/11/2026, 2): 7.1 reescrita (PI descartado por continua no medible, windup y
beneficio nulo; PD/PID con números del modelo), párrafo nuevo en 8.3 (el escalón no implica
componente constante), sección nueva 8.7 (tránsito sostenido, bocina, colectivo en ralentí),
9.1 actualizada con la cámara lenta y los valores eficaces de la interfaz, 6 entradas nuevas
en la bibliografía.

Actualización (12/11/2026, 3): nueva Figura 1 en la sección 3 (corte del auricular rotulado con los
bloques del lazo). Las figuras se renumeraron: los diagramas en bloques pasaron a ser las figuras 2 y 3,
y los ensayos de la sección 9 son las figuras 4 a 8. Kp = 150 y 450 aclarados como fuera de la ventana
(8.3, 8.7, 9.2); sobrepico 41,5 % (6.5).

Actualización (12/11/2026, 4): sección 10 reescrita por pedido del profesor ("relación profunda con IoT:
dónde aparece, qué elementos usar e incorporar, si conviene"): 10.1 capas IoT del producto (verificado con
documentación de Apple), 10.2 propuesta de variables a informar, 10.3 por qué IoT no va dentro del lazo
(latencia BLE ≥ 375 µs frente a T = 40 µs), 10.4 garantizar/asegurar. Pérdida de sello = perturbación
intermedia (interpretación nuestra); ruido ambiente = externa. Scan = Tm, no publicado, incluido en T.

## Vocabulario del profesor

- Proporcional por umbral: acción proporcional dentro de una banda delimitada por umbrales.
- Garantizar (fuerte, respaldado) ≠ asegurar (best effort). Lazo ANC local garantiza; lazo IoT asegura.
- Error (desvío admisible por la carga, banda ±) ≠ falla (desvío inadmisible, vulnera la calidad de servicio).
- Perturbación: transitoria, impulsiva, entra ++ en el punto suma. Interna = generada por los componentes
  (sensibilidad); intermedias y externas = del contexto.
- Scan = ciclo operativo. Un impulso que dura un scan se considera escalón.
- Error en estado estable ≠ tolerancia (desvío de fabricación del componente).

Actualización (12/11/2026, 5): revisión de redacción aplicada al informe (respaldo previo en Drive:
"TFI_ANC (respaldo 12-11 antes de la revisión de redacción)"). Tablas nuevas: 5 (leyes de control, 7.1),
7 (atenuación por frecuencia con Kp = 300 y 450, 8.3), 10 (ruidos urbanos, 8.7), 11 (interfaz, 9.1) y
12 (síntesis de ensayos, sección nueva 9.7). Las viejas 5, 6 y 7 pasaron a ser 6, 8 y 9. Caso nominal
unificado en Kp = 300 (8.3, 8.7, conclusión: ~11 dB a 1 kHz, amplifica desde ~2,9 kHz). Planitud del
micrófono por debajo de 50 Hz tratada igual en 6.1 y 8.7. En 10.2 la decisión de ganancia queda en el
auricular (la red no baja Kp). Mapa de ítems de la consigna al inicio de la sección 6.

Actualización (12/11/2026, 6): segunda revisión aplicada. Cuerpo: ~6.850 palabras, 26 páginas. Sacada la jerga
de mercado y de electrónica (Sony de la Tabla 1, XENSIV, MEMS, salida diferencial, windup, filtro de refuerzo,
fórmula de rpm, especificación BLE, gateway, firmware). Ajustado a lo que da la materia (apuntes del proyecto):
sin respuesta en frecuencia (|1 + GH(jω)| reemplazado), sin coeficiente de amortiguamiento ni frecuencia natural
(la materia ve solo primer orden), Tabla 5 con el vocabulario de los apuntes (PI agrega polo en el origen,
PD agrega un cero). Epígrafe de la Figura 9 define OT e IT.

Actualización (13/11/2026): diseño de la app web demo ("borrar el ruido") copiado en `web/referencia/`
(prototipo navegable y pantallas de la herramienta de diseño, no ejecutables fuera de ella; ver su README).
Próximo paso: Claude Code construye la app en `web/` (lazo de LazoANC.paso en JavaScript con AudioWorklet,
verificación contra Python, GitHub Pages).

Actualización (13/11/2026, 2): app web construida en `web/` (HTML + CSS + JS plano, sin build).
`motor.js` = traducción de LazoANC.paso (verificada: `node web/test/comparar.js`, caso nuevo
`evidencia/07_app_web/`, todo dentro de ±0,5 dB y ±1 %); corre en un AudioWorklet (`procesador.js`) a 48 kHz.
Ruidos con las fórmulas de Python (tránsito 0,36 Pa, colectivo 0,63 Pa, bocina 2 Pa de 1 s cada 3 s sobre
tránsito a la mitad). Kp sube 73,5/s al mantener la línea (silba ~2,1 s flojo, ~3,2 s puesto).
El lazo simulado oscila desde Kp 521 / 441 (1,3 % debajo de la fórmula 528 / 447: Euler suma medio paso de retardo).
Publicación: workflow `.github/workflows/pages.yml` (falta activar Pages → Source: GitHub Actions).
Diferencias con el prototipo (cartel real del micrófono, sin sample ni tema, etc.) en `web/README.md`.
Pendiente: probar el micrófono real con auriculares (en el panel de Claude el micrófono está bloqueado).

Actualización (13/11/2026, 3): en la app web volvieron "05 sample" (archivo propio, en loop, al nivel del tránsito)
y el botón [tema] con las 6 paletas del prototipo (sin las teclas 5 y T). Tocar el título vuelve al inicio.
Las ondas derivan despacio (~0,12 ventanas/s) para que el colectivo no quede quieto.

Actualización (13/11/2026, 4): el repo pasó a ser público y Pages quedó activado (Source: GitHub Actions).
La demo está en https://valentinarau.github.io/tfi-anc-simulacion/ y se vuelve a publicar en cada push a `main` que toque `web/`.
