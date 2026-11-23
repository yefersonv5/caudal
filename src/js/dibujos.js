/* ---------- dibujos de la marca ----------
   Ilustración en alambre al estilo cyber brutalista: una moneda vista de lado con líneas de barrido,
   píxeles lima que "fallan" y marcas de mira. Es solo decoración (aria-hidden); los colores
   salen de las clases .dib en styles.css, no de aquí. */
let dibN = 0; // cada dibujo necesita su propio recorte (clipPath) aunque haya varios en pantalla
function dibujoMoneda(cls){
  const id = 'dibc' + (++dibN), cx = 70, cy = 60;
  const ovalo = (x, rx, ry, c) => '<ellipse class="' + c + '" cx="' + x + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '"/>';
  let barrido = '', barras = '';
  for (let y = 22; y <= 98; y += 5) barrido += '<path d="M40 ' + y + 'H100"/>';
  /* código de barras a la izquierda: grosores fijos para que el dibujo sea siempre igual */
  [2, 1, 1, 3, 1, 2, 1, 1, 2].reduce((x, w) => { barras += '<rect x="' + x + '" y="40" width="' + w + '" height="40"/>'; return x + w + 2; }, 8);
  const pix = (c, r) => r.map(([x, y, w, h]) => '<rect class="' + c + '" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"/>').join('');
  const mira = (x, y) => '<path class="fa" d="M' + (x - 4) + ' ' + y + 'h8M' + x + ' ' + (y - 4) + 'v8"/>';
  return '<svg class="dib ' + (cls || '') + '" viewBox="0 0 140 120" aria-hidden="true">' +
    '<defs><clipPath id="' + id + '"><ellipse cx="' + cx + '" cy="' + cy + '" rx="30" ry="40"/></clipPath></defs>' +
    '<path class="br" d="M2 12V2h10M128 2h10v10M138 108v10h-10M12 118H2v-10"/>' +
    '<g class="bc">' + barras + '</g>' +
    ovalo(cx + 9, 30, 40, 'f') + '<path class="f" d="M' + cx + ' 20h9M' + cx + ' 100h9"/>' +
    '<g class="sc" clip-path="url(#' + id + ')">' + barrido + '</g>' +
    ovalo(cx, 30, 40, 'l') + ovalo(cx, 22, 31, 'l') +
    '<text class="t" x="' + cx + '" y="' + (cy + 9) + '" text-anchor="middle">$</text>' +
    '<g class="gl">' + pix('px', [[92, 20, 12, 7], [104, 27, 7, 7], [96, 36, 16, 4], [36, 80, 7, 7], [28, 87, 12, 4]]) + '</g>' +
    pix('pg', [[108, 44, 5, 5], [44, 26, 4, 4]]) + mira(122, 92) + mira(20, 16) + '</svg>';
}
