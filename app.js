'use strict';

// ---------- Datos ----------

const CLAVE_MENU = 'dulcechurros.menu';
const CLAVE_VENTAS = 'dulcechurros.ventas';
const CLAVE_TASA = 'dulcechurros.tipoCambio';
const CLAVE_EXTRAS = 'dulcechurros.otros';
const CLAVE_CUENTAS = 'dulcechurros.cuentas';

const MAX_CUENTAS = 3;

const MENU_INICIAL = [
  { id: 'churros', nombre: 'Orden de Churros', precio: 100 },
  { id: 'churros-helado', nombre: 'Churros con Helado', precio: 120 },
  { id: 'malteada', nombre: 'Malteada', precio: 120 },
];

// Dibujos de cada producto (definidos en index.html). Se buscan por id, así funcionan
// aunque el menú guardado en el teléfono sea de una versión anterior.
const ICONOS = { churros: 'icono-churros', 'churros-helado': 'icono-churros-helado', malteada: 'icono-malteada' };
// Los artículos agregados en Ajustes (bolsas, etc.) usan una etiqueta.
const icono = (id) => {
  const simbolo = ICONOS[id] || (String(id).startsWith('extra-') ? 'icono-extra' : null);
  return simbolo
    ? `<svg class="icono" aria-hidden="true"><use href="#${simbolo}"/></svg>`
    : '<span class="sin-icono" aria-hidden="true">•</span>';
};

const BILLETES = { MXN: [20, 50, 100, 200, 500, 1000], USD: [1, 5, 10, 20, 50, 100] };

function leer(clave, porDefecto) {
  try {
    const valor = localStorage.getItem(clave);
    return valor ? JSON.parse(valor) : porDefecto;
  } catch {
    return porDefecto;
  }
}

function guardar(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
    return true;
  } catch {
    mostrarAviso('No se pudo guardar. Revisa el espacio del teléfono.', true);
    return false;
  }
}

let menu = leer(CLAVE_MENU, MENU_INICIAL);
let ventas = leer(CLAVE_VENTAS, []);
let tasa = leer(CLAVE_TASA, null); // { valor: pesos por 1 dólar, actualizado: fecha ISO }
let extras = leer(CLAVE_EXTRAS, []); // otros artículos: [{ id: 'extra-…', nombre, precio }]

// Cuentas abiertas (máximo 3). Se guardan en el teléfono para no perderlas si se cierra la app.
// Cada cuenta: { numero: 1..3, orden: { id de producto -> cantidad } }
let { cuentas, activa } = leer(CLAVE_CUENTAS, {});
cuentas = Array.isArray(cuentas)
  ? cuentas.filter((c) => c && c.orden && [1, 2, 3].includes(c.numero)).slice(0, MAX_CUENTAS)
  : [];
if (cuentas.length === 0) cuentas = [{ numero: 1, orden: {} }];
if (!cuentas.some((c) => c.numero === activa)) activa = cuentas[0].numero;
let diaVisto = new Date();
let moneda = 'MXN'; // moneda en que paga el cliente
let recibido = null; // cantidad con la que paga el cliente (en su moneda), null = exacto

// ---------- Utilidades ----------

const $ = (id) => document.getElementById(id);

const formatoPesos = new Intl.NumberFormat('es-MX', {
  style: 'currency', currency: 'MXN', maximumFractionDigits: 2, minimumFractionDigits: 0,
});
const pesos = (n) => formatoPesos.format(n);
const formatoNumero = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
const dolares = (n) => `US$${formatoNumero.format(n)}`;
const enMoneda = (n, m) => (m === 'USD' ? dolares(n) : pesos(n));
const redondear = (n) => Math.round(n * 100) / 100;

