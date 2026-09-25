# PROMPT MAESTRO — Plataforma Cero Tres (pedidos online + administración)

> **Cómo usar este archivo:** guárdalo en la raíz del proyecto como `docs/00-PROMPT-MAESTRO.md`.
> En Cursor, abre el chat en modo **Agent**, adjunta este archivo con `@00-PROMPT-MAESTRO.md` y pega
> el prompt de la fase que toque (archivo `01-PROMPTS-POR-FASE.md`). Este documento es el contexto
> permanente: no lo ejecutes de una sola vez, se construye por fases.

---

## 0. Contexto para ti, Cursor (léelo antes de escribir una línea de código)

Estás trabajando para **Cero Tres (`@03__cerotres`)**, una dark kitchen venezolana que vende pepitos.
Vamos a construir una plataforma web con dos caras: una **app de pedidos para clientes** y un
**panel de administración** para operar el negocio.

### Regla #1 — El dueño no tiene NADA instalado ni configurado

El usuario con el que hablas **no es desarrollador de este stack** y parte de cero:

- No tiene Node, pnpm, Docker, PostgreSQL, Git ni cuenta de GitHub configurados.
- No tiene cuenta de AWS, ni dominio, ni certificados, ni acceso a SES.
- No sabe qué es una variable de entorno, una migración o un security group.

Por lo tanto:

1. **Nunca asumas que algo está instalado.** Antes de usar una herramienta, verifica y, si falta,
   explica cómo instalarla.
2. **Cada vez que necesites que el humano haga algo fuera del editor** (crear una cuenta, hacer
   clic en una consola web, pegar una credencial, abrir un puerto), **DETENTE** y entrega un
   bloque así:

   ```
   🙋 ACCIÓN REQUERIDA (hazlo tú, yo espero)
   Objetivo: para qué sirve esto, en una frase, sin jerga.
   Pasos:
     1. ...
     2. ...
   Cómo verificar que salió bien: ...
   Qué me tienes que pegar de vuelta: ... (y si es un secreto, dime que lo pegues en .env, no en el chat)
   ```

