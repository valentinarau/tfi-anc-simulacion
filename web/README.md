# borrar el ruido: demo web del lazo ANC

Demo interactiva para mostrarle a cualquier persona cómo un auricular cancela el ruido. Corre en el
navegador, sin instalar nada. Está hecha en HTML, CSS y JavaScript comunes (sin frameworks ni build).

Lo que se oye, las ondas y los dB salen de **la misma simulación que `simulacion_anc.py`**: el lazo de
`LazoANC.paso` traducido a JavaScript (`motor.js`), que corre dentro de un AudioWorklet a 48 kHz, con
~21 pasos de 1 µs por muestra de audio. La verificación está en `test/` y en `evidencia/07_app_web/`.

## Cómo se usa

| Gesto | Tecla | Qué pasa en el modelo |
|---|---|---|
| Tocar un ruido | 1 tránsito, 2 bocina, 3 colectivo, 4 micrófono | Cambia la perturbación d (afuera, en oliva, siempre sin modificar) |
| Tocar el ruido que ya suena | la misma tecla | Lo apaga: silencio, sin cancelar |
| Tocar **05 sample** | — | Elegir un archivo de audio propio: suena en loop como ruido de afuera (llevado al valor eficaz del tránsito, 0,36 Pa) y el lazo lo cancela |
| Tocar el título | — | Volver al principio: sin ruido, sin cancelar, auricular puesto |
| Tocar **[tema]** | — | Pasa por las 6 paletas del prototipo (t0 es la elegida) |
| Tocar **cancelar** | espacio | Enciende o apaga la rama de realimentación (u = Kp·e) |
| Tocar la línea | F | Afloja o aprieta el auricular: mal calce (K = 0,6; τ = 0,5 ms) o buen calce (K = 1; τ = 1 ms) |
| Mantener apretada la línea | mantener G | Kp sube desde 300 (73,5 por segundo); al soltar vuelve a 300. Silba cuando pasa el límite: ~447 flojo, ~528 puesto |
| ? | ? | Qué estoy viendo. Esc cierra |

Adentro del auricular se dibujan: en oliva fino, el ruido que entra por la vía pasiva (c sin ANC); en rosa
punteado, lo que agrega el auricular (c − c sin ANC); en carbón, lo que oís (c). El número es la
atenuación medida en la simulación: 20·log10 del valor eficaz sin ANC sobre el valor eficaz con ANC
(promedio de los últimos ~250 ms). Se pone color ladrillo por debajo de la meta de 20 dB.

**Con el micrófono, escuchar solo con auriculares**: con parlantes, el sonido vuelve a entrar al
micrófono y se acopla. La app pregunta antes y, si no hay auriculares, muestra las ondas sin sonido.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | La página (lienzo de 1920 × 1080 que se escala a la pantalla) |
| `estilo.css` | Paletas t0 a t5, textura de papel, disposición vertical para celular |
| `grano.png` | Textura de papel del prototipo |
| `app.js` | Interfaz: estados, teclado, gestos y dibujo de las ondas con los datos de la simulación |
| `procesador.js` | AudioWorklet: corre el lazo a la frecuencia del audio y le manda las señales a la interfaz |
| `motor.js` | El lazo (traducción de `LazoANC.paso`), los ruidos y la clase `Demo` |
| `test/comparar.js` | Verificación contra Python (ver abajo) |
| `test/referencia_python.py` | Genera `test/referencia_python.json` con `simulacion_anc.py` sin modificarlo |
| `referencia/` | Diseño de referencia (no ejecutable, ver su README) |

## Probarla en la compu

Hace falta un servidor (los navegadores no cargan un AudioWorklet desde `file://`). Desde la raíz del repo:

```bash
python3 -m http.server 8765 --directory web
```

y abrir http://localhost:8765. En `localhost` el navegador deja usar el micrófono sin HTTPS.

## Verificación

```bash
node web/test/comparar.js
```