function claveDia(fecha) {
  const d = new Date(fecha);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function escapar(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

let temporizadorAviso;
function mostrarAviso(texto, error = false) {
  const el = $('aviso');
  el.textContent = texto;
  el.classList.toggle('error', error);
  el.classList.add('visible');
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => el.classList.remove('visible'), 2200);
}

function vibrar() {
  if (navigator.vibrate) navigator.vibrate(15);
}

// ---------- Navegación ----------

function irA(vista) {
  document.querySelectorAll('.vista').forEach((v) => v.classList.toggle('activa', v.id === `vista-${vista}`));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('activa', t.dataset.vista === vista));
  if (vista === 'ventas') pintarVentas();
  if (vista === 'ajustes') pintarAjustes();
  window.scrollTo(0, 0);
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => irA(tab.dataset.vista));
});

// ---------- Cuentas ----------

const productos = () => [...menu, ...extras];
const cuentaActiva = () => cuentas.find((c) => c.numero === activa);
const totalDe = (cuenta) => productos().reduce((suma, p) => suma + (cuenta.orden[p.id] || 0) * p.precio, 0);
const totalOrden = () => totalDe(cuentaActiva());
const tieneProductos = (cuenta) => productos().some((p) => cuenta.orden[p.id] > 0);

function guardarCuentas() {
  guardar(CLAVE_CUENTAS, { cuentas, activa });
}

function abrirCuenta() {
  if (cuentas.length >= MAX_CUENTAS) {
    mostrarAviso(`Máximo ${MAX_CUENTAS} cuentas abiertas`, true);
    return;
  }
  const numero = [1, 2, 3].find((n) => !cuentas.some((c) => c.numero === n));
  cuentas.push({ numero, orden: {} });
  cuentas.sort((x, y) => x.numero - y.numero);
  activa = numero;
  guardarCuentas();
  pintarOrden();
  mostrarAviso(`Cuenta ${numero} abierta`);
}

// Cierra una cuenta (cobrada o borrada). Siempre queda al menos una abierta.
function cerrarCuenta(numero) {
  cuentas = cuentas.filter((c) => c.numero !== numero);
  if (cuentas.length === 0) cuentas = [{ numero: 1, orden: {} }];
  if (!cuentas.some((c) => c.numero === activa)) activa = cuentas[0].numero;
  guardarCuentas();
}

function pintarCuentas() {
  $('cuentas').innerHTML = cuentas.map((c) => {
    const total = totalDe(c);
    return `
    <button class="cuenta ${c.numero === activa ? 'activa' : ''}" type="button" data-numero="${c.numero}"
            aria-pressed="${c.numero === activa}">
      <span class="nombre-cuenta">Cuenta ${c.numero}</span>
      <span class="total-cuenta">${total > 0 ? pesos(total) : 'vacía'}</span>
    </button>`;
  }).join('') + (cuentas.length < MAX_CUENTAS
    ? '<button class="cuenta cuenta-nueva" type="button" data-accion="nueva" aria-label="Abrir otra cuenta">+</button>'
    : '');
  $('cuentas-max').hidden = cuentas.length < MAX_CUENTAS;
}

$('cuentas').addEventListener('click', (e) => {
  const boton = e.target.closest('button.cuenta');
  if (!boton) return;
  if (boton.dataset.accion === 'nueva') {
    abrirCuenta();
    return;
  }
  activa = Number(boton.dataset.numero);
  guardarCuentas();
  vibrar();
  pintarOrden();
});

// ---------- Vender ----------

function pintarMenu() {
  $('botones-menu').innerHTML = menu.map((p) => `
    <button class="producto" type="button" data-id="${escapar(p.id)}">
      ${icono(p.id)}
      <span class="nombre">${escapar(p.nombre)}</span>
      <span class="precio">${pesos(p.precio)}</span>
    </button>`).join('');
  $('botones-otros').innerHTML = extras.map((p) => `
    <button class="otro" type="button" data-id="${escapar(p.id)}">
      <span class="nombre">${escapar(p.nombre)}</span>
      <span class="precio">${pesos(p.precio)}</span>
    </button>`).join('');
  $('otros-seccion').hidden = extras.length === 0;
}

