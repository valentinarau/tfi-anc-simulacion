// Favicon: el botón cancelar encendido (punto color papel sobre rosa) con forma de gota de tinta.
// Cambia con la paleta: la app lo llama al tocar [tema] y la página de información al cargar.
// favicon.svg es la misma figura en t0, para cuando no corre JavaScript.

// rosa y papel de cada paleta (los mismos de estilo.css / info.css)
const COLORES = [
  ['#C0647A', '#F2E3C8'], ['#9E4A5E', '#F3DED8'], ['#A84F66', '#F4DFDB'],
  ['#B0613F', '#F4EEDF'], ['#2F4FBF', '#EEEBE4'], ['#B0654A', '#F3EEE2'],
];
const GOTA = 'M58.5,33.0 C58.8,34.5 58.5,36.3 58.0,37.8 C57.5,39.3 56.3,40.6 55.6,42.0 C54.8,43.3 54.3,44.7 53.5,46.0 C52.7,47.3 52.0,48.7 51.0,49.7 C49.9,50.8 48.6,51.6 47.3,52.5 C46.1,53.3 44.8,54.0 43.5,54.7 C42.2,55.4 40.9,56.1 39.6,56.5 C38.2,56.9 36.7,57.0 35.3,57.1 C33.8,57.3 32.4,57.4 31.0,57.5 C29.6,57.5 28.1,57.8 26.7,57.5 C25.3,57.3 23.9,56.6 22.6,56.1 C21.3,55.6 20.1,54.8 18.7,54.4 C17.2,53.9 15.5,53.8 14.0,53.3 C12.5,52.7 10.7,52.0 9.6,51.0 C8.4,49.9 7.5,48.4 6.9,46.9 C6.2,45.5 5.8,43.8 5.7,42.2 C5.6,40.6 5.9,38.9 6.2,37.4 C6.5,35.8 7.3,34.4 7.5,33.0 C7.8,31.6 7.8,30.3 7.8,28.9 C7.8,27.5 7.4,25.9 7.7,24.5 C7.9,23.1 8.6,21.7 9.3,20.5 C10.0,19.2 11.0,18.1 11.9,17.0 C12.8,15.8 13.5,14.5 14.5,13.4 C15.6,12.3 16.8,11.3 18.0,10.5 C19.3,9.7 20.7,9.2 22.1,8.6 C23.5,8.0 24.9,7.2 26.4,6.9 C27.9,6.5 29.5,6.4 31.0,6.5 C32.5,6.5 34.0,7.0 35.5,7.3 C37.0,7.6 38.6,7.7 40.0,8.2 C41.5,8.7 43.0,9.2 44.2,10.2 C45.3,11.2 46.0,12.9 46.8,14.2 C47.5,15.5 47.9,17.0 48.6,18.2 C49.3,19.4 50.2,20.3 51.0,21.4 C51.9,22.5 52.7,23.6 53.6,24.8 C54.5,25.9 55.6,27.1 56.4,28.5 C57.2,29.9 58.3,31.5 58.5,33.0Z';

export function aplicarFavicon(tema) {
  const [rosa, papel] = COLORES[tema] || COLORES[0];
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
    + '<path d="' + GOTA + '" fill="' + rosa + '"/>'
    + '<circle cx="56.5" cy="9.5" r="3.6" fill="' + rosa + '"/>'
    + '<circle cx="31" cy="33" r="6.4" fill="' + papel + '"/></svg>';
  let link = document.querySelector('link[rel="icon"]');
  if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
  link.type = 'image/svg+xml';
  link.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', papel);
}
