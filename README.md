# 03/cerotres

Sistema de gestion para la dark kitchen 03/cerotres (pepitos venezolanos y hamburguesas). Incluye tienda para clientes (ecommerce) y panel administrativo completo (ventas, cocina, inventario, compras, finanzas, reportes).

## Stack

- **Frontend**: React + Vite (`/frontend`)
- **Backend**: Node + Express (`/backend`)
- **Base de datos / Auth**: Supabase (Postgres) (`/supabase/migrations`)
- **Email**: Resend (todos los correos los envia nuestro backend, no Supabase)

UI en espanol; codigo, tablas, columnas y variables en ingles.

## Estructura

```
backend/    API REST (Express). Unico servicio con la service_role key de Supabase.
frontend/   Tienda (storefront) + panel administrativo (SPA con React Router).
supabase/migrations/   Historial de migraciones SQL (ya aplicadas al proyecto).
```

Todo el acceso a la base de datos pasa por el backend (usa la service_role key y por lo tanto ignora RLS). El frontend nunca habla directo con Supabase salvo para autenticacion (login, signup, reset password).

## Configuracion inicial

### 1. Variables de entorno

**backend/.env** (copiar de `backend/.env.example`):

```
SUPABASE_URL=https://kpvxfrufcxxfxnrlfzmu.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...   # Supabase Dashboard > Project Settings > API > service_role (secreto, no compartir)
RESEND_API_KEY=...              # https://resend.com/api-keys
RESEND_FROM="03/cerotres <pedidos@tu-dominio.com>"   # debe ser un dominio verificado en Resend
FRONTEND_URL=http://localhost:5173
CORS_ORIGIN=http://localhost:5173
```

**frontend/.env** (copiar de `frontend/.env.example`):

```
VITE_SUPABASE_URL=https://kpvxfrufcxxfxnrlfzmu.supabase.co
VITE_SUPABASE_ANON_KEY=...      # Supabase Dashboard > Project Settings > API > anon/public key
VITE_API_URL=http://localhost:4000/api
```

Ninguna clave secreta (service_role, Resend) debe subirse al repositorio. Los `.env` estan en `.gitignore`.

### 2. Supabase Auth

En el Dashboard de Supabase (Authentication > URL Configuration), agregar como Redirect URLs:

- `http://localhost:5173/correo-confirmado`
- `http://localhost:5173/restablecer-contrasena`
- (y las URLs equivalentes de produccion cuando se despliegue)

El envio de correos de Supabase (confirm email / reset password) debe estar **desactivado** en Authentication > Email Templates/Providers - esos correos los genera y envia el backend con Resend (`backend/src/routes/auth.routes.js`).

### 3. Instalar y correr

```bash
cd backend && npm install && npm run dev     # http://localhost:4000
cd frontend && npm install && npm run dev    # http://localhost:5173
```

### 4. Crear el primer usuario administrador

No hay un admin por defecto. Dos opciones:

- Registrar un usuario (`POST /api/auth/register` o desde la app) y luego, en Supabase SQL editor: `update profiles set role = 'admin' where id = '<uuid del usuario>';`
- O crearlo directo desde el backend con `supabaseAdmin.auth.admin.createUser` (ver `backend/src/routes/settings.routes.js` -> `POST /api/settings/staff`, requiere ya estar autenticado como admin, asi que el primer admin se crea manualmente una sola vez).

## Modulos del panel administrativo

- **Ventas**: pedidos (cliente o creados por el staff), estados (pendiente, confirmado, en preparacion, preparado, en camino, entregado, cancelado), pagos multiples/mixtos por pedido, impresion de recibo (cliente) y comanda (cocina) en formato termico.
- **Cocina**: tablero de pedidos en preparacion (KDS), avanza el estado por item y por pedido.
- **Clientes**: cedula, nombre, correo, telefono, direcciones.
- **Productos**: catalogo con precio base + constructor de opciones estilo Subway (grupos de opciones: tamano, extras, salsas...).
- **Opciones y extras**: grupos de opciones (seleccion unica/multiple, obligatorios, pueden descontar inventario).
- **Recetas**: bill of materials por producto, alimenta costo y descuento automatico de inventario.
- **Categorias / Unidades**: catalogo base.
- **Compras**: ordenes de compra a proveedores, recepcion (mueve inventario) y pagos (CXP) por separado.
- **Proveedores / Ingredientes / Inventario**: stock, movimientos (Kardex), ajustes manuales, alertas de stock bajo.
- **Gastos**: gastos operativos (no compras de insumos).
- **Cuentas**: cajas, bancos, billeteras - todo pago/gasto puede asociarse a una cuenta.
- **Cash Flow**: libro de caja (ingresos/egresos) con movimientos automaticos y manuales.
- **Cuentas por cobrar / pagar**: pedidos y compras con saldo pendiente.
- **Reportes de ventas / Balance / Perdidas y ganancias**: metricas calculadas en USD (moneda base).
- **Ajustes y tasas**: datos del negocio y tasas de cambio (USD/EUR/VES) usadas para mostrar precios y registrar pagos en distintas monedas.
- **Personal**: cuentas de staff (admin, gerente, cocina, delivery).

## Multi-moneda

Los precios de catalogo estan siempre en USD (moneda base de toda la contabilidad). Al mostrar precios o registrar un pago en otra moneda, se usa la tasa configurada en **Ajustes y tasas** (unidades de esa moneda por 1 USD). Cada pedido y cada pago guardan la moneda y la tasa usada en ese momento, para que el historial no cambie si la tasa se actualiza despues.

## Notas de seguridad

- El backend usa la service_role key de Supabase; nunca debe exponerse al frontend.
- RLS esta activado en todas las tablas sin policies para anon/authenticated - todo acceso pasa por el backend.
- Los correos (confirmacion, reset password, notificaciones de pedidos) los envia el backend via Resend, no Supabase.