function pintarOrden() {
  pintarCuentas();
  const { numero, orden } = cuentaActiva();
  const lineas = productos().filter((p) => orden[p.id] > 0);
  $('orden-titulo').textContent = `Orden · Cuenta ${numero}`;
  $('total-etiqueta').textContent = `Total · Cuenta ${numero}`;
  $('orden-lista').innerHTML = lineas.map((p) => `
    <li>
      ${icono(p.id)}
      <div class="info">
        <strong>${escapar(p.nombre)}</strong>
        <span>${pesos(p.precio * orden[p.id])}</span>
      </div>
      <div class="cantidad">
        <button type="button" data-accion="menos" data-id="${escapar(p.id)}" aria-label="Quitar uno">−</button>
        <output>${orden[p.id]}</output>
        <button type="button" data-accion="mas" data-id="${escapar(p.id)}" aria-label="Agregar uno">+</button>
      </div>
    </li>`).join('');
  $('orden-vacia').hidden = lineas.length > 0;
  $('orden-total').textContent = pesos(totalOrden());
  $('btn-cobrar').disabled = lineas.length === 0;
  $('btn-limpiar').disabled = lineas.length === 0 && cuentas.length === 1;
}

function agregar(e) {
  const boton = e.target.closest('button[data-id]');
  if (!boton) return;
  const { orden } = cuentaActiva();
  orden[boton.dataset.id] = (orden[boton.dataset.id] || 0) + 1;
  guardarCuentas();
  vibrar();
  pintarOrden();
}
$('botones-menu').addEventListener('click', agregar);
$('botones-otros').addEventListener('click', agregar);

$('orden-lista').addEventListener('click', (e) => {
  const boton = e.target.closest('button[data-accion]');
  if (!boton) return;
  const { orden } = cuentaActiva();
  const id = boton.dataset.id;
  orden[id] = Math.max(0, (orden[id] || 0) + (boton.dataset.accion === 'mas' ? 1 : -1));
  if (orden[id] === 0) delete orden[id];
  guardarCuentas();
  vibrar();
  pintarOrden();
});

// "Borrar" cierra la cuenta completa sin cobrarla.
$('btn-limpiar').addEventListener('click', () => {
  const cuenta = cuentaActiva();
  const conProductos = tieneProductos(cuenta);
  if (!conProductos && cuentas.length === 1) return;
  if (conProductos && !confirm(`¿Cerrar la Cuenta ${cuenta.numero} sin cobrar? Se borrarán sus productos.`)) return;
  cerrarCuenta(cuenta.numero);
  pintarOrden();
  mostrarAviso(`Cuenta ${cuenta.numero} cerrada`);
});

// ---------- Cobrar ----------

// Todo se calcula en pesos. Si el cliente paga en dólares, el total se convierte
// con el tipo de cambio guardado (redondeado hacia arriba al centavo) y el cambio se da en pesos.
function calcularCobro() {
  const total = totalOrden();
  if (moneda === 'USD') {
    const totalUsd = Math.ceil((total / tasa.valor) * 100) / 100;
    const pagoUsd = recibido === null ? totalUsd : recibido;
    const pagoPesos = recibido === null ? total : redondear(pagoUsd * tasa.valor);
    return {
      total, totalMoneda: totalUsd, pagoMoneda: pagoUsd, pagoPesos,
      cambio: Math.max(0, redondear(pagoPesos - total)),
      falta: redondear(totalUsd - pagoUsd),
    };
  }
  const pago = recibido === null ? total : recibido;
  return {
    total, totalMoneda: total, pagoMoneda: pago, pagoPesos: pago,
    cambio: Math.max(0, redondear(pago - total)),
    falta: redondear(total - pago),
  };
}

