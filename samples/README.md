# Samples de prueba para la demo web

Audios para cargar en **05 sample** de la app (`web/`). La app los pasa a mono, los lleva al valor eficaz
del tránsito (0,36 Pa), los pasa por la almohadilla pasiva (pasabajos de 1 kHz) y los repite en loop.

Estos archivos no se publican en GitHub Pages: hay que descargarlos y elegirlos desde la app.

## Archivos

| Categoría | Archivo | Qué es | Duración | Cancela (bien puesto / flojo) |
|---|---|---|---|---|
| calle | `calle/marcha-del-orgullo-plaza-libertad.mp3` | Multitud en la Marcha del Orgullo 2025, Plaza Libertad | 60 s (recorte) | 23,5 / 21,6 dB |
| calle | `calle/sirena.mp3` | Sirena en la ciudad | 51 s | 18,0 / 17,2 dB |
| transporte | `transporte/subte-linea-d.mp3` | Subte de Buenos Aires, línea D | 60 s (recorte) | 25,1 / 22,0 dB |
| efectos | `efectos/braam-grave.mp3` | Efecto de sonido "braam" que baja a graves profundos | 43 s | 26,0 / 22,6 dB |

**Cancela** es la atenuación medida con el motor de la app (`web/motor.js`), con Kp = 300, sobre los primeros
30 s de cada archivo (13/11/2026). Igual que con los ruidos de la app, cuanto más grave es el sonido, mejor
lo cancela el lazo. La sirena, que es aguda (cientos de Hz a más de 1 kHz), no llega a la meta de 20 dB.

## Origen

| Archivo | Archivo original | Origen y licencia |
|---|---|---|
| `calle/marcha-del-orgullo-plaza-libertad.mp3` | `psr-dia-del-orgullo-2025-plaza-libertad.mp3` (5 min 28 s; recorte de 1:49 a 2:49) | Uso autorizado por el equipo; origen a completar |
| `transporte/subte-linea-d.mp3` | `esa-caba-subte-linea-d-2.mp3` (9 min 53 s; recorte de 2:42 a 3:42) | Uso autorizado por el equipo; origen a completar |
| `calle/sirena.mp3` | `freesound_community-city-siren-63106.mp3` | Por el formato del nombre, de Pixabay (licencia de contenido de Pixabay, uso libre); confirmar |
| `efectos/braam-grave.mp3` | `fronbondi_skegs-sfx-braam-subdown-with-intense-drop-sound-effects-162383.mp3` | Por el formato del nombre, de Pixabay (licencia de contenido de Pixabay, uso libre); confirmar |

Los recortes son el minuto con más sonido sostenido de cada grabación, con 20 ms de fundido en los bordes
para que el loop no haga clic, en MP3 de 128 kbit/s.
