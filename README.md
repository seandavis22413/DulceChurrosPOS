# Dulce Churros POS

Punto de venta sencillo para el teléfono. Registra cada venta de churros y malteadas y muestra el resumen del día.

## Qué hace (versión 1)

- **Vender:** botones grandes para Orden de Churros ($100), Churros con Helado ($120) y Malteada ($120). Ajusta cantidades con − / +.
- **Cobrar:** muestra el total, el cliente elige con cuánto paga (Exacto, $200, $500…) y la app calcula el cambio.
- **Ventas:** número de órdenes, total vendido y unidades por producto, por día (flechas ‹ › para ver días anteriores). Se puede borrar una venta hecha por error.
- **Ajustes:** cambiar nombres y precios, descargar las ventas como CSV (se abre en Excel o Google Sheets) y borrar todo.
- Funciona **sin internet** y se instala en la pantalla de inicio.
- Todo en pesos (MXN). La conversión a dólares queda para una versión futura.

> Las ventas se guardan **solo en el teléfono** donde se usa la app. Descarga el respaldo CSV seguido.
> Si borras los datos del navegador o desinstalas la app, se pierden las ventas.

## Cómo publicarla (gratis) y abrirla en el teléfono

La app son archivos estáticos (`index.html`, `app.js`, `styles.css`…), sin instalación ni compilación.

**Opción A: GitHub Pages**
1. En GitHub: *Settings → Pages*.
2. En *Source* elige *Deploy from a branch*, la rama y la carpeta `/ (root)`.
3. Espera 1–2 minutos y abre la dirección que aparece (`https://<usuario>.github.io/DulceChurrosPOS/`).
   (Para repositorios privados GitHub Pages requiere un plan de pago; si es tu caso usa la opción B.)

**Opción B: Netlify Drop**
1. Descarga el repositorio como ZIP y descomprímelo.
2. Arrastra la carpeta a https://app.netlify.com/drop.

**Instalar en el teléfono**
- iPhone (Safari): botón Compartir → *Agregar a pantalla de inicio*.
- Android (Chrome): menú ⋮ → *Instalar app* / *Agregar a pantalla principal*.

## Probar en la computadora

```bash
npx http-server -p 8080
```
y abre http://localhost:8080.

## Al actualizar la app

Cuando cambies cualquier archivo, sube el número en `VERSION` dentro de `sw.js`
(por ejemplo `dulcechurros-v2`) para que los teléfonos reciban la versión nueva.
