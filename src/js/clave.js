/* Clave de acceso: 4 dígitos, la misma en todos los dispositivos.
   En la nube solo vive su huella (settings.pin = { salt, hash, iter }, PBKDF2-SHA256), nunca la clave.
   Se pide siempre al abrir Caudal, en el navegador y en la app instalada. Al pasar a otra app y volver
   no se pide, salvo que en ese dispositivo se elija un tiempo máximo fuera (Ajustes › Seguridad).
   Tras varios intentos fallidos hay que esperar, y si se olvida se recupera con la contraseña de la cuenta. */
const PIN_ITER = 150000;
const PIN_TIEMPOS = [[-1, 'Solo al cerrar'], [0, 'Apenas salgas'], [60, 'Tras 1 minuto fuera'], [300, 'Tras 5 minutos fuera'], [900, 'Tras 15 minutos fuera'], [3600, 'Tras 1 hora fuera']];
/* abierto: la app está a la vista. modo: abrir (bloqueo), actual (confirmar antes de cambiar o quitar), nueva, confirmar u olvido */
const PIN = { abierto:true, modo:null, luego:null, dig:'', nueva:'', msg:'', fuera:0, ocupado:false, reloj:null };

/* ----- huella de la clave ----- */
const b64 = u8 => btoa(String.fromCharCode.apply(null, u8));
const deB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function pinHuella(clave, salt, iter){
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave), 'PBKDF2', false, ['deriveBits']);
  return b64(new Uint8Array(await crypto.subtle.deriveBits({ name:'PBKDF2', hash:'SHA-256', salt:deB64(salt), iterations:iter }, k, 256)));
}
async function pinCrear(clave){ const salt = b64(crypto.getRandomValues(new Uint8Array(16))); return { salt, iter:PIN_ITER, hash:await pinHuella(clave, salt, PIN_ITER) }; }
async function pinValida(clave){ const p = S.settings.pin; return !!p && await pinHuella(clave, p.salt, p.iter) === p.hash; }

/* ----- preferencias de este dispositivo ----- */
const pinTiempo = () => { const v = lsGet('pintiempo'); return v === '' ? -1 : +v; };
const pinTiempoTxt = () => (PIN_TIEMPOS.find(x => x[0] === pinTiempo()) || PIN_TIEMPOS[0])[1].toLowerCase();
/* intentos fallidos: "n:hasta" (hasta = momento en que se puede volver a intentar) */
const pinFallos = () => { const [n, h] = lsGet('pinfallos').split(':'); return { n:+n || 0, hasta:+h || 0 }; };
const pinEspera = () => Math.max(0, Math.ceil((pinFallos().hasta - Date.now()) / 1000));

/* ----- pantalla ----- */
const PIN_TXT = {
  abrir:    ['Escribe tu clave', () => 'Hola, ' + userName()],
  actual:   ['Tu clave actual', () => 'Confírmala para seguir.'],
  nueva:    ['Crea tu clave', () => '4 dígitos. Será la misma en el celular y en el computador.'],
  confirmar:['Repítela', () => 'Escribe de nuevo la misma clave.'],
  olvido:   ['Recupera tu clave', () => 'Escribe la contraseña de tu cuenta ' + (session ? session.user.email : '') + '.'],
};
const PIN_BORRAR = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 5H9l-6 7 6 7h12z"/><path d="M17 9l-6 6M11 9l6 6"/></svg>';
function pinPintar(mal){
  let el = document.getElementById('pin');
  if (!el) { el = document.createElement('div'); el.id = 'pin'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); document.body.appendChild(el); }
  document.documentElement.classList.add('pinon');
  const m = PIN.modo, [titulo, sub] = PIN_TXT[m], espera = m === 'abrir' || m === 'actual' ? pinEspera() : 0;
  const msg = espera ? 'Demasiados intentos. Espera ' + (espera > 59 ? Math.ceil(espera / 60) + ' min' : espera + ' s') + '.' : PIN.msg;
  /* abajo a la izquierda: recuperar la clave al abrir, cancelar en los demás casos */
  const izq = m === 'abrir' ? (sb && session ? '<button class="txt" data-pk="olvido">¿La olvidaste?</button>' : '<span></span>') : '<button class="txt" data-pk="cancelar">Cancelar</button>';
  const abajo = m === 'olvido'
    ? '<form class="form pin-olv" id="pin-olv" novalidate><input class="inp" id="pin-pass" type="password" autocomplete="current-password" placeholder="Contraseña" aria-label="Contraseña de tu cuenta">' +
      '<button class="btn block" type="submit">Recuperar</button><button class="tool" type="button" data-pk="volver" style="align-self:center;border:0">Volver</button></form>'
    : '<div class="pin-dots' + (mal ? ' mal' : '') + '" aria-label="' + PIN.dig.length + ' de 4 dígitos">' + [0, 1, 2, 3].map(i => '<i' + (i < PIN.dig.length ? ' class="on"' : '') + '></i>').join('') + '</div>' +
      '<div class="pin-msg" role="alert">' + esc(msg) + '</div>' +
      '<div class="pin-kb">' + [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => '<button data-pk="' + n + '"' + (espera || PIN.ocupado ? ' disabled' : '') + '>' + n + '</button>').join('') +
      izq + '<button data-pk="0"' + (espera || PIN.ocupado ? ' disabled' : '') + '>0</button><button class="txt" data-pk="del" aria-label="Borrar">' + PIN_BORRAR + '</button></div>';
  el.innerHTML = '<div class="pin-in"><div class="brand" style="justify-content:center">' + $('.top .mark').outerHTML + 'Caudal</div>' +
    '<h1>' + titulo + '</h1><p class="insight">' + esc(sub()) + '</p>' + (m === 'olvido' ? '<div class="pin-msg" role="alert">' + esc(PIN.msg) + '</div>' : '') + abajo + '</div>';
  /* mientras dura la espera, la cuenta regresiva se actualiza sola */
  clearInterval(PIN.reloj); if (espera) PIN.reloj = setInterval(() => { if (!pinEspera()) { clearInterval(PIN.reloj); PIN.msg = ''; } pinPintar(); }, 1000);
}
function pinMostrar(modo, luego){ PIN.modo = modo; PIN.luego = luego || null; PIN.dig = ''; PIN.nueva = ''; PIN.msg = ''; pinPintar(); }
function pinCerrar(){
  clearInterval(PIN.reloj); PIN.modo = null; PIN.dig = ''; PIN.nueva = ''; PIN.msg = '';
  const el = document.getElementById('pin'); if (el) el.remove();
  document.documentElement.classList.remove('pinon');
}
function pinBloquear(){ if (!S.settings.pin) return; PIN.abierto = false; pinMostrar('abrir'); }
function pinAbrirApp(){ PIN.abierto = true; lsSet('pinfallos', ''); pinCerrar(); }