Compara el motor JavaScript con el simulador en Python: atenuación de tránsito, bocina y colectivo con
buen y mal calce (Kp = 300), Kp máximo (528 y 447) y escalón de 0,5 Pa (0,0211 Pa). Tolerancia ±0,5 dB
y ±1 %. Si encuentra Python con numpy (`venv/bin/python`), primero regenera la referencia. Con
`--evidencia` además escribe `evidencia/07_app_web/README.md`. Termina con código 1 si algo no coincide.

## Publicarla con GitHub Pages

El repo ya tiene el workflow `.github/workflows/pages.yml`: en cada push a `main` que toque `web/`,
corre la verificación y, si pasa, publica la app.

Para activarlo (una sola vez):

1. En GitHub, ir a **Settings → Pages** del repositorio.
2. En **Build and deployment → Source**, elegir **GitHub Actions**.
3. Hacer un push a `main` que toque `web/` (o correr el workflow a mano desde **Actions → Publicar la
   demo web → Run workflow**).
4. La dirección queda en **Settings → Pages** y en el resumen del workflow
   (normalmente `https://<usuario>.github.io/<repositorio>/`).

**Ojo: la página queda pública aunque el repositorio sea privado.** Cualquiera con la dirección la puede
ver. Solo se publican los archivos de la app (`index.html`, `app.js`, `motor.js`, `procesador.js`,
`estilo.css`, `grano.png`); el resto del repo no. Además, GitHub Pages en un repositorio privado necesita un plan
pago (GitHub Pro, Team o Enterprise); con el plan gratuito, el repositorio tiene que ser público.

## Diferencias con el prototipo de diseño

- **Permiso del micrófono:** el prototipo dibuja un cartel que imita al del navegador. En la app
  aparece el cartel real del navegador (no se puede imitar uno que dé permiso de verdad), así que el
  cartel dibujado no está. El resto del flujo (dibujo del micrófono, bloqueado, auriculares) es el mismo.
- **Sin teclas 5 y T:** el sample y el tema están, pero solo con el mouse (las teclas eran de prueba).
- **Título:** tocarlo vuelve al principio (no estaba en el prototipo).
- **Ondas:** se dibujan como un osciloscopio (cada cuadro arranca en un cruce por cero del ruido) y la
  ventana se corre despacio, ~0,12 ventanas por segundo, como en el prototipo; así un ruido periódico
  como el colectivo no queda quieto.
- **Textura de papel:** `grano.png`, la imagen original del prototipo (copiada de `referencia/`), usada igual: 320 px, repetida, opacidad 0,55.
- **Celular parado:** el prototipo es solo horizontal (1920 × 1080). Con la pantalla vertical la app usa un lienzo de
  1080 × 1920 con la misma idea (adentro a la izquierda, afuera a la derecha, la línea en el medio): título en dos
  líneas arriba, ondas en el medio, número y ruidos abajo, cancelar sobre la línea y letra más grande.
- **Bordes:** la textura, el oliva y la línea siguen más allá del lienzo, así el margen que sobra cuando la pantalla
  tiene otra proporción no se nota.
- **Tiempos de "cancelar":** la animación es la del prototipo. El lazo se enciende cuando el pulso llega
  a la línea (0,3 s) y se apaga en el momento. Mientras el carbón "se achica" (0,8 s), la onda dibujada
  pasa de c sin ANC a c; el sonido ya es el del lazo.
- **Silbido:** no hay un tiempo fijo (el prototipo silbaba a los 2 s solo si estaba flojo). Silba cuando
  el modelo satura el parlante o amplifica en lugar de atenuar: flojo a los ~2,1 s (Kp ≈ 450), puesto a
  los ~3,2 s (Kp ≈ 530).
- **Bocina:** tránsito a la mitad y una bocina de 1 s cada 3 s (420 Hz y armónicos, subida de 5 ms como
  en Python), en lugar de la envolvente de 0,15 s del dibujo.