function pintarCobro() {
  const c = calcularCobro();
  const usd = moneda === 'USD';

  document.querySelectorAll('#cobro-moneda button').forEach((b) =>
    b.classList.toggle('seleccionado', b.dataset.moneda === moneda));

  $('cobro-total').textContent = enMoneda(c.totalMoneda, moneda);
  $('cobro-equivalente').hidden = !usd;
  $('cobro-equivalente').textContent = usd ? `${pesos(c.total)} · 1 dólar = ${pesos(tasa.valor)}` : '';
  $('cobro-recibido-etiqueta').textContent = usd ? 'Otra cantidad (dólares)' : 'Otra cantidad (pesos)';
  $('cobro-recibido').step = usd ? '0.01' : '1';
  $('cobro-cambio-etiqueta').textContent = usd ? 'Cambio en pesos' : 'Cambio';
  $('cobro-cambio').textContent = pesos(c.cambio);
  $('cobro-falta').hidden = c.falta <= 0;
  $('cobro-falta').textContent = c.falta > 0 ? `Faltan ${enMoneda(c.falta, moneda)}` : '';
  $('btn-confirmar-cobro').disabled = c.falta > 0;

  const billetes = BILLETES[moneda];
  const mayor = billetes[billetes.length - 1];
  $('cobro-billetes').innerHTML = [
    `<button type="button" data-monto="exacto" class="${recibido === null ? 'seleccionado' : ''}">Exacto</button>`,
    ...billetes.filter((b) => b >= c.totalMoneda || b === mayor).slice(0, 5).map((b) =>
      `<button type="button" data-monto="${b}" class="${recibido === b ? 'seleccionado' : ''}">${enMoneda(b, moneda)}</button>`),
  ].join('');
}

function cambiarMoneda(nueva) {
  if (nueva === 'USD' && !(tasa && tasa.valor > 0)) {
    $('cobro-sin-tasa').hidden = false;
    return;
  }
  $('cobro-sin-tasa').hidden = true;
  moneda = nueva;
  recibido = null;
  $('cobro-recibido').value = '';
  pintarCobro();
}

$('btn-cobrar').addEventListener('click', () => {
  $('cobro-cuenta').textContent = `Cuenta ${activa}`;
  cambiarMoneda('MXN');
  $('dlg-cobrar').showModal();
});

$('cobro-moneda').addEventListener('click', (e) => {
  const boton = e.target.closest('button[data-moneda]');
  if (boton) cambiarMoneda(boton.dataset.moneda);
});

$('cobro-billetes').addEventListener('click', (e) => {
  const boton = e.target.closest('button[data-monto]');
  if (!boton) return;
  recibido = boton.dataset.monto === 'exacto' ? null : Number(boton.dataset.monto);
  $('cobro-recibido').value = '';
  pintarCobro();
});

$('cobro-recibido').addEventListener('input', (e) => {
  const valor = parseFloat(e.target.value);
  recibido = Number.isFinite(valor) && valor > 0 ? valor : null;
  pintarCobro();
});

$('btn-cancelar-cobro').addEventListener('click', () => $('dlg-cobrar').close());

$('btn-confirmar-cobro').addEventListener('click', () => {
  const c = calcularCobro();
  if (c.total === 0 || c.falta > 0) return;

  const venta = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    fecha: new Date().toISOString(),
    // Se guarda el nombre y precio del momento, así cambiar el menú no altera ventas pasadas.
    productos: productos().filter((p) => cuentaActiva().orden[p.id] > 0).map((p) => ({
      id: p.id, nombre: p.nombre, precio: p.precio, cantidad: cuentaActiva().orden[p.id],
    })),
    total: c.total,
    moneda,
    recibido: c.pagoPesos, // siempre en pesos
    cambio: c.cambio, // siempre en pesos
  };
  if (moneda === 'USD') {
    venta.tipoCambio = tasa.valor;
    venta.recibidoUsd = c.pagoMoneda;
  }

  ventas.push(venta);
  if (!guardar(CLAVE_VENTAS, ventas)) {
    ventas.pop();
    return;
  }

  $('dlg-cobrar').close();
  cerrarCuenta(activa);
  pintarOrden();
  mostrarAviso(venta.cambio > 0 ? `Venta guardada ✓  Cambio: ${pesos(venta.cambio)}` : 'Venta guardada ✓');
});