/* ----- teclado ----- */
async function pinTecla(k){
  if (PIN.ocupado) return;
  if (k === 'del') { PIN.dig = PIN.dig.slice(0, -1); PIN.msg = ''; return pinPintar(); }
  if (PIN.dig.length >= 4 || ((PIN.modo === 'abrir' || PIN.modo === 'actual') && pinEspera())) return;
  PIN.dig += k; PIN.msg = ''; pinPintar();
  if (PIN.dig.length < 4) return;
  const d = PIN.dig, m = PIN.modo;
  if (m === 'nueva') { PIN.nueva = d; PIN.dig = ''; PIN.modo = 'confirmar'; return setTimeout(pinPintar, 150); }
  if (m === 'confirmar') {
    if (d !== PIN.nueva) { PIN.modo = 'nueva'; PIN.dig = ''; PIN.nueva = ''; PIN.msg = 'No coinciden. Créala de nuevo.'; return pinPintar(true); }
    PIN.ocupado = true; S.settings.pin = await pinCrear(d); PIN.ocupado = false; save();
    PIN.abierto = true; pinCerrar(); SETIDX = null; render(); return toast('Clave guardada');
  }
  /* abrir o confirmar la actual. Si la clave se quitó desde otro dispositivo, no hay nada que comprobar */
  if (!S.settings.pin) return m === 'abrir' ? pinAbrirApp() : pinCerrar();
  PIN.ocupado = true; const ok = await pinValida(d); PIN.ocupado = false;
  if (ok) {
    lsSet('pinfallos', '');
    if (m === 'abrir') return pinAbrirApp();
    if (PIN.luego === 'cambiar') return pinMostrar('nueva');
    if (PIN.luego === 'quitar') { S.settings.pin = null; save(); pinCerrar(); SETIDX = null; render(); return toast('Quitaste la clave'); }
  }
  /* fallo: a partir del quinto, espera de 30 s que se duplica en cada intento, hasta 15 minutos */
  const f = pinFallos(); f.n++;
  const hasta = f.n >= 5 ? Date.now() + Math.min(900, 30 * 2 ** (f.n - 5)) * 1000 : 0;
  lsSet('pinfallos', f.n + ':' + hasta);
  if (navigator.vibrate) navigator.vibrate(120);
  PIN.dig = ''; PIN.msg = f.n >= 5 ? '' : 'Clave incorrecta' + (f.n >= 3 ? '. Te quedan ' + (5 - f.n) + ' intentos antes de esperar.' : '.');
  pinPintar(true);
}
/* recuperar: se confirma la contraseña de la cuenta sin cerrar la sesión, se borra la clave y se crea otra */
async function pinRecuperar(){
  const pass = $('#pin-pass').value; if (!pass || !session) return;
  PIN.msg = 'Comprobando…'; pinPintar(); $('#pin-pass').value = pass;
  const r = await sb.auth.signInWithPassword({ email:session.user.email, password:pass });
  if (r.error) { PIN.msg = /invalid/i.test(r.error.message) ? 'Esa contraseña no es la de tu cuenta.' : r.error.message; return pinPintar(); }
  S.settings.pin = null; save(); lsSet('pinfallos', ''); PIN.abierto = true;
  pinMostrar('nueva'); PIN.msg = 'Listo. Crea tu nueva clave o cancela para seguir sin clave.'; pinPintar();
}

