# Página de información ("cómo se borra el ruido"): especificación para construirla

Referencia visual y de interacción: `Info.dc.html` (de la herramienta de diseño, 13/11/2026).
Igual que el resto de esta carpeta, **no corre fuera de la herramienta**: hay que leerlo como
especificación y reconstruirlo en HTML, CSS y JavaScript comunes dentro de `web/`
(por ejemplo `web/info.html`, con su propio CSS y JS o compartiendo `estilo.css`).

En esta copia las imágenes ya apuntan a archivos del repo (`img/…` y `grano.png`) en lugar de
las direcciones internas de la herramienta (`/_blob/…`).

También se actualizó `Prototipo.dc.html` con dos cambios que la app todavía no tiene (ver al final).

---

## 1. Qué es

Una página aparte, de lectura vertical, que explica lo que se ve en la app. Se llega desde el
"?" de la app (enlace "[info] →") y desde ahí se vuelve con "← App" o tocando "Borrar el ruido".
Estética tomada de kaiseisadatoki-v4.vercel.app/about: tipografía grande, mucho aire,
fotos, revelado suave al scrollear.

## 2. Tokens

- **Paletas:** las mismas 6 clases `.t0` a `.t5` del prototipo (variables `--papel`, `--oliva`,
  `--carbon`, `--suave`, `--rosa`, `--ladrillo`, `--relleno`). En el diseño la página arranca en
  **`t1` (A · cacao y rosa)**. Conviene que use la misma paleta que la app tenga activa.
- **Textura:** `grano.png`, capa absoluta detrás de todo, `background-size:320px 320px; opacity:.55; pointer-events:none`.
- **Tipografías:** Marcellus (títulos, números grandes, GRACIAS), Inter 500 (todo lo demás).
- **Márgenes laterales:** `padding: 0 clamp(16px, 2.27px + 3.661vw, 96px)`. El contenido ocupa todo el ancho (sin `max-width` de página).
- **Escala de texto:**

| Clase | Uso | Tamaño |
|---|---|---|
| `t7xl` | "silencio" del inicio (tenue) | `clamp(4rem, 2.5915rem + 6.0094vw, 8rem)`, color `--relleno` |
| `t6xl` | Título "Cómo se / borra / el ruido" | `clamp(3.5rem, 2.7277rem + 3.2952vw, 8rem)`, mayúsculas, interlínea .95 |
| `t5xl` | "Cómo funciona" | `clamp(2.75rem, 2rem + 2.6vw, 6rem)`, mayúsculas |
| `t5xl.low` | Títulos en minúscula ("qué ves", "el calce", "el micrófono") | `clamp(2rem, 1.8239rem + .7512vw, 2.5rem)`, sin mayúsculas, interlínea 1.2, margen inferior `clamp(40px, 4vw, 64px)` |
| `bn-n` | 76 y 20 | Marcellus `clamp(5rem, 2rem + 9vw, 16rem)`, interlínea .8, con "dB" en Inter `clamp(1.25rem, 1rem + .6vw, 1.75rem)` al lado |
| `tmid` | 300 / 447 / 528 | Marcellus `clamp(2.75rem, 1rem + 5.6vw, 7.5rem)`, interlínea .85, siempre en una fila |
| `t3xl` | "Cancelar", "Almohadilla" | Inter 600 `clamp(1.75rem, 1.6rem + .6vw, 2.25rem)` |
| `tlg` | Bajadas | `clamp(.95rem, .85rem + .35vw, 1.2rem)` |
| `tbase` / `tsm` | Cuerpo y etiquetas `[así]` | **14 px** |

- **Etiquetas:** siempre entre corchetes, `[OMS]`, `[flojo, silba]`.
- **Enlaces con corchetes:** los corchetes están ocultos y aparecen al pasar el mouse (`opacity` .3 s). Se usan en el menú, "← App" y "↑ Volver arriba".
- **Enlaces del pie:** sin corchetes; al pasar el mouse bajan a `opacity: .5`.
- **Sin recuadro de foco con el mouse:** `:focus { outline: none }` y `:focus-visible { outline: 1px solid currentColor; outline-offset: 8px }`. Las líneas y botones interactivos llevan `user-select: none`.

## 3. Estructura, de arriba abajo

