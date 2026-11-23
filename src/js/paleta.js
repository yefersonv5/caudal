/* ---------- paleta para lo que se dibuja desde JavaScript ----------
   Las gráficas SVG y las leyendas no pueden leer las variables de styles.css
   en sus atributos, así que los colores viven aquí con los mismos valores.
   Si cambias un color, cámbialo en los dos lugares. */
const PAL = {
  verde:'#30D158',     // ingresos, lo que llevas y lo que va bien (verde de iOS en modo oscuro)
  rosa:'#FF375F',      // gastos y lo que se pasa del límite
  lavanda:'#7D7AFF',   // transferencias y ahorro
  ambar:'#FF9F0A',     // avisos y ajustes
  agua:'#64D2FF',
  coral:'#FF6961',
  gris:'#8E8E93',
  tinta:'#FFFFFF',     // texto
  superficie:'#1C1C1E', // fondo de tarjeta (borde de puntos en las gráficas)
  velo: a => 'rgba(255,255,255,' + a + ')' // líneas de rejilla y referencias tenues
};
/* orden fijo para series, cuentas y categorías: verde primero, gris al final */
const SERIE = [PAL.verde, PAL.lavanda, PAL.rosa, PAL.agua, PAL.ambar, PAL.coral, PAL.gris];
const serieColor = i => SERIE[i % SERIE.length];

/* tipos de movimiento: nombre, títulos del registro y flecha (como Retirar, Recargar e Intercambiar) */
const TIPOS = {
  gasto:{ nombre:'Gasto', corto:'Gasto', nuevo:'Nuevo gasto', editar:'Editar gasto', signo:'−', icono:'<path d="M12 19V5M6 11l6-6 6 6"/>' },
  ingreso:{ nombre:'Ingreso', corto:'Ingreso', nuevo:'Nuevo ingreso', editar:'Editar ingreso', signo:'+', icono:'<path d="M12 5v14M6 13l6 6 6-6"/>' },
  transferencia:{ nombre:'Transferencia', corto:'Transferir', nuevo:'Nueva transferencia', editar:'Editar transferencia', signo:'', icono:'<path d="M4 8h14l-4-4M20 16H6l4 4"/>' },
  ajuste:{ nombre:'Ajuste', corto:'Ajuste', nuevo:'Nuevo ajuste', editar:'Editar ajuste', signo:'±', icono:'<path d="M5 12h14M12 5v14"/>' }
};
const tipoIcono = (k, s) => '<svg width="' + (s || 18) + '" height="' + (s || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + TIPOS[k].icono + '</svg>';