// ---------- Ventas (resumen) ----------

function resumenDelDia(fecha) {
  const clave = claveDia(fecha);
  const delDia = ventas.filter((v) => claveDia(v.fecha) === clave);
  const porProducto = new Map();
  for (const v of delDia) {
    for (const p of v.productos) {
      const actual = porProducto.get(p.id) || { nombre: p.nombre, unidades: 0, monto: 0 };
      actual.unidades += p.cantidad;
      actual.monto += p.cantidad * p.precio;
      porProducto.set(p.id, actual);
    }
  }
  return {
    ventas: delDia,
    total: delDia.reduce((s, v) => s + v.total, 0),
    porProducto,
  };
}

function pintarVentas() {
  const hoy = claveDia(new Date());
  const ayer = claveDia(new Date(Date.now() - 86400000));
  const clave = claveDia(diaVisto);

  $('dia-titulo').textContent = clave === hoy ? 'Hoy' : clave === ayer ? 'Ayer' :
    diaVisto.toLocaleDateString('es-MX', { weekday: 'long' });
  $('dia-fecha').textContent = diaVisto.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  $('dia-siguiente').disabled = clave >= hoy;

  const r = resumenDelDia(diaVisto);
  $('res-ordenes').textContent = r.ventas.length;
  $('res-total').textContent = pesos(r.total);

  // Para cuadrar la caja: cuántos dólares en efectivo entraron este día.
  const enDolares = r.ventas.filter((v) => v.moneda === 'USD');
  const usdRecibidos = redondear(enDolares.reduce((s, v) => s + v.recibidoUsd, 0));
  $('res-dolares').hidden = enDolares.length === 0;
  $('res-dolares').textContent = `Pagos en dólares: ${enDolares.length} ${enDolares.length === 1 ? 'venta' : 'ventas'} · ${dolares(usdRecibidos)} recibidos`;

  // Mostrar siempre los productos del menú (aunque estén en 0), y además cualquier otro artículo vendido ese día.
  const filas = menu.map((p) => ({ id: p.id, ...(r.porProducto.get(p.id) || { nombre: p.nombre, unidades: 0, monto: 0 }) }));
  for (const [id, datos] of r.porProducto) {
    if (!menu.some((p) => p.id === id)) filas.push({ id, ...datos });
  }
  $('res-productos').innerHTML = filas.map((f) => `
    <li>
      ${icono(f.id)}
      <span class="nombre">${escapar(f.nombre)}</span>
      <span class="unidades">${f.unidades}</span>
      <span class="monto">${pesos(f.monto)}</span>
    </li>`).join('');

  $('res-ventas').innerHTML = r.ventas.slice().reverse().map((v) => `
    <li>
      <span class="hora">${new Date(v.fecha).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })}</span>
      <span class="detalle">${v.productos.map((p) => `${p.cantidad} × ${escapar(p.nombre)}`).join('<br>')}${
        v.moneda === 'USD' ? `<span class="usd">Pagó ${dolares(v.recibidoUsd)}</span>` : ''}</span>
      <span class="monto">${pesos(v.total)}</span>
      <button class="borrar" type="button" data-id="${escapar(v.id)}" aria-label="Borrar venta"><svg class="icono"><use href="#icono-borrar"/></svg></button>
    </li>`).join('');
  $('res-vacio').hidden = r.ventas.length > 0;
}

$('dia-anterior').addEventListener('click', () => {
  diaVisto = new Date(diaVisto.getFullYear(), diaVisto.getMonth(), diaVisto.getDate() - 1);
  pintarVentas();
});

$('dia-siguiente').addEventListener('click', () => {
  diaVisto = new Date(diaVisto.getFullYear(), diaVisto.getMonth(), diaVisto.getDate() + 1);
  pintarVentas();
});

