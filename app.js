'use strict';

// ---------- Datos ----------

const CLAVE_MENU = 'dulcechurros.menu';
const CLAVE_VENTAS = 'dulcechurros.ventas';

const MENU_INICIAL = [
  { id: 'churros', nombre: 'Orden de Churros', precio: 100, emoji: '🥖' },
  { id: 'churros-helado', nombre: 'Churros con Helado', precio: 120, emoji: '🍦' },
  { id: 'malteada', nombre: 'Malteada', precio: 120, emoji: '🥤' },
];

const BILLETES = [20, 50, 100, 200, 500, 1000];

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
let orden = {}; // id de producto -> cantidad
let diaVisto = new Date();
let recibido = null; // cantidad con la que paga el cliente, null = exacto

// ---------- Utilidades ----------

const $ = (id) => document.getElementById(id);

const formatoPesos = new Intl.NumberFormat('es-MX', {
  style: 'currency', currency: 'MXN', maximumFractionDigits: 2, minimumFractionDigits: 0,
});
const pesos = (n) => formatoPesos.format(n);

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
  el.style.background = error ? 'var(--rojo)' : 'var(--verde)';
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

// ---------- Vender ----------

function totalOrden() {
  return menu.reduce((suma, p) => suma + (orden[p.id] || 0) * p.precio, 0);
}

function pintarMenu() {
  $('botones-menu').innerHTML = menu.map((p) => `
    <button class="producto" type="button" data-id="${escapar(p.id)}">
      <span class="emoji">${escapar(p.emoji)}</span>
      <span class="nombre">${escapar(p.nombre)}</span>
      <span class="precio">${pesos(p.precio)}</span>
    </button>`).join('');
}

function pintarOrden() {
  const lineas = menu.filter((p) => orden[p.id] > 0);
  $('orden-lista').innerHTML = lineas.map((p) => `
    <li>
      <div class="info">
        <strong>${escapar(p.emoji)} ${escapar(p.nombre)}</strong>
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
}

$('botones-menu').addEventListener('click', (e) => {
  const boton = e.target.closest('.producto');
  if (!boton) return;
  orden[boton.dataset.id] = (orden[boton.dataset.id] || 0) + 1;
  vibrar();
  pintarOrden();
});

$('orden-lista').addEventListener('click', (e) => {
  const boton = e.target.closest('button[data-accion]');
  if (!boton) return;
  const id = boton.dataset.id;
  orden[id] = Math.max(0, (orden[id] || 0) + (boton.dataset.accion === 'mas' ? 1 : -1));
  vibrar();
  pintarOrden();
});

$('btn-limpiar').addEventListener('click', () => {
  if (totalOrden() === 0) return;
  if (confirm('¿Borrar la orden actual?')) {
    orden = {};
    pintarOrden();
  }
});

// ---------- Cobrar ----------

function pintarCobro() {
  const total = totalOrden();
  const pago = recibido === null ? total : recibido;
  const falta = pago < total;

  $('cobro-total').textContent = pesos(total);
  $('cobro-cambio').textContent = pesos(Math.max(0, pago - total));
  $('cobro-falta').hidden = !falta;
  $('cobro-falta').textContent = falta ? `Faltan ${pesos(total - pago)}` : '';
  $('btn-confirmar-cobro').disabled = falta;

  $('cobro-billetes').innerHTML = [
    `<button type="button" data-monto="exacto" class="${recibido === null ? 'seleccionado' : ''}">Exacto</button>`,
    ...BILLETES.filter((b) => b >= total || b === BILLETES[BILLETES.length - 1]).slice(0, 5).map((b) =>
      `<button type="button" data-monto="${b}" class="${recibido === b ? 'seleccionado' : ''}">${pesos(b)}</button>`),
  ].join('');
}

$('btn-cobrar').addEventListener('click', () => {
  recibido = null;
  $('cobro-recibido').value = '';
  pintarCobro();
  $('dlg-cobrar').showModal();
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
  const total = totalOrden();
  const pago = recibido === null ? total : recibido;
  if (total === 0 || pago < total) return;

  const venta = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    fecha: new Date().toISOString(),
    // Se guarda el nombre y precio del momento, así cambiar el menú no altera ventas pasadas.
    productos: menu.filter((p) => orden[p.id] > 0).map((p) => ({
      id: p.id, nombre: p.nombre, precio: p.precio, cantidad: orden[p.id],
    })),
    total,
    recibido: pago,
    cambio: pago - total,
  };

  ventas.push(venta);
  if (!guardar(CLAVE_VENTAS, ventas)) {
    ventas.pop();
    return;
  }

  $('dlg-cobrar').close();
  orden = {};
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

  // Mostrar siempre los productos del menú (aunque estén en 0), y además cualquiera vendido que ya no esté en el menú.
  const filas = menu.map((p) => ({ emoji: p.emoji, ...(r.porProducto.get(p.id) || { nombre: p.nombre, unidades: 0, monto: 0 }) }));
  for (const [id, datos] of r.porProducto) {
    if (!menu.some((p) => p.id === id)) filas.push({ emoji: '•', ...datos });
  }
  $('res-productos').innerHTML = filas.map((f) => `
    <li>
      <span class="emoji">${escapar(f.emoji)}</span>
      <span class="nombre">${escapar(f.nombre)}</span>
      <span class="unidades">${f.unidades}</span>
      <span class="monto">${pesos(f.monto)}</span>
    </li>`).join('');

  $('res-ventas').innerHTML = r.ventas.slice().reverse().map((v) => `
    <li>
      <span class="hora">${new Date(v.fecha).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })}</span>
      <span class="detalle">${v.productos.map((p) => `${p.cantidad} × ${escapar(p.nombre)}`).join('<br>')}</span>
      <span class="monto">${pesos(v.total)}</span>
      <button class="borrar" type="button" data-id="${escapar(v.id)}" aria-label="Borrar venta">🗑️</button>
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

function pintarAjustes() {
  $('form-menu').innerHTML = menu.map((p, i) => `
    <div class="fila">
      <label class="campo">
        <span>${escapar(p.emoji)} Nombre</span>
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
  const filas = [['Fecha', 'Hora', 'Venta', 'Producto', 'Cantidad', 'Precio', 'Subtotal', 'Total venta', 'Recibido', 'Cambio']];
  for (const v of ventas) {
    const d = new Date(v.fecha);
    const hora = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    for (const p of v.productos) {
      filas.push([claveDia(d), hora, v.id, p.nombre, p.cantidad, p.precio, p.cantidad * p.precio, v.total, v.recibido, v.cambio]);
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