3. **Comandos exactos, uno por bloque**, indicando siempre en qué carpeta se ejecutan.
4. **Explica el "por qué" en una línea** antes de cada decisión técnica relevante.
5. Al terminar cada fase, entrega un **checklist de verificación manual** ("abre `localhost:5173`,
   deberías ver X, haz clic en Y, debería pasar Z").
6. Si algo puede romper datos reales (borrar la base, resetear migraciones), **pide confirmación
   explícita** antes.
7. Nada de secretos en el código ni en el chat. Siempre `.env` + `.env.example` versionado sin valores.

### Regla #2 — Construcción incremental y verificable

Cada fase debe terminar en un estado **funcional y probado**, no en un esqueleto a medias.
Al final de cada fase: la app corre, los tests pasan, y hay un commit limpio.

---

## 1. Decisión de stack (ya tomada — respétala)

| Capa             | Elección                                                     | Por qué                                                                                                                                                                                             |
| ---------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend cliente | **Vite + React 18 + TypeScript** (SPA instalable como PWA)   | Se despliega como archivos estáticos en S3 + CloudFront: barato, rapidísimo y sin servidor que mantener. Permite transiciones y gestos tipo app nativa sin pelearse con el renderizado en servidor. |
| Frontend admin   | **Vite + React + TypeScript**, app separada                  | Bundle aparte, subdominio aparte (`admin.`), y así el código del admin nunca viaja al navegador del cliente.                                                                                        |
| Backend          | **Node 20 + Express 5 + TypeScript**                         | Es lo pedido y encaja con EC2.                                                                                                                                                                      |
| ORM              | **Prisma**                                                   | Migraciones y tipado automático; la curva de aprendizaje más suave para alguien que empieza.                                                                                                        |
| Base de datos    | **PostgreSQL 16**                                            | Docker en local, contenedor en EC2 al principio, RDS cuando el negocio crezca.                                                                                                                      |
| Validación       | **Zod**, compartido entre front y back vía `packages/shared` | Un solo lugar donde vive la forma de los datos.                                                                                                                                                     |
| Estado servidor  | **TanStack Query**                                           | Caché, reintentos y revalidación sin escribir un reducer.                                                                                                                                           |
| Estilos          | **Tailwind CSS** + tokens propios (sección 6)                | Rápido y consistente.                                                                                                                                                                               |
| Tiempo real      | **SSE (Server-Sent Events)**                                 | Para el seguimiento del pedido en vivo. Más simple que WebSockets detrás de nginx y suficiente porque el flujo es en una sola dirección.                                                            |
| Email            | **Amazon SES**                                               | Transaccionales y campañas. Alternativa si SES tarda en aprobar: **Resend**, detrás de la misma interfaz `EmailProvider`.                                                                           |
| Archivos         | **S3** (privado + URLs prefirmadas)                          | Fotos de productos y CSVs de liquidación.                                                                                                                                                           |
| DNS/TLS          | **Route 53 + ACM + CloudFront**                              | Lo pedido.                                                                                                                                                                                          |
| Cómputo          | **EC2** (Amazon Linux 2023, Docker Compose)                  | Lo pedido.                                                                                                                                                                                          |

**Por qué Vite y no Next.js:** el backend ya es Express, así que el servidor de Next quedaría
duplicando responsabilidades y encareciendo el EC2. La app es un producto transaccional al que la
gente llega desde el link de Instagram y WhatsApp, no desde Google, así que el SEO renderizado en
servidor no paga su costo. Si algún día se quiere posicionar en buscadores o hacer landings de
marketing, se agrega un sitio Next/Astro aparte para contenido y se deja la app como está.
_Cursor: si crees que esta decisión debe revisarse, dilo una vez con argumentos y sigue adelante
con Vite salvo que el humano diga lo contrario._

### Estructura del repositorio (monorepo con pnpm workspaces)

```
cerotres/
├── apps/
│   ├── api/          # Express + Prisma
│   ├── web/          # PWA de clientes
│   └── admin/        # Panel de administración
├── packages/
│   ├── shared/       # tipos, esquemas Zod, constantes, motor de precios
│   └── config/       # eslint, tsconfig, tailwind preset compartidos
├── infra/
│   ├── docker/       # docker-compose de desarrollo y producción
│   └── scripts/      # deploy, backup, restore
├── docs/
└── .cursorrules
```

---

## 2. El negocio (esto es lo que se está modelando)

Cero Tres vende pepitos venezolanos por delivery y pickup. Los pedidos llegan por tres vías:

1. **Directo**: la web que vamos a construir.
2. **Manual**: WhatsApp / Instagram / llamada, cargados por el admin.
3. **PedidosYa**: llegan por la plataforma y **se cargan a mano en el admin**. PedidosYa se
   queda con un **porcentaje de la venta** (ver sección 5, es la parte más delicada del sistema).

### Menú real (úsalo tal cual en el seed)

**Pepitos — $6,50 cada uno.** El precio base incluye **2 extras a elección** y **2 salsas clásicas**.

| Producto         | Descripción                                                 |
| ---------------- | ----------------------------------------------------------- |
| Pepito de Lomito | 200 gr de lomito, pan canilla de 20–22 cm                   |
| Pepito de Pollo  | 200 gr de pollo, pan canilla de 20–22 cm                    |
| Pepito Mixto     | 100 gr de lomito + 100 gr de pollo, pan canilla de 20–22 cm |

**Extras (para pepitos y papas) — $1,50 c/u**

- Gratinado _(mezcla de queso mozzarella y pecorino gratinados)_
- Tocineta Crispy
- Vegetales Grillados _(pimentón y cebolla grillados)_

**Combos — $7,99.** Incluyen pepito + 175 gr de papas fritas + bebida + **2 salsas clásicas** +
**2 salsas de la casa** + **los 3 extras**.

| Combo                  | Contenido        |
| ---------------------- | ---------------- |
| Combo Clásico          | Pepito de Lomito |
| Combo Clásico de Pollo | Pepito de Pollo  |
| Combo Cerotres         | Pepito Mixto     |

**Papas**

| Producto             | Precio | Descripción                                   |
| -------------------- | ------ | --------------------------------------------- |
| Papas fritas         | $2,00  | 175 gr, sal y una salsa clásica               |
| Papas fritas con ajo | $2,50  | 175 gr, sal, ajo en polvo y una salsa clásica |

**Bebidas**

| Producto              | Precio |
| --------------------- | ------ |
| Agua Mineral (330 ml) | $1,50  |
| Refresco en Lata      | $2,50  |

**Salsas**

- **Clásicas — $0,25**: Mayonesa, Ketchup, Salsa de Maíz, BBQ
- **De la casa — $0,50**:
  - _Mayopesto_: cremosa base de la casa con pesto artesanal de albahaca y ajo.
  - _Maíz y Tocineta_: salsa de maíz con el toque ahumado de la tocineta dorada.
  - _Mayocurry_: mayonesa con notas aromáticas y especiadas de curry.

> Los precios y textos anteriores vienen del menú publicado en Instagram. Todos deben ser
> **editables desde el admin**: nada de precios ni descripciones escritos en el código.

---

## 3. El motor de productos y modificadores (el corazón del sistema)

Este es el requisito más importante del catálogo y hay que resolverlo bien desde el principio:

> **Hay un producto principal con su precio, y todo lo demás que se le agrega es opcional.
> Algunos agregados suman precio y otros no.**

Además el negocio ya regala cantidades: el pepito trae 2 extras y 2 salsas clásicas _incluidos_,
y el combo trae los 3 extras y 4 salsas _incluidas_. Lo que pase de esa cantidad, se cobra.

### Modelo

```
modifier_groups
  id, name, description
  selection_type        SINGLE | MULTI
  min_select            (0 = totalmente opcional)
  max_select            (null = sin tope)
  free_quantity         cuántas selecciones van incluidas en el precio base
  free_strategy         HIGHEST_PRICE_FIRST | SELECTION_ORDER   (default: HIGHEST_PRICE_FIRST)
  max_qty_per_option    (default 1; permite "3 x Mayopesto")

modifier_options
  id, group_id, name, description, price_delta, is_available, sort_order

product_modifier_groups        # la misma plantilla de grupo, ajustada por producto
  product_id, group_id, sort_order
  min_select_override, max_select_override, free_quantity_override
```

`product_modifier_groups` es lo que permite reutilizar el grupo **Extras** con
`free_quantity = 2` en los pepitos y `free_quantity = 3` en los combos, sin duplicar opciones.

### Reglas de precio (impleméntalas en `packages/shared/pricing.ts`, con tests)

1. `precio_línea = (precio_base_producto + Σ recargos_de_opciones) × cantidad`
2. Dentro de cada grupo, se ordenan las opciones seleccionadas por `price_delta` **descendente** y
   las primeras `free_quantity` se cobran a **0** (estrategia `HIGHEST_PRICE_FIRST`: el descuento
   siempre favorece al cliente). El resto se cobra a su `price_delta`.
3. Una opción con `price_delta = 0` es gratis siempre y **no consume** cupo gratuito.
4. Todo el dinero se guarda en **enteros de centavos** (`Int`), nunca en `float`.
   El redondeo se hace una sola vez, al final, con `Math.round`.
5. El backend **recalcula siempre** el total desde cero. El precio que manda el frontend es
   informativo; si no coincide, se responde `409 PRICE_MISMATCH` y el carrito se refresca.
6. Cada `order_item` guarda un **snapshot** del nombre, la descripción y el precio del producto y
   de cada opción en el momento del pedido. Cambiar el menú mañana no puede alterar un pedido de ayer.

### Casos de prueba obligatorios (escríbelos como tests antes de la implementación)

| Caso                                             | Esperado                                                  |
| ------------------------------------------------ | --------------------------------------------------------- |
| Pepito de Lomito sin tocar nada                  | $6,50                                                     |
| Pepito + 2 extras (Gratinado, Tocineta)          | $6,50 (ambos entran en el cupo gratis)                    |
| Pepito + 3 extras                                | $8,00 (el tercero cobra $1,50)                            |
| Pepito + 2 salsas clásicas                       | $6,50                                                     |
| Pepito + 3 salsas clásicas                       | $6,75                                                     |
| Pepito + 2 clásicas + 1 Mayopesto                | $7,00 (las de la casa no tienen cupo gratis en el pepito) |
| Combo Cerotres con los 3 extras y 4 salsas (2+2) | $7,99                                                     |
| Combo + 1 salsa de la casa extra                 | $8,49                                                     |
| Papas fritas + Tocineta Crispy                   | $3,50                                                     |
| Grupo con `min_select=1` sin selección           | error de validación `MODIFIER_MIN_NOT_MET`                |

---

## 4. Alcance funcional

### 4.1 App de clientes (`apps/web`)

- **Menú** por categorías con foto, precio y descripción. Sticky de categorías al hacer scroll.
- **Constructor de pepito**: hoja inferior (bottom sheet) donde se eligen extras y salsas, con
  **contador de lo incluido** ("2 extras incluidos · llevas 1") y **precio en vivo** que se
  actualiza mientras se selecciona. Este es el momento estrella de la app.
- **Carrito** persistente en `localStorage`, con barra flotante inferior de "Ver pedido · $X".
- **Upsell** en el carrito: sugerir papas o bebida si no las lleva.
- **Express checkout**: solo **nombre, email y teléfono**. Nada de contraseñas ni registro.
  - Elección **Pickup** o **Delivery**; si es delivery, dirección + zona (con su tarifa) + referencia.
  - Método de pago informado (Pago Móvil, Zelle, efectivo, transferencia) con datos para pagar y
    campo de referencia; el pedido queda "por confirmar pago" hasta que el admin lo marque.
  - Notas del pedido y "para cuándo" (lo antes posible / hora programada).
- **Sesión de invitado**: al crear el pedido se genera un `session_token` opaco guardado en cookie
  `httpOnly` + un `public_code` corto (ej. `03-7KQ4`). Con eso el cliente:
  - ve el **seguimiento en vivo** del pedido (SSE) con los estados y la hora estimada;
  - ve su **historial** de pedidos en ese dispositivo;
  - puede **repetir un pedido** en un toque.
  - El link de seguimiento (`/pedido/03-7KQ4?t=<token>`) se envía por email y sirve desde cualquier
    dispositivo. El token es de un solo pedido, largo y aleatorio, y caduca a los 30 días.
- **Estados visibles al cliente**: Recibido → Confirmado → En preparación → Listo →
  En camino _(solo delivery)_ → Entregado. (Cancelado como estado terminal.)
- **PWA**: manifest, service worker, instalable, splash screen, funciona con conexión mala,
  respeta `safe-area-inset` en iPhone.
- **Extras de venta**: cupones, aviso de local cerrado con horarios, productos agotados marcados,
  botón de WhatsApp, "solo los sábados" como banner de campaña configurable, compartir el pedido.
- **🚫 Prohibido absoluto:** en toda la app de clientes **no puede aparecer nunca** la palabra
  "PedidosYa", ni el canal de venta, ni la comisión, ni nada relacionado. Ver sección 5.4.

### 4.2 Panel de administración (`apps/admin`)

- **Tablero**: ventas del día, pedidos abiertos, ticket promedio, ventas por canal, top productos,
  comparativa directo vs PedidosYa, alertas.
- **Tablero de cocina (KDS)**: columnas por estado, tarjetas grandes, temporizador por pedido,
  sonido al entrar uno nuevo, un toque para avanzar de estado. Pensado para una tablet en la cocina.
- **Pedidos**: listado filtrable, ficha completa, cambio de estado, cobro, cancelación con motivo,
  reembolso, impresión de comanda, y **alta manual de pedidos** eligiendo el canal (aquí es donde
  se cargan los de PedidosYa).
- **Catálogo**: categorías, productos, grupos de modificadores y opciones, fotos a S3,
  disponibilidad ("86" para agotar algo en un toque), orden de aparición, programación de precios.
- **Clientes**: ficha con historial, total gastado, frecuencia, etiquetas, consentimiento de marketing.
- **Marketing**: cupones, campañas de email, banners de la home.
- **Canales y comisiones**: el módulo de la sección 5.
- **Finanzas**: costos por receta, compras, gastos, cuentas por cobrar y por pagar, P&G y flujo de caja
  (misma lógica del Excel que ya tiene el negocio).
- **Configuración**: datos del local, horarios, zonas y tarifas de delivery, tiempos de preparación,
  moneda y tasa de cambio, métodos de pago, impuestos.
- **Usuarios y roles**: `OWNER`, `MANAGER`, `KITCHEN`, `CASHIER`. Permisos por módulo.
  Solo `OWNER` y `MANAGER` ven márgenes, costos y comisiones.
- **Bitácora de auditoría**: quién cambió qué y cuándo, en todo lo sensible.

---

## 5. ⭐ Canales de venta y comisiones con histórico (requisito crítico)

### 5.1 El problema

PedidosYa se queda con un porcentaje de la venta. Ese porcentaje **cambia con el tiempo**.
Cuando el dueño lo cambia, **los pedidos viejos tienen que conservar el porcentaje que tenían**.
Si no, todos los reportes históricos se corrompen en silencio y el negocio pierde la trazabilidad
de su rentabilidad real.

### 5.2 Modelo de datos

```prisma
model SalesChannel {
  id              String   @id @default(cuid())
  code            String   @unique   // DIRECT | WHATSAPP | INSTAGRAM | PHONE | PEDIDOS_YA | ...
  name            String
  isActive        Boolean  @default(true)
  requiresExternalRef Boolean @default(false) // PedidosYa: sí, guarda el código de ellos
  colorHex        String?
  // Este canal NUNCA se expone en la app de clientes
}

model ChannelFeeRate {
  id            String    @id @default(cuid())
  channelId     String
  percent       Decimal   @db.Decimal(7,4)   // 0.2500 = 25%
  fixedFeeCents Int       @default(0)        // costo fijo por pedido, si lo hubiera
  appliesTo     FeeBase                      // SUBTOTAL | SUBTOTAL_PLUS_DELIVERY | ORDER_TOTAL
  effectiveFrom DateTime
  effectiveTo   DateTime?                    // null = tarifa vigente
  note          String?
  createdById   String
  createdAt     DateTime  @default(now())
}
```

- Constraint de exclusión en Postgres (`btree_gist` + `tstzrange`) para que **nunca haya dos
  tarifas solapadas** del mismo canal. Migración SQL a mano:

  ```sql
  CREATE EXTENSION IF NOT EXISTS btree_gist;
  ALTER TABLE "ChannelFeeRate" ADD CONSTRAINT channel_fee_no_overlap
    EXCLUDE USING gist (
      "channelId" WITH =,
      tstzrange("effectiveFrom", COALESCE("effectiveTo", 'infinity'), '[)') WITH &&
    );
  ```

- Al crear una tarifa nueva, se **cierra automáticamente** la anterior poniéndole
  `effectiveTo = nueva.effectiveFrom`, dentro de la misma transacción.
- Se pueden **programar tarifas futuras** (`effectiveFrom` en el futuro).

### 5.3 El snapshot en el pedido (esto es lo que garantiza el histórico)

En la tabla `orders`:

```
channelId                  FK
channelFeeRateId           FK  (qué tarifa se aplicó; para auditar)
externalOrderRef           el código del pedido en PedidosYa
commissionPercentSnapshot  Decimal(7,4)   ← copia del valor, no una referencia
commissionFixedSnapshot    Int
commissionBaseSnapshot     enum FeeBase
commissionBaseAmountCents  Int   sobre cuánto se calculó
commissionAmountCents      Int   cuánto se llevó la plataforma
netPayoutExpectedCents     Int   cuánto debería depositar la plataforma
```

**Reglas que Cursor debe hacer cumplir a nivel de aplicación Y de base de datos:**

1. La tarifa se resuelve **una sola vez**, al crear el pedido, buscando la `ChannelFeeRate` vigente
   para la **fecha del pedido** (no la fecha de hoy). El resultado se **copia** a las columnas de
   snapshot del pedido.
2. Editar una `ChannelFeeRate` o crear una nueva **no toca ni un solo pedido existente**.
   Escribe un test explícito para esto: _"cambiar la comisión de PedidosYa del 25% al 30% no
   modifica `commissionAmountCents` de ningún pedido anterior"_.
3. Trigger en Postgres que **rechace** cualquier `UPDATE` de las columnas de snapshot cuando el
   pedido no está en estado `DRAFT`:

   ```sql
   CREATE OR REPLACE FUNCTION forbid_commission_snapshot_update() RETURNS trigger AS $$
   BEGIN
     IF OLD.status <> 'DRAFT' AND (
          NEW."commissionPercentSnapshot" IS DISTINCT FROM OLD."commissionPercentSnapshot"
       OR NEW."commissionAmountCents"     IS DISTINCT FROM OLD."commissionAmountCents"
       OR NEW."commissionBaseSnapshot"    IS DISTINCT FROM OLD."commissionBaseSnapshot"
     ) THEN
       RAISE EXCEPTION 'El snapshot de comisión de un pedido confirmado es inmutable';
     END IF;
     RETURN NEW;
   END $$ LANGUAGE plpgsql;
   ```

4. Si alguna vez hay que corregir un pedido (la plataforma cobró distinto a lo pactado), **no se
   edita el snapshot**: se registra un `CommissionAdjustment` (monto, motivo, usuario, fecha) que
   los reportes suman aparte. El original queda intacto y auditable.
5. Si un pedido se carga con fecha retroactiva, se usa la tarifa vigente **en esa fecha**, y la UI
   avisa: _"Se aplicará la tarifa del 22% vigente el 3 de marzo"_.

### 5.4 Aislamiento del canal frente al cliente

- Los DTO públicos (`packages/shared/dto/public/*`) **no incluyen** `channel`, `channelId`,
  `commission*`, `externalOrderRef` ni `netPayout*`. Son tipos distintos, no el mismo tipo filtrado.
- Los pedidos creados desde la app siempre nacen con `channel = DIRECT`.
- Solo el admin puede crear pedidos con otro canal.
- **Test de contrato obligatorio**: serializar un pedido de PedidosYa por el endpoint público y
  afirmar que el JSON resultante **no contiene** las cadenas `PEDIDOS_YA`, `commission`,
  `externalOrderRef` ni `netPayout` en ninguna parte.
- **Test de UI**: un `grep` en el build de `apps/web` que falle si aparece "PedidosYa"
  (insensible a mayúsculas y sin espacios) en el bundle. Súmalo al CI.

### 5.5 Módulo "Canales" del admin

1. **Tarifas** — historial completo por canal en línea de tiempo: porcentaje, base de cálculo,
   desde/hasta, quién la creó y por qué. Botón "Nueva tarifa" con fecha de inicio y aviso claro:
   _"Esto aplica solo a pedidos creados desde el 1 de septiembre. Los 342 pedidos anteriores
   mantienen su comisión original."_
2. **Pedidos del canal** — listado con: código externo de PedidosYa, total, base de cálculo,
   % aplicado, comisión, neto esperado, estado de liquidación.
3. **Liquidaciones** — se crea un período (ej. 1–15 de septiembre), el sistema suma el neto
   esperado, se sube el reporte de la plataforma (CSV a S3), se concilia línea por línea y se
   marcan diferencias. Estados: `PENDIENTE`, `CONCILIADA`, `CON DIFERENCIAS`, `COBRADA`.
4. **Reportes** — venta bruta, comisión total, **% de comisión efectiva** del período, neto,
   utilidad después de comisión, y comparativa directo vs PedidosYa (cuánto cuesta realmente
   cada canal).
5. **Simulador** — "si la comisión sube al 30%, ¿cómo quedaría el margen del mes pasado?".
   Es solo una proyección visual: **no escribe nada** en la base.

---

## 6. Dirección visual (app de clientes)

La identidad ya existe en Instagram y hay que respetarla, no reinventarla.

### Lo que se ve en la marca actual

Fondo **granate/vinotinto profundo**, tipografía **crema**, y el logo `03` en **rojo intenso** con
contorno claro, en una tipografía redondeada y rotunda. La palabra "menú" está en una serif gorda
y amable. La comida se fotografía en primer plano, sobre papel encerado, con mucho contraste.

> Los valores de abajo son una **aproximación tomada de las capturas**. Cursor: pídele al dueño el
> logo en SVG/PNG y, si tiene, los colores exactos de marca. Mientras tanto, usa estos.

### Tokens

```css
:root {
  /* Superficies */
  --c-bg: #3e1f1c; /* granate profundo, fondo principal */
  --c-surface: #4e2926; /* tarjetas y hojas */
  --c-surface-2: #5c332f; /* estados hover / elevación */
  --c-ink: #221010; /* casi negro, para texto sobre crema */

  /* Marca */
  --c-cream: #f2e9da; /* texto principal sobre granate */
  --c-cream-dim: #c9b8a4; /* texto secundario */
  --c-red: #e0241b; /* rojo del logo: acción principal */
  --c-red-press: #b81c15;
  --c-gold: #e8b23a; /* acento cálido: destacados, "incluido" */
  --c-success: #4c9a5e;
  --c-danger: #d4483b;

  /* Radios: generosos, tipo app */
  --r-sm: 12px;
  --r-md: 18px;
  --r-lg: 26px;
  --r-pill: 999px;
}
```

### Tipografía

- **Display** (nombres de productos, precios, títulos): **Fraunces** variable, con los ejes
  `SOFT` alto y `WONK` activado, peso 700–900. Es lo más cercano libre a la serif gorda y
  redondeada del menú de Instagram.
- **Texto e interfaz**: **Plus Jakarta Sans** (400/500/600/700). Legible, neutra, moderna.
- Los **precios** siempre en Fraunces con cifras tabulares, para que no bailen al actualizarse.
- Nada de mayúsculas sostenidas en párrafos; sí en etiquetas cortas ("INCLUIDO", "AGOTADO").

### Reglas de sensación "app"

- Barra de navegación **inferior** con 4 destinos: Menú · Pedido · Seguimiento · Cuenta.
- **Bottom sheets** para el constructor de producto, no páginas nuevas. Con arrastre para cerrar.
- Barra flotante de carrito anclada abajo, sobre la nav, con el total animado al cambiar.
- Transiciones cortas (180–240 ms), con curva de salida suave. Nunca animes el color del texto.
- **Esqueletos de carga**, jamás spinners centrados.
- Feedback táctil: escala 0.97 al presionar, y `navigator.vibrate(8)` donde exista.
- `100dvh`, `overscroll-behavior: contain`, `env(safe-area-inset-bottom)` en toda barra fija.
- **Respeta `prefers-reduced-motion`** y mantén foco de teclado visible. Contraste AA como piso.

### El elemento firma

El **constructor de pepito**: la hoja inferior donde, mientras eliges extras y salsas, se van
apilando etiquetas sobre una foto del pepito y el precio sube en vivo, con el contador de
"incluidos" gastándose visualmente (2 · 1 · 0 → a partir de ahí aparece el "+$1,50" en dorado).
Es el único lugar donde la interfaz se permite ser llamativa; todo lo demás se mantiene sobrio.

### Admin

El admin **no** usa el granate. Fondo neutro claro, alta densidad de información, tablas legibles,
tipografía de interfaz a 14 px. Es una herramienta de trabajo, no una pieza de marca. Lo único que
comparte con el cliente son los colores de estado y el rojo de marca para acciones destructivas.

---

## 7. Emails (SES)

### Transaccionales (disparados por eventos)

Confirmación de pedido · Pago confirmado · En preparación · Listo para retirar · En camino ·
Entregado (con pedido de reseña) · Cancelado · Link de seguimiento.

### Campañas masivas

- Segmentos: todos, compradores del último mes, inactivos 60+ días, mayor ticket, por producto favorito.
- Editor simple (asunto, imagen, texto, botón), plantilla con la identidad de la marca.
- Envío por lotes con control de tasa, respetando el límite de envío de SES.
- **Obligatorio**: consentimiento de marketing por cliente, link de baja en cada email,
  procesamiento de rebotes y quejas vía SNS → webhook, y lista de supresión propia.
  Un cliente dado de baja **nunca** vuelve a recibir marketing (los transaccionales sí).
- Métricas: enviados, entregados, aperturas, clics, rebotes, bajas.

Todo detrás de una interfaz `EmailProvider` con implementaciones `SesProvider` y `ConsoleProvider`
(esta última para desarrollo: imprime el email en la terminal y no envía nada).

---

## 8. Seguridad y calidad (no negociable)

- Rate limiting en endpoints públicos, especialmente crear pedido y reenviar link.
- Zod validando **toda** entrada; nunca confiar en el cliente para precios, totales ni estados.
- Tokens de sesión de invitado: 32 bytes aleatorios, **hasheados en la base**, cookie `httpOnly`
  `Secure` `SameSite=Lax`, con expiración.
- Admin: JWT de acceso corto + refresh en cookie `httpOnly`, contraseñas con `argon2`, bloqueo tras
  intentos fallidos, y 2FA (TOTP) al menos para `OWNER`.
- Helmet, CORS con lista blanca de orígenes, límite de tamaño de body.
- Todo cambio sensible a la **bitácora de auditoría**.
- Idempotencia con `Idempotency-Key` al crear pedidos (evita duplicados si el cliente toca dos veces).
- Migraciones versionadas; nunca `db push` en producción.
- Tests: Vitest para el motor de precios y comisiones, Supertest para la API, Playwright para dos
  flujos críticos (pedido completo de cliente, alta de pedido PedidosYa en admin).
- Logs estructurados (pino) con `requestId`, y errores a Sentry.

---

## 9. Lo que se despliega en AWS

```
Route 53 (cerotres.com)
 ├── cerotres.com          → CloudFront → S3 (apps/web, estático)
 ├── admin.cerotres.com    → CloudFront → S3 (apps/admin, estático)
 └── api.cerotres.com      → EC2 (Elastic IP) → nginx → contenedor de la API
                                              └── contenedor PostgreSQL + volumen
S3: cerotres-assets (privado, URLs prefirmadas) — fotos y CSVs de liquidación
SES: dominio verificado, DKIM, envío transaccional y campañas
ACM: certificados (los de CloudFront se emiten en us-east-1)
Backups: pg_dump nocturno → S3 con versionado y ciclo de vida
```

Se arranca con PostgreSQL en contenedor sobre el mismo EC2 (una instancia pequeña, costo mínimo)
y se documenta la ruta de migración a **RDS** para cuando el volumen lo justifique. Cursor debe
dejar esa migración escrita en `docs/` desde el principio.

---

## 10. Orden de construcción

| Fase | Qué se logra                                                                       |
| ---- | ---------------------------------------------------------------------------------- |
| 0    | Preparar la máquina y las cuentas (todo lo hace el humano, guiado)                 |
| 1    | Monorepo, herramientas, "hola mundo" corriendo en local                            |
| 2    | Base de datos, esquema completo, migraciones y seed con el menú real               |
| 3    | Autenticación de admin y sesiones de invitado                                      |
| 4    | Catálogo + motor de modificadores y precios, con tests                             |
| 5    | App de clientes: menú, constructor, carrito, express checkout, seguimiento en vivo |
| 6    | Admin: pedidos, KDS, estados, alta manual                                          |
| 7    | **Canales y comisiones (PedidosYa)** + liquidaciones                               |
| 8    | Emails: transaccionales y campañas                                                 |
| 9    | Finanzas y reportes (costos, compras, gastos, P&G, flujo de caja)                  |
| 10   | Despliegue en AWS con dominio y HTTPS                                              |
| 11   | Endurecimiento: backups, monitoreo, límites, respaldo y restauración probados      |

Cada fase tiene su prompt en `01-PROMPTS-POR-FASE.md`. **No adelantes fases.**

---

## 11. Cómo debes responder, Cursor

1. Antes de codificar una fase, **resume en 5 líneas** lo que vas a hacer y espera el "dale".
2. Si algo del brief es ambiguo, **pregunta antes**, con opciones concretas y tu recomendación.
3. Nada de código que no se pueda ejecutar. Nada de `TODO` en el camino feliz.
4. Al terminar, entrega: qué se creó, cómo probarlo a mano, qué falta, y el mensaje de commit sugerido.
5. Habla en **español**, claro y sin jerga innecesaria. El código y los identificadores en **inglés**.