$('res-ventas').addEventListener('click', (e) => {
  const boton = e.target.closest('button.borrar');
  if (!boton) return;
  const venta = ventas.find((v) => v.id === boton.dataset.id);
  if (!venta) return;
  if (!confirm(`¿Borrar esta venta de ${pesos(venta.total)}? Úsalo solo si fue un error.`)) return;
  ventas = ventas.filter((v) => v.id !== venta.id);
  guardar(CLAVE_VENTAS, ventas);
  pintarVentas();
  mostrarAviso('Venta borrada');
});

// ---------- Ajustes ----------

function pintarTasa() {
  $('tasa-valor').value = tasa ? tasa.valor : '';
  $('tasa-actualizada').textContent = tasa
    ? `Actualizado: ${new Date(tasa.actualizado).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}`
    : 'Todavía no hay tipo de cambio. Sin él no se puede cobrar en dólares.';
}

$('form-tasa').addEventListener('submit', (e) => {
  e.preventDefault();
  const valor = redondear(parseFloat($('tasa-valor').value));
  if (!(valor > 0)) {
    mostrarAviso('Escribe cuántos pesos vale 1 dólar', true);
    return;
  }
  const nueva = { valor, actualizado: new Date().toISOString() };
  if (guardar(CLAVE_TASA, nueva)) {
    tasa = nueva;
    pintarTasa();
    mostrarAviso(`Tipo de cambio guardado ✓  1 dólar = ${pesos(valor)}`);
  }
});

function pintarAjustes() {
  pintarTasa();
  pintarOtros();
  $('form-menu').innerHTML = menu.map((p, i) => `
    <div class="fila">
      <label class="campo">
        <span>${icono(p.id)} Nombre</span>
        <input name="nombre-${i}" type="text" value="${escapar(p.nombre)}" required>
      </label>
      <label class="campo">
        <span>Precio $</span>
        <input name="precio-${i}" type="number" inputmode="decimal" min="0" step="0.5" value="${p.precio}" required>
      </label>
    </div>`).join('') +
    '<button class="btn btn-principal btn-ancho" type="submit">Guardar precios</button>';
}

$('form-menu').addEventListener('submit', (e) => {
  e.preventDefault();
  const datos = new FormData(e.target);
  const nuevo = menu.map((p, i) => ({
    ...p,
    nombre: String(datos.get(`nombre-${i}`)).trim() || p.nombre,
    precio: Math.max(0, parseFloat(datos.get(`precio-${i}`)) || 0),
  }));
  if (guardar(CLAVE_MENU, nuevo)) {
    menu = nuevo;
    pintarMenu();
    pintarOrden();
    mostrarAviso('Precios guardados ✓');
  }
});

// Otros artículos (bolsas, etc.): se agregan, editan y quitan aquí.
function pintarOtros() {
  const filas = extras.map((p, i) => `
    <div class="fila fila-otro">
      <label class="campo">
        <span>${icono(p.id)} Nombre</span>
        <input name="nombre-${i}" type="text" value="${escapar(p.nombre)}" required>
      </label>
      <label class="campo">
        <span>Precio $</span>
        <input name="precio-${i}" type="number" inputmode="decimal" min="0" step="0.5" value="${p.precio}" required>
      </label>
      <button class="quitar" type="button" data-indice="${i}" aria-label="Quitar ${escapar(p.nombre)}">
        <svg class="icono"><use href="#icono-borrar"/></svg>
      </button>
    </div>`).join('');
  $('form-otros').innerHTML = filas + `
    <div class="fila fila-nueva">
      <label class="campo">
        <span>Nuevo artículo</span>
        <input name="nuevo-nombre" type="text" placeholder="Ej. Bolsa" autocomplete="off">
      </label>
      <label class="campo">
        <span>Precio $</span>
        <input name="nuevo-precio" type="number" inputmode="decimal" min="0" step="0.5" placeholder="0">
      </label>
    </div>
    <button id="btn-agregar-otro" class="btn btn-secundario btn-ancho" type="button">+ Agregar artículo</button>
    ${extras.length ? '<button class="btn btn-principal btn-ancho" type="submit">Guardar cambios</button>' : ''}`;
}

