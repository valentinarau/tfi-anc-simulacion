# TFI ANC — contexto para Claude

TFI de Tecnologías para la Automatización (Teoría de Control), K4521, UTN FRBA, prof. Omar Civale.
Autores: Valentina Rau y Thomas Pereyra. Entrega: 28/11/2026.
Tema: cancelación activa de ruido (ANC) en auriculares tipo AirPods Pro 3.
Lazo realimentado, referencia nula (regulador), control proporcional por umbral,
proceso `Gp(s) = K·e^(−Ts)/(τs+1)`, medición `H = Km` (no unitaria).

- Informe (Google Doc "TFI_ANC"): https://docs.google.com/document/d/1snAkCpKFiEjC8VF6U9jXPklUjeFYLCWExgvCDUDFMY4/edit
- Simulador: `simulacion_anc.py`. Ver `README.md` para correrlo.
- Demo web: `web/`, publicada en https://valentinarau.github.io/tfi-anc-simulacion/. Detalle en `web/README.md`.
- Evidencia de los ensayos: `evidencia/` (la genera `generar_evidencia.py`). Audios de prueba: `samples/`.

Este archivo es para indicaciones y decisiones vigentes. No es una bitácora: el historial está en git.
Agregar algo acá solo si otra sesión lo necesita para no equivocarse; si una decisión cambia, corregir la línea, no sumar otra.

## Cómo trabajamos

- Hay más de una sesión de Claude tocando este repo: hacer `git pull` antes de empezar y commit + push al terminar.
- No modificar el informe ni el código sin preguntar antes.
- No borrar líneas existentes (incluidos comentarios) por iniciativa propia.
- Explicar en español rioplatense, de lo simple a lo complejo, sin dar nada por sabido.
- Antes de proponer, corregir o cambiar algo: leer este archivo entero, el informe completo y el material de la materia
  que corresponda, y validar que el cambio sea coherente con todo eso. No recomendar un cambio de modelo, de notación o de
  estructura sin haber hecho esa revisión.
- Cambios al repo: en una rama y con pull request. No pushear directo a `main` (un push a `main` que toque `web/` vuelve a
  publicar la demo). El repo es público: no subir nada privado ni material sin licencia clara.

## Decisiones vigentes (no cambiarlas sin consultar)

- **Micrófono externo (prealimentación): es el modelo del boceto del profesor.** Su señal se suma a la del micrófono interno
  en un punto suma (+ +) antes del comparador: `e(t) = r(t) − [b(t) + bₑ(t)]`, `u(t) = Kp·e(t)`,
  `C(s)/De(s) = −Kme·Kp·Ka·Gp(s)/(1 + GH(s))`. Esa rama no cierra lazo: no cambia la estabilidad. Las Figuras 2 y 3 del informe,
  el texto y `simulacion_anc.py` describen lo mismo. No pasarlo a "rama sumada a la salida del controlador".
- **Kme queda simbólico en el informe** (sin valor, sin fila en la tabla de parámetros). No es un error. El simulador usa
  `Kme = ajuste/(Kp·Ka)`, con ajuste 0,8.
- **Caso nominal Kp = 300; ventana de sintonía 198 ≤ Kp < 447.** Kp = 150, 450 y 480 aparecen en los ensayos a propósito,
  como valores fuera de la ventana.
- **Notación de señales:** minúscula con (t) para las analógicas y mayúscula con [k] para las digitales (Tabla 5 del informe).
  Equivalentes θ solo para r(t) = θi, d(t) = θd y c(t) = θo.
- **Límites de la materia:** el informe usa solo lo que da la cursada. Sin respuesta en frecuencia, sin coeficiente de
  amortiguamiento ni frecuencia natural (se ve solo primer orden), sin jerga de mercado ni de electrónica.
- **IoT:** fuera del lazo de cancelación (la latencia de Bluetooth supera el retardo del lazo). El lazo local garantiza; el
  lazo IoT asegura. La decisión de ganancia queda en el auricular. Pérdida de sello = perturbación intermedia (interpretación
  nuestra); ruido ambiente = externa. Scan = Tm, incluido en T.
- **Figuras 2 y 3:** se hicieron sobre el boceto del profesor; solo se retocan rótulos, no bloques ni flechas. La relación
  analógico/digital va en la 6.4 y la Tabla 5, no en la figura.
