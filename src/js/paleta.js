/* ---------- paleta para lo que se dibuja desde JavaScript ----------
   Las gráficas SVG y las leyendas no pueden leer las variables de styles.css
   en sus atributos, así que los colores viven aquí con los mismos valores.
   Si cambias un color, cámbialo en los dos lugares. */
const PAL = {
  lima:'#C8F542',      // marca, ingresos, lo que va bien
  rosa:'#FF5C8A',      // gastos y lo que se pasa del límite
  lavanda:'#8FA2FF',   // transferencias y ahorro
  ambar:'#FFB443',     // avisos y ajustes
  agua:'#3FBF8F',
  coral:'#FF8A5C',
  gris:'#9AA0A8',
  tinta:'#F2F4F5',     // texto
  superficie:'#181B20', // fondo de tarjeta (borde de puntos en las gráficas)
  velo: a => 'rgba(255,255,255,' + a + ')' // líneas de rejilla y referencias tenues
};
/* orden fijo para series, cuentas y categorías: lima primero, gris al final */
const SERIE = [PAL.lima, PAL.lavanda, PAL.rosa, PAL.agua, PAL.ambar, PAL.coral, PAL.gris];
const serieColor = i => SERIE[i % SERIE.length];

/* tipos de movimiento: nombre, títulos del registro y flecha (como Retirar, Recargar e Intercambiar) */
const TIPOS = {
  gasto:{ nombre:'Gasto', corto:'Gasto', nuevo:'Nuevo gasto', editar:'Editar gasto', signo:'−', icono:'<path d="M12 19V5M6 11l6-6 6 6"/>' },
  ingreso:{ nombre:'Ingreso', corto:'Ingreso', nuevo:'Nuevo ingreso', editar:'Editar ingreso', signo:'+', icono:'<path d="M12 5v14M6 13l6 6 6-6"/>' },
  transferencia:{ nombre:'Transferencia', corto:'Transferir', nuevo:'Nueva transferencia', editar:'Editar transferencia', signo:'', icono:'<path d="M4 8h14l-4-4M20 16H6l4 4"/>' },
  ajuste:{ nombre:'Ajuste', corto:'Ajuste', nuevo:'Nuevo ajuste', editar:'Editar ajuste', signo:'±', icono:'<path d="M5 12h14M12 5v14"/>' }
};
const tipoIcono = (k, s) => '<svg width="' + (s || 18) + '" height="' + (s || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + TIPOS[k].icono + '</svg>';