/* ----- Ajustes › Seguridad ----- */
function claveCard(){
  const on = !!S.settings.pin, t = pinTiempo();
  return '<section class="card"><div class="card-h"><h2>Clave de acceso</h2></div><div>' +
    '<div class="set" style="border-top:0"><div class="t"><b>' + (on ? 'Clave activa' : 'Pedir una clave al abrir') + '</b><span>' + (on ? 'Es la misma en todos tus dispositivos y se pide cada vez que abres Caudal.' : '4 dígitos, la misma en el celular y en el computador.') + '</span></div>' +
    '<button class="btn sm' + (on ? ' ghost' : '') + '" data-pinacc="' + (on ? 'cambiar' : 'crear') + '">' + (on ? 'Cambiar' : 'Crear') + '</button></div>' +
    (on ? '<div class="set"><div class="t"><b>Pedirla otra vez</b><span>Al volver de otra app, en este dispositivo.</span></div><select id="pintiempo" aria-label="Pedir la clave otra vez">' +
        PIN_TIEMPOS.map(([v, txt]) => '<option value="' + v + '"' + (v === t ? ' selected' : '') + '>' + txt + '</option>').join('') + '</select></div>' +
      '<div class="set"><div class="t"><b>Bloquear ahora</b><span>Tapa Caudal hasta que escribas la clave.</span></div><button class="btn sm ghost" data-pinacc="bloquear">Bloquear</button></div>' +
      '<div class="set"><div class="t"><b>Quitar la clave</b><span>Caudal vuelve a abrir sin pedir nada en ningún dispositivo.</span></div><button class="btn sm ghost" data-pinacc="quitar">Quitar</button></div>' : '') +
    '</div></section><p class="note">La clave tapa tus datos a quien tome tu celular o tu computador. Si la olvidas, la recuperas con la contraseña de tu cuenta.</p>';
}

/* ----- eventos ----- */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-pk],[data-pinacc]'); if (!b || b.disabled) return;
  const k = b.dataset.pk, a = b.dataset.pinacc;
  if (k === 'cancelar') return pinCerrar();
  if (k === 'olvido') return pinMostrar('olvido');
  if (k === 'volver') return pinMostrar('abrir');
  if (k) return pinTecla(k);
  if (a === 'crear') return pinMostrar('nueva');
  if (a === 'cambiar' || a === 'quitar') return pinMostrar('actual', a);
  if (a === 'bloquear') return pinBloquear();
});
document.addEventListener('change', e => { if (e.target.id === 'pintiempo') { lsSet('pintiempo', e.target.value); SETIDX = null; toast('Listo: ' + pinTiempoTxt()); } });
document.addEventListener('submit', e => { if (e.target.id === 'pin-olv') { e.preventDefault(); e.stopImmediatePropagation(); pinRecuperar(); } }, true);
/* con la pantalla de la clave a la vista, el teclado del computador solo escribe en ella (ningún atajo de la app) */
window.addEventListener('keydown', e => {
  if (!document.getElementById('pin')) return;
  e.stopImmediatePropagation();
  if (e.target.id === 'pin-pass' || e.metaKey || e.ctrlKey || e.altKey) return;
  if (/^\d$/.test(e.key)) { e.preventDefault(); pinTecla(e.key); }
  else if (e.key === 'Backspace') { e.preventDefault(); pinTecla('del'); }
  else if (e.key === 'Escape' && PIN.modo !== 'abrir') pinCerrar();
}, true);
/* al salir de Caudal se anota la hora; al volver se pide la clave si se pasó el tiempo elegido.
   Con "Apenas salgas" se tapa al salir, así la vista previa del cambio de apps tampoco muestra los datos. */
document.addEventListener('visibilitychange', () => {
  if (!S.settings.pin) return;
  const t = pinTiempo();
  if (document.hidden) { PIN.fuera = Date.now(); if (t === 0 && PIN.abierto) pinBloquear(); }
  else if (PIN.abierto && t > 0 && PIN.fuera && Date.now() - PIN.fuera >= t * 1000) pinBloquear();
});
/* al abrir: siempre se pide. La única excepción es la recarga automática por versión nueva (checkVersion),
   que deja un pase de un solo uso si la app ya estaba abierta */
(() => {
  let pase = 0; try { pase = +sessionStorage.getItem('caudal.pinpase') || 0; sessionStorage.removeItem('caudal.pinpase'); } catch (_) {}
  if (Date.now() - pase > 30000) pinBloquear();
})();
