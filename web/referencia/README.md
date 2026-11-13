# Referencia de diseño: "borrar el ruido"

Prototipo navegable y pantallas hechos con la herramienta de diseño de Claude
(artefacto "Demo ANC — borrar el ruido", 13/11/2026). Son la referencia visual y de
interacción para la app web de la carpeta `web/`.

**Estos archivos no corren fuera de la herramienta de diseño.** Usan un formato propio
(`<x-dc>`, `{{...}}`, `<sc-if>`, `<sc-for>`) y cargan un `support.js` que no está acá. Hay que
leerlos como especificación: de ahí salen colores, tipografías, trazos SVG, posiciones,
estados, duraciones de animación y teclado. La app se reconstruye en HTML, CSS y JavaScript
comunes.

## Archivos

| Archivo | Qué es |
|---|---|
| `Prototipo.dc.html` | Prototipo navegable completo, con la lógica de interacción simulada (clase con `keyDown`, `toggleCancel`, `toggleLoose`, `squeezeStart`/`squeezeEnd`, `pick`, audio simulado). **Es la referencia principal.** |
| `Sistema.dc.html` | Sistema de diseño: color, letra, ondas, la línea, controles, movimiento y teclado. |
| `Main.dc.html` | Cancelando: "casi silencio". |
| `PulsoC.dc.html` | Cancelar, último cuadro del pulso escucha → responde. |
| `Colectivo.dc.html` | Ruido grave y lento. |
| `Bocina.dc.html` | "un golpe". |
| `Flojo.dc.html` | Auricular flojo: la línea se abre. |
| `Tensa.dc.html` | Mantener apretado: la línea se tensa antes de silbar. |
| `Silba.dc.html` | El silbido. |
| `Calma.dc.html` | Soltar: vuelta a la calma. |
| `Ayuda.dc.html` | "?" abierto. |

Las pantallas de inicio, reposo, los dos primeros cuadros del pulso y las tres del micrófono
(permiso, denegado y auriculares) no se copiaron como archivo aparte: sus estados están en
`Prototipo.dc.html`.

## Datos que conviene saber

- **Paleta:** la elegida es la del tema `t0` del prototipo: papel `#F2E3C8`, oliva `#55603A`
  (afuera, el ruido), carbón `#2B2618`, suave `#6A5E45`, rosa `#C0647A` (anti-ruido),
  ladrillo `#9E3B2C` (silba / bajo la meta), relleno `#E8D5B3`. La tecla T del prototipo rota
  entre 6 paletas de prueba: en la app final queda solo `t0`.
- **Tipografías:** Marcellus (títulos y número) e Inter (frases y etiquetas), de Google Fonts.
- **Textura de papel:** el prototipo usa una imagen interna de la herramienta
  (`/_blob/104f0a61...`). Está extraída en `grano.png` (320 × 320, gris con transparencia).
  Se usa igual que en el prototipo: una capa encima de todo el lienzo (crema y oliva), sin
  capturar clics:
  `.grano{background-image:url(grano.png);background-size:320px 320px;background-repeat:repeat;opacity:0.55;pointer-events:none}`.
  Salió de la exportación del diseño del 12/11; es la única imagen interna que usan todas las
  pantallas, con el mismo tamaño y la misma clase.
- **Lienzo:** diseñado a 1920 × 1080. Se proyecta: escalar manteniendo la proporción.
- **Teclado del prototipo:** 1 a 4 ruidos, espacio = cancelar, F = aflojar/apretar,
  mantener G = apretar de más, ? = ayuda, Esc = cerrar. (5 y T son de prueba.)
- **Números:** los dB y las ondas del prototipo son de relleno. En la app salen de la
  simulación.