// Lee lo que está escrito en las filas, para no perder cambios sin guardar al agregar o quitar.
function otrosDelFormulario() {
  const datos = new FormData($('form-otros'));
  return extras.map((p, i) => {
    const precio = parseFloat(datos.get(`precio-${i}`));
    return {
      ...p,
      nombre: String(datos.get(`nombre-${i}`) || '').trim() || p.nombre,
      precio: Number.isFinite(precio) && precio >= 0 ? precio : p.precio,
    };
  });
}

function guardarOtros(nuevos, aviso) {
  if (!guardar(CLAVE_EXTRAS, nuevos)) return;
  extras = nuevos;
  pintarOtros();
  pintarMenu();
  pintarOrden();
  mostrarAviso(aviso);
}

$('form-otros').addEventListener('submit', (e) => {
  e.preventDefault();
  guardarOtros(otrosDelFormulario(), 'Artículos guardados ✓');
});

$('form-otros').addEventListener('click', (e) => {
  if (e.target.closest('#btn-agregar-otro')) {
    const datos = new FormData($('form-otros'));
    const nombre = String(datos.get('nuevo-nombre') || '').trim();
    const precio = parseFloat(datos.get('nuevo-precio'));
    if (!nombre) {
      mostrarAviso('Escribe el nombre del artículo', true);
      return;
    }
    if (!(Number.isFinite(precio) && precio >= 0)) {
      mostrarAviso('Escribe el precio del artículo', true);
      return;
    }
    const nuevo = { id: `extra-${Date.now().toString(36)}`, nombre, precio };
    guardarOtros([...otrosDelFormulario(), nuevo], `${nombre} agregado ✓`);
    return;
  }

  const quitar = e.target.closest('button.quitar');
  if (!quitar) return;
  const editados = otrosDelFormulario();
  const articulo = editados[Number(quitar.dataset.indice)];
  if (!articulo || !confirm(`¿Quitar "${articulo.nombre}"? Las ventas pasadas no cambian.`)) return;
  // También se quita de las cuentas abiertas.
  for (const c of cuentas) delete c.orden[articulo.id];
  guardarCuentas();
  guardarOtros(editados.filter((p) => p.id !== articulo.id), `${articulo.nombre} quitado`);
});

function campoCsv(valor) {
  const texto = String(valor);
  return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

$('btn-exportar').addEventListener('click', () => {
  if (ventas.length === 0) {
    mostrarAviso('Todavía no hay ventas', true);
    return;
  }
  // Una fila por producto vendido: fácil de sumar en Excel o Google Sheets.
  const filas = [['Fecha', 'Hora', 'Venta', 'Producto', 'Cantidad', 'Precio', 'Subtotal', 'Total venta',
    'Moneda de pago', 'Tipo de cambio', 'Recibido (USD)', 'Recibido (MXN)', 'Cambio (MXN)']];
  for (const v of ventas) {
    const d = new Date(v.fecha);
    const hora = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    for (const p of v.productos) {
      const usd = v.moneda === 'USD';
      filas.push([claveDia(d), hora, v.id, p.nombre, p.cantidad, p.precio, p.cantidad * p.precio, v.total,
        usd ? 'USD' : 'MXN', usd ? v.tipoCambio : '', usd ? v.recibidoUsd : '', v.recibido, v.cambio]);
    }
  }
  const csv = '﻿' + filas.map((f) => f.map(campoCsv).join(',')).join('\n');
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  enlace.download = `ventas-dulce-churros-${claveDia(new Date())}.csv`;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
});

$('btn-borrar-todo').addEventListener('click', () => {
  if (ventas.length === 0) return;
  if (!confirm(`Se borrarán ${ventas.length} ventas para siempre. ¿Descargaste un respaldo?`)) return;
  if (!confirm('¿Seguro? Esto no se puede deshacer.')) return;
  ventas = [];
  guardar(CLAVE_VENTAS, ventas);
  mostrarAviso('Ventas borradas');
});

// ---------- Inicio ----------

pintarMenu();
pintarOrden();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