- **Estimaciones:** Ka, K, τ, T y el nivel de ruido son estimaciones; solo los datos del micrófono salen de una hoja de datos.
  Los resultados son órdenes de magnitud y el informe lo dice.

## Vocabulario del profesor

- Proporcional por umbral: acción proporcional dentro de una banda delimitada por umbrales.
- Garantizar (fuerte, respaldado) ≠ asegurar (best effort). Lazo ANC local garantiza; lazo IoT asegura.
- Error (desvío admisible por la carga, banda ±) ≠ falla (desvío inadmisible, vulnera la calidad de servicio).
- Perturbación: transitoria, impulsiva, entra ++ en el punto suma. Interna = generada por los componentes
  (sensibilidad); intermedias y externas = del contexto.
- Scan = ciclo operativo. Un impulso que dura un scan se considera escalón.
- Error en estado estable ≠ tolerancia (desvío de fabricación del componente).
- Carga: "sistema auditivo de una persona adulta con audición sana" ("usuario" es demasiado genérico).
- No describir las ramas como "en paralelo".

## Al tocar el informe

- Resaltar en amarillo todo lo que se modifique, para que lo revisen. Lo que vuelve a su redacción original va sin resaltar.
- Las ecuaciones (objetos del editor) y las imágenes no se pueden editar desde la API de Docs: hay que avisar y se cambian a mano.
- **Bibliografía:** es una lista al final, sin marcas [n] en el texto (es lo que pide la consigna). Todo dato externo que se
  agregue o cambie (norma, especificación, medición de terceros) tiene que tener su fuente en esa lista; al tocar un dato,
  revisar que la fuente esté y que diga lo que el informe afirma. En lo posible, nombrar la fuente en la misma frase.
- **Numeración:** si se agrega o saca una tabla o figura, actualizar todas las citas del informe y también las de
  `generar_evidencia.py` y los README de `evidencia/`, que citan tablas por número.
  Tablas: 1 sistemas de referencia, 2 elementos, 3 catálogo del micrófono, 4 contexto y parámetros, 5 señales del lazo,
  6 leyes de control, 7 transferencias, 8 atenuación por frecuencia, 9 Routh, 10 ventana de sintonía, 11 ruidos urbanos,
  12 interfaz, 13 síntesis de ensayos. Figuras: 1 corte del auricular, 2 y 3 diagramas en bloques, 4 a 8 ensayos, 9 capas IoT.
- Los valores numéricos del informe (sección 8 y ensayos) coinciden con el simulador y con `evidencia/`. Si un cambio toca un
  número, recalcularlo y verificarlo contra los tres.

## Al tocar el código

- `web/motor.js` es la traducción a JavaScript de `LazoANC.paso` de `simulacion_anc.py`. Si cambia el lazo en uno, revisar
  el otro y correr `node web/test/comparar.js` (tolerancia ±0,5 dB y ±1 %). La app web no tiene prealimentación.
- Después de cualquier cambio al simulador: correr los 5 ensayos (`python simulacion_anc.py --ensayos`) y comparar con los
  resultados de `evidencia/` (19,1 / 24,7 / 28,1 dB; 28,6 dB; 24,7 → 38,7 dB; 0,0211 Pa).
- No regenerar `evidencia/` ni `web/test/referencia_python.json` si los resultados no cambian: de una máquina a otra solo
  difieren el redondeo y la tipografía de las figuras. Para corregir un texto, editar el script y los README a mano.
- El lazo simulado oscila desde Kp 521 (buen calce) / 441 (mal calce), 1,3 % por debajo de la fórmula (528 / 447), porque
  Euler suma medio paso de retardo. No es un error.
- En la app web, la "almohadilla pasiva" (pasabajos de 1 kHz para micrófono y sample) es una suposición de la app, no del informe.
- `web/referencia/` es el prototipo de diseño: no es ejecutable y no se edita.

## Pendiente

- Informe: actualizar el índice y sacar los resaltados antes de exportar a PDF.
- Confirmar origen y licencia de las 8 fotos de `web/img/` y de los audios de `samples/` (ver `samples/README.md`).
- Probar el micrófono real de la app con auriculares.