1. **Encabezado.** Izquierda: "BORRAR EL RUIDO" (Inter 600, mayúsculas), **lleva a la app**.
   Derecha: El ruido · Cómo funciona · El número · El silbido · ← App (este último lleva a la app).
2. **Inicio.** "silencio" grande y tenue, detrás del título, a la derecha. El título va en 3 líneas.
   Bajada: "Una nota sobre lo que ves en la app". A la derecha, abajo, "Scroll" con una animación en
   loop: el texto baja y entra otra copia desde arriba (2,6 s). Debajo, **una línea punteada de 1 px
   (`--oliva`) de borde a borde de la ventana**.
3. **El ruido** (sin título). Fila con la foto del Obelisco (cuadrada, `object-fit: cover`,
   `object-position: 62% 50%`) y a la derecha: `[Obelisco, de día]` centrado, el **76 dB** en
   ladrillo alineado a la derecha, y 4 ítems en dos columnas.
4. **qué ves.** Tres columnas, cada una con una onda dibujada (oliva gruesa = afuera; carbón fina
   y chica = adentro; rosa punteada = anti-ruido), etiqueta y texto.
5. **Cómo funciona.** Bloque a todo el ancho con la foto `cruce-noche.jpg` de fondo, un velo
   `rgba(28,26,20,.6)` y texto en `--papel`. Izquierda: título y "Mide y corrige, todo el tiempo".
   Derecha, más abajo: "Cancelar" y "Almohadilla". La foto de fondo tiene un parallax suave (±6 %).
6. **El número** (sin título). Izquierda `[meta]` y **20 dB**; derecha, alineados abajo, los 2 ítems.
7. **el calce** (interactivo, ver 4.2).
8. **El silbido** (sin título, interactivo, ver 4.3). Izquierda: la onda y los números; derecha: 3 ítems.
9. **el micrófono.** Texto a la izquierda (2 ítems), foto a la derecha con alto `clamp(420px, 40vw, 600px)`.
10. **Pie** (alto mínimo de una pantalla). Arriba a la derecha, columnas `[Menú]` (las 4 secciones
    del encabezado), `[Proyecto]` (Código en GitHub ↗, a este repo, en pestaña nueva), `[Trabajo]`;
    debajo `[Simulación]`; y "↑ Volver arriba" alineado a la derecha. Abajo de todo, **GRACIAS** en
    Marcellus, centrado, `clamp(3rem, -0.4539rem + 14.7368vw, 23.125rem)`.

Espacio entre secciones: `padding-top: clamp(80px, 9vw, 140px)`.

## 4. Comportamiento

### 4.1 Scroll y animaciones

- **Scroll nativo.** No secuestrar la rueda (se probó un scroll con inercia tipo Lenis y quedó mal).
- **Revelado:** cada sección arranca con `opacity: 0; translateY(24px)` y entra una sola vez
  cuando el 15 % es visible (IntersectionObserver), transición .9 s. Las clases se ponen por DOM
  (`classList`), sin volver a dibujar toda la página. Si el usuario pide menos movimiento
  (`prefers-reduced-motion`), todo aparece directo.
- **GRACIAS:** las letras suben desde abajo (`translateY(105%)` → 0, 1,2 s, 70 ms de retraso entre
  letras). **Se repite cada vez que el pie vuelve a entrar en pantalla**: al salir se resetea sin transición.
- **Menú y "volver arriba":** desplazamiento suave a la **posición real** de la sección (sumando
  `offsetTop`, para no contar el `translateY` del revelado). **"Cómo funciona" queda centrada
  verticalmente** en la ventana si entra entera; si no, frena con el borde de arriba de la foto al tope.

### 4.2 El calce

Una sola línea vertical a mano (sin fondo), con "adentro" y "afuera" chiquitos a los costados
(SVG 480 × 240, ancho máx. 760 px). A la derecha dos botones, `[bien puesto]` y `[flojo]` (el activo
muestra los corchetes, el otro queda a 55 % de opacidad), y debajo el texto del estado elegido.

- **Cambiar:** tocando la línea, los botones, o con Enter / espacio con la línea enfocada.
- **La línea se transforma:** mezcla entre la forma recta (bien puesto) y una abombada hacia adentro
  (flojo, una campana de 24 px en el medio), con interpolación 0,08 por cuadro. En flojo aparecen
  tres trazos de aire a la izquierda (fundido .6 s).
