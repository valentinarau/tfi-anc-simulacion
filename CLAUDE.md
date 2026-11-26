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

Actualización (13/11/2026, 5): app web apta para celular (lienzo vertical 1080 × 1920 cuando la pantalla está parada),
sin raya en los bordes (textura, oliva y línea siguen fuera del lienzo), y textura de papel original (`web/grano.png`,
copiada de `web/referencia/grano.png`). Los enlaces llevan `?v=N` para que el navegador no use versiones viejas en caché.

Actualización (13/11/2026, 6): diseño final de la página de información en `web/referencia/Info.dc.html`,
con la especificación para construirla en `web/referencia/INFO.md` y sus fotos en `web/referencia/img/`.
`Prototipo.dc.html` actualizado (indicador "ganancia 300 → N" con marca de límite y enlace "[info] →" en el "?").
Próximo paso: Claude Code construye la página de información en `web/` y suma esos dos cambios a la app.
Actualización (13/11/2026, 7): micrófono y sample pasan por una "almohadilla pasiva" (pasabajos de 2.º orden
en 1 kHz, suposición de la app, no del informe) antes de entrar al lazo; afuera se dibuja el sonido completo.
Escala mínima del dibujo del micrófono: 0,1 Pa. Mediciones en silencio: MacBook −50,6 dBFS (casi todo debajo
de 300 Hz), AirPods −69,6 dBFS (soplido de 3 a 10 kHz); el modelo deja eso en −78 / −95 dBFS, sin umbral de
silencio. El soplido audible con AirPods probablemente sea el modo llamada de Bluetooth (24 kHz). Ver `web/README.md`.

Actualización (13/11/2026, 8): página de información construida en `web/info.html` (+ `info.css`, `info.js`, fotos en
`web/img/`), según `web/referencia/INFO.md`; usa la paleta que la app guarda al tocar [tema]. En la app: indicador
"ganancia 300 → N" con marca de límite (447 flojo / 528 puesto, los de la fórmula) y "[info] →" en el "?". La tensión
de la línea ahora llega al máximo en el límite del calce actual. Falta confirmar origen y licencia de las 8 fotos.

Actualización (13/11/2026, 9): en la app la ganancia queda fija al soltar la línea (antes volvía a 300). La barrita del
indicador funciona como slider (arrastrar sube o baja Kp, 300 a 650); tocarla o tocar G sin mantener vuelve a 300.
`motor.js` acepta el mensaje `{ kp }`. La página de información no se tocó.

Actualización (13/11/2026, 10): Esc en la app primero cierra lo que esté abierto ("?", carteles del micrófono) y, si no hay
nada, vuelve al inicio igual que tocar el título (paleta y sample cargado quedan).

Actualización (13/11/2026, 11): audios de prueba para "05 sample" en `samples/` (calle, transporte, efectos), con
origen, licencia y atenuación medida en `samples/README.md`. Las dos grabaciones de Buenos Aires están recortadas a 1 min;
falta completar su origen.

Actualización (13/11/2026, 12): favicon (`web/favicon.svg` + `web/favicon.js`): gota de tinta rosa con punto color papel,
como el botón cancelar encendido; cambia con la paleta en la app y en la página de información. En el pie de la página de
información, [Simulación] pasó a ser [Créditos]: Valentina Rau y Thomas Pereyra.

Actualización (14/11/2026): fecha de entrega en la carátula: 28/11/2026. Ecuaciones del informe ya insertadas con el editor de Docs (13); faltan corregir a mano la 3 (θo con letra o y Π en el denominador) y la 10 (+ después de s²).

Actualización (14/11/2026, 2): micrófono externo (ME) agregado al diagrama según el boceto del profesor: su señal se suma
a la del micrófono interno en un punto suma (+ +) antes del comparador. Figuras 2 y 3 nuevas (mismo estilo, compuestas
sobre las originales) subidas a Drive como TFI_ANC_figura2_bloques.png y TFI_ANC_figura3_bloques_unidades.png; falta
reemplazarlas a mano en el informe. Textos agregados: sección 4, Tabla 2 (Elemento de medición), 6.4 (dₑ(t), bₑ(t),
e(t) con ME), Tabla 6 (fila Hₑ(s) = Kme), 8.4 (la rama de ME no cierra lazo: no cambia estabilidad) y 9.5 (paréntesis).
Kme queda simbólico.

