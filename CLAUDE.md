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

## Vocabulario del profesor

- Proporcional por umbral: acción proporcional dentro de una banda delimitada por umbrales.
- Garantizar (fuerte, respaldado) ≠ asegurar (best effort). Lazo ANC local garantiza; lazo IoT asegura.
- Error (desvío admisible por la carga, banda ±) ≠ falla (desvío inadmisible, vulnera la calidad de servicio).
- Perturbación: transitoria, impulsiva, entra ++ en el punto suma. Interna = generada por los componentes
  (sensibilidad); intermedias y externas = del contexto.
- Scan = ciclo operativo. Un impulso que dura un scan se considera escalón.
- Error en estado estable ≠ tolerancia (desvío de fabricación del componente).