- **El texto cambia con fundido:** los dos textos están superpuestos en la misma celda; el activo
  pasa a opacidad 1 y `translateY(0)` en .45 s, el otro se va.
- **Al pasar el mouse:** la línea se corre apenas hacia el cursor, en una campana centrada en la
  altura del cursor. Bien puesto: máx. 3 px (ganancia 0,05 del desvío horizontal, seguimiento 0,14
  por cuadro). Flojo: máx. 7 px (0,09; 0,08). **Sin resorte ni rebote.** Al salir vuelve a 0.

### 4.3 El silbido

Una onda **horizontal y quieta** (SVG 520 × 140, ancho máx. 520 px) arriba de los números 300 / 447 / 528.
Los tres números son botones; el elegido queda entero y los otros a 45 % de opacidad. Arranca en 447.

| Elegido | Forma de la onda | Color |
|---|---|---|
| 300 | Ondulación chica y lenta (amplitud 7, 2,2 ciclos) | carbón |
| 447 | Oscilación rápida (11 ciclos, amplitud 34) que crece hacia la derecha | ladrillo |
| 528 | Igual, más alta y más densa (13 ciclos, amplitud 52) | ladrillo |

La amplitud crece hacia la derecha (envolvente 0,35 → 1) y se aplasta contra un tope suave con
`58·tanh(y/58)`. Al cambiar de número la onda se transforma en menos de un segundo y queda fija:
**no se anima en el tiempo**.

### 4.4 Foto del micrófono

Una por paleta: t0 vereda, t1 sillón, t2 rojo, t3 blanca, t4 bn, t5 colgando. En la herramienta había
además un selector para forzar cualquiera; en la app alcanza con seguir la paleta.

## 5. Textos

Todos están en el objeto `const t = {...}` dentro de `renderVals()` de `Info.dc.html` (ruido, ves,
funciona, numero, calce, silbido, mic, trabajo, simulacion, repo). Copiarlos tal cual.

Dos cosas para revisar al construirla:

- **Límites del silbido:** la página dice 447 / 528 (la fórmula del informe). La app en `web/` oscila
  desde 441 / 521 (ver CLAUDE.md, Euler suma medio paso de retardo). Hay que decidir si la página
  dice los de la fórmula o los de la app, para que no se contradigan con lo que muestra la app.
- **`[Simulación]`** dice "La app corre el mismo modelo que el simulador del trabajo." Hoy es cierto
  (`motor.js` es la traducción de `LazoANC.paso`, verificada con `node web/test/comparar.js`).

## 6. Imágenes (`img/`)

| Archivo | Dónde va |
|---|---|
| `obelisco.jpg` | Sección "El ruido" |
| `cruce-noche.jpg` | Fondo de "Cómo funciona" |
| `mic-vereda.jpg`, `mic-sillon.jpg`, `mic-rojo.jpg`, `mic-blanca.jpg`, `mic-bn.jpg`, `mic-colgando.jpg` | Foto del micrófono, una por paleta (4.4) |

Las fotos se buscaron en sitios de fotos libres durante el diseño. **Antes de publicar, confirmar
el origen y la licencia de cada una** (no quedó registrado en el diseño).

Datos del ruido: 76,18 dB de día en Corrientes y 9 de Julio (Universidad de Palermo y CESBA, 2017);
Ley 1540 de CABA: 70 dB de día en zonas comerciales; OMS: 53 dB Lden para tránsito.

## 7. Cambios del prototipo que la app todavía no tiene

`Prototipo.dc.html` se actualizó con:

1. **Indicador de ganancia** mientras se mantiene apretada la línea: "ganancia 300 → N" en
   IBM Plex Mono 20 px, con una barrita de 230 px, un punto que marca N y una marca vertical en el
   límite (447 flojo / 528 puesto, con el número abajo). Se pone ladrillo al pasar el límite.
   La herramienta tenía tres posiciones a elegir (prop `ganancia`): **"junto a la línea"**
   (la que quedó por defecto), "bajo la frase" y "sobre el número".
2. **"?" simplificado** con un enlace **"[info] →"** a esta página (reemplaza la frase
   "si queda flojo, se confunde y silba").