Actualización (26/11/2026): en el informe, la lista de señales de la 6.4 pasó a ser la Tabla 5 ("Señales del lazo"), así que
las tablas siguientes se corrieron un número: leyes de control = Tabla 6, transferencias = Tabla 7, atenuación por
frecuencia = Tabla 8, Routh = Tabla 9, ventana de sintonía = Tabla 10, ruidos urbanos = Tabla 11, interfaz = Tabla 12,
síntesis de ensayos = Tabla 13. Actualizadas las citas en `generar_evidencia.py` y en los README de `evidencia/`
(solo el número de tabla; los resultados no cambian). La sección 6 pasó a llamarse "Alcance y estructura del sistema".
Las menciones a tablas en las actualizaciones anteriores de este archivo usan la numeración vieja.
En revisión: el 26/11 el texto del informe pasó a describir la prealimentación como una rama que se suma a la salida del
controlador (como en `simulacion_anc.py`); eso difiere del boceto del profesor (ME sumado antes del comparador,
actualización del 14/11, 2). Falta decidir cuál queda.
Resuelto (26/11/2026, 2): el informe volvió al modelo del boceto del profesor. El ME suma su señal a la del micrófono interno
antes del comparador: e(t) = r(t) − [b(t) + bₑ(t)], u(t) = Kp·e(t), y C(s)/De(s) = −Kme·Kp·Ka·Gp(s)/(1 + GH(s)) en la 8.2.
Kme sigue simbólico (sin fila en la Tabla 4). Las Figuras 2 y 3 quedan como están. El simulador no cambia: la 9.5 aclara que
idealiza esa rama como una resta directa sobre el ruido. No volver a cambiar este modelo sin consultar: es el del profesor.

Actualización (26/11/2026, 3): `simulacion_anc.py` ahora calcula la prealimentación como el diagrama del profesor: la señal del
micrófono externo (`be = Kme·d`, con `Kme = ajuste/(Kp·Ka)`) se suma a la del interno antes del comparador, `e = R − (b + be)`
y `u = Kp·e`. Antes se restaba aparte (`u += −ff·d/Ka`). Los resultados no cambian: comparado corrida por corrida contra la
versión anterior (33 configuraciones), c y u coinciden salvo redondeo (≤ 4·10⁻¹² Pa); los 5 ensayos, la evidencia y
`node web/test/comparar.js` dan lo mismo. Único cambio de comportamiento: con Kp = 0 la prealimentación ya no actúa.
`paso()` devuelve además `be`. Etiquetas de la interfaz: "Error e = R − (b + bₑ)". `web/motor.js` no se tocó: la app web
no tiene prealimentación. No se regeneró `evidencia/` ni `web/test/referencia_python.json` (solo cambiarían por redondeo y
por la tipografía de las figuras). Falta en el informe: 9.5 (ya no es "una resta directa sobre el ruido") y 9.1 (e = r − (b + bₑ)).

Actualización (26/11/2026, 4): retoques a las Figuras 2 y 3 del informe (solo rótulos; bloques, flechas y puntos suma siguen
siendo los del boceto del profesor). Figura 2: "Perturbación: ruido ambiente que atraviesa la barrera" y "Ruido ambiente
(exterior, antes de la barrera)", para distinguir d(t) de dₑ(t). Figura 3: "Perturbación [Pa]: ruido ambiente que atraviesa la
barrera física" (se sacó "fuga por mal calce": según la 6.2 cambia K y τ, no suma presión), el "+" inferior del punto suma de
perturbaciones pasó al lado de la flecha del actuador, Carga = "sistema auditivo" y "(exterior, antes de la barrera)".
Los PNG nuevos se entregaron por chat (TFI_ANC_figura2_bloques_v2.png y TFI_ANC_figura3_bloques_unidades_v2.png); los de Drive
siguen siendo los anteriores. Las dos ya están reemplazadas en el informe (verificado en el PDF exportado el 26/11).
Se decidió no indicar señales analógicas/digitales en la Figura 3: lo cubren la 6.4 y la Tabla 5.
Ecuaciones: la 3 y la 10 ya están corregidas en el informe (θo con letra o, Π en el denominador, + después de s²); ahora son 14
porque se agregó la de C(s)/De(s) en la 8.2. Citas: revisadas; la consigna pide solo la lista de bibliografía y el informe no
usa marcas [n] (igual que el TFI de silos corregido por el profesor). Sin fuente nombrada en la frase, aunque sí en la
bibliografía: 70 a 75 dB sobre avenidas (8.7), 375 µs de Bluetooth (10.3), frecuencias de la Tabla 11 y umbral de dolor (6.6).
Pendiente del informe: actualizar el índice y sacar los resaltados amarillos antes de exportar a PDF.
