# PROMPTS POR FASE — Cero Tres

> **Cómo se usa:** una fase a la vez. Abre Cursor en modo **Agent**, escribe `@00-PROMPT-MAESTRO.md`
> para adjuntar el contexto, y pega el prompt de la fase. No pases a la siguiente hasta que el
> checklist de la fase esté en verde.

---

## FASE 0 — Preparar tu máquina y tus cuentas

Esta fase **la haces tú**, no Cursor. Pero puedes pegarle esto para que te acompañe:

> **PROMPT:**
> Guíame paso a paso para dejar mi computadora lista para este proyecto. No asumas que tengo nada
> instalado. Detecta mi sistema operativo, dime qué comando correr, y después de cada paso dime cómo
> verificar que quedó bien. Necesito: Git, Node 20 LTS (con nvm o fnm), pnpm, Docker Desktop, y una
> cuenta de GitHub con un repositorio privado llamado `cerotres` ya conectado a esta carpeta.
> Ve de uno en uno y espera mi confirmación antes de seguir al siguiente.

### Lo que tienes que conseguir por tu cuenta (en paralelo, tarda días en aprobarse)

| Qué                                                | Dónde                                    | Por qué corre prisa                                                                                                     |
| -------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Cuenta de AWS con facturación y MFA                | aws.amazon.com                           | Base de todo el despliegue                                                                                              |
| Dominio (`cerotres.com` o el que elijas)           | Route 53 o donde ya lo tengas            | Se necesita para HTTPS y para los emails                                                                                |
| **Salida del sandbox de SES**                      | Consola de AWS → SES → Account dashboard | **Puede tardar 24–72 h.** Sin esto solo puedes enviar emails a direcciones que verifiques a mano. Pídelo el primer día. |
| Logo en SVG o PNG con fondo transparente           | Tu diseñador / archivos de la marca      | Cursor lo necesita para la interfaz                                                                                     |
| Fotos de los productos en buena calidad            | Las que ya usas en Instagram             | Una por producto, mínimo                                                                                                |
| Datos de pago que verá el cliente                  | Pago Móvil, Zelle, transferencia         | Van en la pantalla de checkout                                                                                          |
| Zonas de delivery y su tarifa                      | Tú los defines                           | Ej: Centro $1,50 · Este $2,50                                                                                           |
| Horarios de atención                               | Tú los defines                           | Para cerrar la tienda automáticamente                                                                                   |
| El **% actual de PedidosYa** y desde cuándo aplica | Tu contrato con ellos                    | Es la primera tarifa que se carga en el sistema                                                                         |

> ⚠️ **Guarda las credenciales de AWS en un gestor de contraseñas.** Nunca las pegues en el chat de
> Cursor ni en un archivo del repositorio. Cursor te va a decir siempre que las pongas en `.env`.

**Checklist:** `git --version`, `node -v` (v20.x), `pnpm -v`, `docker ps` responden sin error, y el
repositorio privado en GitHub existe y está vinculado.

---

## FASE 1 — Monorepo y andamiaje

> **PROMPT:**
> Fase 1. Crea el monorepo con pnpm workspaces según la estructura de `@00-PROMPT-MAESTRO.md`
> sección 1: `apps/api`, `apps/web`, `apps/admin`, `packages/shared`, `packages/config`, `infra`, `docs`.
>
> Requisitos:
>
> - TypeScript estricto en todo, con `tsconfig` base compartido en `packages/config`.
> - ESLint + Prettier + Husky con `lint-staged` en pre-commit.
> - `apps/api`: Express 5 + TypeScript, `tsx watch` en desarrollo, healthcheck en `GET /health`,
>   logs con pino, manejo de errores centralizado y tipado, CORS por lista blanca.
> - `apps/web` y `apps/admin`: Vite + React + TS + Tailwind + React Router + TanStack Query.
>   En `apps/web` deja instalado y configurado `vite-plugin-pwa`.
> - `packages/shared`: exporta un tipo y un esquema Zod de prueba, consumidos por las tres apps,
>   para demostrar que el workspace funciona.
> - `docker-compose.yml` en `infra/docker` con PostgreSQL 16 y un volumen persistente.
> - `.env.example` en cada app, versionado. `.env` en `.gitignore`.
> - `README.md` con los comandos para levantar todo.
> - Un solo comando en la raíz (`pnpm dev`) que levante API, web y admin a la vez.
> - Crea el archivo `.cursorrules` que te voy a pasar aparte.
>
> Al terminar, dame el checklist de verificación manual y el mensaje de commit.

**Checklist:** `pnpm dev` levanta las tres cosas · `localhost:5173` (web) y `localhost:5174` (admin)
cargan · `curl localhost:3000/health` responde `{"status":"ok"}` · `docker ps` muestra Postgres arriba.

---

## FASE 2 — Base de datos, esquema y menú real

> **PROMPT:**
> Fase 2. Configura Prisma en `apps/api` contra el Postgres de Docker y modela el esquema completo
> descrito en `@00-PROMPT-MAESTRO.md`. Incluye al menos:
>
> `AdminUser`, `Customer`, `CustomerAddress`, `GuestSession`, `Category`, `Product`,
> `ModifierGroup`, `ModifierOption`, `ProductModifierGroup`, `Order`, `OrderItem`,
> `OrderItemOption`, `OrderStatusEvent`, `Payment`, `Coupon`, `DeliveryZone`, `StoreSetting`,
> `StoreHours`, `SalesChannel`, `ChannelFeeRate`, `CommissionAdjustment`, `Settlement`,
> `SettlementLine`, `EmailTemplate`, `EmailCampaign`, `EmailRecipient`, `EmailEvent`,
> `Ingredient`, `RecipeItem`, `Purchase`, `PurchaseItem`, `Expense`, `AuditLog`.
>
> Reglas obligatorias:
>
> - **Todo el dinero en `Int` de centavos.** Ningún `Float` en el esquema.
> - Todos los porcentajes en `Decimal(7,4)`.
> - Timestamps `createdAt`/`updatedAt` en todas las tablas, y borrado lógico (`deletedAt`) donde
>   tenga sentido.
> - Migración SQL adicional con la extensión `btree_gist`, el constraint de exclusión de
>   `ChannelFeeRate` y el trigger de inmutabilidad del snapshot de comisión
>   (los tienes escritos en la sección 5 del brief; cópialos tal cual).
> - Índices en todo lo que se va a filtrar: `Order.createdAt`, `Order.status`, `Order.channelId`,
>   `Order.publicCode` (único), `Customer.email` (único), `Product.categoryId`.
>
> Después crea `prisma/seed.ts` con el **menú real** de la sección 2 del brief: los 3 pepitos, los 3
> combos, las 2 papas, las 2 bebidas, el grupo de Extras ($1,50), el de Salsas Clásicas ($0,25) y el
> de Salsas de la Casa ($0,50), con los `free_quantity` correctos por producto
> (pepitos: 2 extras + 2 clásicas · combos: 3 extras + 2 clásicas + 2 de la casa · papas: 1 clásica).
> Siembra también: los canales de venta (DIRECT, WHATSAPP, INSTAGRAM, PHONE, PEDIDOS_YA), un usuario
> OWNER con contraseña que yo te dé, y zonas de delivery de ejemplo.
>
> Pregúntame el % actual de PedidosYa y desde qué fecha aplica, y crea esa primera `ChannelFeeRate`.
> Deja Prisma Studio funcionando para que yo pueda ver los datos.

**Checklist:** `pnpm --filter api prisma migrate dev` corre sin error · `pnpm --filter api prisma studio`
abre y se ven los 10 productos con sus modificadores · intentar insertar dos tarifas solapadas del
mismo canal falla con error de constraint.

---

## FASE 3 — Autenticación

> **PROMPT:**
> Fase 3. Implementa autenticación:
>
> **Admin:** login con email + contraseña (argon2), JWT de acceso de 15 min + refresh token en cookie
> `httpOnly` `Secure` `SameSite=Lax` con rotación, logout, middleware de roles
> (`OWNER`, `MANAGER`, `KITCHEN`, `CASHIER`), bloqueo tras 5 intentos fallidos y TOTP opcional para OWNER.
>
> **Invitado (express checkout):** al crear un pedido se genera un `sessionToken` de 32 bytes
> aleatorios, se guarda **hasheado** en `GuestSession` y se devuelve en cookie `httpOnly` + en el link
> de seguimiento. Un middleware `resolveGuest` lo valida y expone el cliente y sus pedidos.
> Expira a los 30 días. Endpoint para reenviar el link de seguimiento al email (con rate limit fuerte).
>
> Monta el layout del admin con login funcional, rutas protegidas y un dashboard vacío.
> Escribe tests de la lógica de tokens y de los guards de rol.

**Checklist:** entrar al admin con el usuario del seed · una ruta protegida rebota si no hay sesión ·
el rol KITCHEN no puede ver una ruta de OWNER · el refresh token renueva sin desloguear.

---

## FASE 4 — Catálogo y motor de precios

> **PROMPT:**
> Fase 4. Implementa el catálogo y el motor de modificadores según la sección 3 de
> `@00-PROMPT-MAESTRO.md`.
>
> Empieza por `packages/shared/pricing.ts` y **escribe primero los tests** con la tabla de casos del
> brief (los 10 casos, incluido el combo a $7,99 con los 3 extras y las 4 salsas). Solo después
> implementa. Usa aritmética entera en centavos, aplica el cupo gratuito por
> `HIGHEST_PRICE_FIRST` y valida `min_select`/`max_select` devolviendo errores tipados.
>
> Luego:
>
> - API de catálogo: CRUD de categorías, productos, grupos de modificadores, opciones y la relación
>   producto↔grupo con sus overrides. Endpoint público `GET /api/public/menu` que devuelva el menú
>   completo en una sola llamada, ya ordenado y sin campos internos.
> - Subida de imágenes a S3 con URLs prefirmadas. En desarrollo, usa almacenamiento local detrás de la
>   misma interfaz `StorageProvider` para no depender de AWS todavía.
> - Interfaz de catálogo en el admin: listas ordenables por arrastre, edición en panel lateral,
>   interruptor de disponibilidad ("86") con efecto inmediato en el menú público.
>
> Enséñame en el admin cómo cambiar el precio del Pepito de Lomito y que se refleje en el menú público.

**Checklist:** todos los tests de precios en verde · cambiar un precio en admin se ve en
`GET /api/public/menu` · marcar un producto agotado lo saca del menú · subir una foto funciona.

---

## FASE 5 — App de clientes

> **PROMPT:**
> Fase 5. Construye `apps/web` completa, siguiendo la dirección visual de la sección 6 de
> `@00-PROMPT-MAESTRO.md`. Antes de codificar, muéstrame en texto tu plan de diseño: paleta final,
> tipografías, y un wireframe en ASCII de las 4 pantallas principales. Espera mi visto bueno.
>
> Pantallas: Menú · Constructor de producto (bottom sheet) · Carrito · Checkout express ·
> Seguimiento del pedido · Mis pedidos.
>
> Puntos críticos:
>
> - El **constructor** es el elemento firma: contador de incluidos gastándose, precio en vivo,
>   el recargo aparece en dorado solo cuando se pasa del cupo.
> - **Checkout express**: solo nombre, email y teléfono. Sin registro ni contraseña.
>   Pickup o Delivery (con zona y tarifa). Método de pago informado + referencia. Notas.
> - Al confirmar: se crea el pedido, se genera el `publicCode` (formato `03-XXXX`), se abre la sesión
>   de invitado y se redirige al seguimiento.
> - **Seguimiento en vivo por SSE** en `/api/public/orders/:code/stream`, con reconexión automática
>   y respaldo por polling cada 15 s si el navegador corta el stream.
> - Carrito persistente, PWA instalable, esqueletos de carga, `safe-area-inset`,
>   `prefers-reduced-motion` respetado, foco de teclado visible.
> - Tienda cerrada fuera de horario, con el próximo horario de apertura y opción de pedido programado.
>
> **Recordatorio de la regla más importante:** en toda esta app no puede existir ninguna referencia a
> PedidosYa, al canal de venta ni a comisiones. Agrega al CI el chequeo del bundle que describe el brief.

**Checklist:** hacer un pedido completo desde el teléfono · el precio del constructor coincide con el
que calcula el backend · cambiar el estado desde la base se ve en la pantalla de seguimiento sin
recargar · la app se instala en el teléfono · el `grep` del bundle no encuentra "pedidosya".

---

## FASE 6 — Admin de pedidos y tablero de cocina

> **PROMPT:**
> Fase 6. Construye el módulo de pedidos del admin:
>
> - **Listado** con filtros (fecha, estado, canal, tipo de entrega, texto libre), paginado del lado
>   del servidor y exportación a CSV.
> - **Ficha del pedido**: ítems con sus modificadores, totales desglosados, historial de estados con
>   hora y usuario, datos del cliente, cobros, notas internas.
> - **Cambio de estado** con transiciones válidas (no se puede pasar de Recibido a Entregado saltando
>   pasos), motivo obligatorio al cancelar, y registro en `OrderStatusEvent`.
> - **KDS (tablero de cocina)**: columnas por estado, tarjetas grandes legibles a un metro,
>   temporizador desde que entró el pedido que cambia de color al pasar el tiempo objetivo, sonido al
>   entrar uno nuevo, actualización por SSE, y un toque para avanzar. Optimizado para tablet horizontal.
> - **Alta manual de pedidos**: mismo constructor de productos que el cliente, pero con selector de
>   **canal de venta** y, si el canal lo requiere, campo obligatorio de referencia externa.
>   Permite fecha retroactiva (y avisa qué tarifa se aplicará).
> - **Impresión de comanda** en formato ticket 80 mm vía CSS `@media print`.
>
> Escribe tests de la máquina de estados.

**Checklist:** crear un pedido manual de WhatsApp · avanzarlo por todos los estados · verlo aparecer en
el KDS en tiempo real · el cliente ve el cambio en su seguimiento · imprimir la comanda sale bien.

---

## FASE 7 — ⭐ Canales, comisiones y liquidaciones

> **PROMPT:**
> Fase 7. Implementa el módulo de canales y comisiones descrito en la sección 5 de
> `@00-PROMPT-MAESTRO.md`. Esta es la fase más delicada del proyecto: **escribe los tests primero.**
>
> Tests obligatorios antes de implementar:
>
> 1. Crear un pedido de PedidosYa con la tarifa vigente copia bien el snapshot.
> 2. Cambiar la tarifa del 25% al 30% **no altera** ni un solo pedido anterior.
> 3. Un pedido con fecha retroactiva toma la tarifa que estaba vigente **esa** fecha.
> 4. Intentar dos tarifas solapadas del mismo canal falla a nivel de base de datos.
> 5. Intentar actualizar el snapshot de un pedido confirmado lanza la excepción del trigger.
> 6. El serializador público **no expone** canal, comisión, referencia externa ni neto.
> 7. Con `appliesTo = SUBTOTAL` la comisión ignora el costo de delivery; con
>    `SUBTOTAL_PLUS_DELIVERY` lo incluye.
>
> Luego construye la interfaz:
>
> - **Tarifas por canal** en línea de tiempo, con quién la creó y por qué. Al crear una nueva, cierra
>   la anterior en la misma transacción y muestra el aviso: _"Aplica solo desde el {fecha}.
>   Los {N} pedidos anteriores mantienen su comisión original."_
> - **Pedidos de PedidosYa** con código externo, base, % aplicado, comisión, neto esperado y estado de
>   liquidación.
> - **Liquidaciones**: crear período, calcular neto esperado, subir el CSV de la plataforma a S3,
>   conciliar línea por línea, marcar diferencias y cerrar.
> - **Reportes**: bruto, comisión, % efectivo, neto, utilidad después de comisión, y comparativa
>   directo vs PedidosYa.
> - **Simulador** de cambio de comisión (solo lectura, no escribe nada).
> - **Ajustes de comisión** (`CommissionAdjustment`) para cuando la plataforma cobre distinto:
>   nunca se edita el snapshot original.

**Checklist:** los 7 tests en verde · cambiar la comisión y confirmar que un pedido de la semana pasada
sigue con su porcentaje viejo · conciliar una liquidación de prueba · el JSON público de un pedido de
PedidosYa no contiene ni una pista del canal.

---

## FASE 8 — Emails

> **PROMPT:**
> Fase 8. Implementa el sistema de emails de la sección 7 de `@00-PROMPT-MAESTRO.md`.
>
> - Interfaz `EmailProvider` con `SesProvider` y `ConsoleProvider` (desarrollo).
> - Plantillas responsive con la identidad de la marca, en React Email o MJML.
> - **Transaccionales** disparados por eventos de pedido, encolados (usa una tabla `EmailQueue` con
>   reintentos y backoff; no metas Redis todavía) para que un fallo de SES no tumbe un pedido.
> - **Campañas**: segmentos, editor, programación, envío por lotes respetando el límite de SES.
> - **Consentimiento y bajas**: campo de consentimiento por cliente, link de baja firmado en cada
>   email de marketing, página pública de baja, y lista de supresión propia que se consulta **antes**
>   de cada envío.
> - Webhook de SNS para rebotes y quejas, que marca el email como no enviable automáticamente.
> - Métricas por campaña.
>
> Antes de tocar SES, dime exactamente qué tengo que configurar en la consola de AWS
> (verificar dominio, DKIM, registros en Route 53, salir del sandbox) y espera a que te confirme.

**Checklist:** hacer un pedido y recibir el email de confirmación · el link de seguimiento del email
abre el pedido en otro dispositivo · enviar una campaña de prueba a 3 direcciones · darse de baja
funciona y el siguiente envío la excluye.

---

## FASE 9 — Finanzas y reportes

> **PROMPT:**
> Fase 9. Implementa el módulo financiero, replicando la lógica del Excel que ya usa el negocio:
>
> - **Insumos e inventario**: costo promedio ponderado calculado desde las compras, último costo,
>   stock (inicial + compras − consumo por recetas − mermas), alerta de reposición.
> - **Recetas**: qué insumos lleva cada producto y en qué cantidad, para obtener el **costo real** y
>   el **food cost %** de cada ítem del menú.
> - **Compras** con condición contado/crédito → cuentas por pagar.
> - **Gastos** por categoría → cuentas por pagar y P&G.
> - **Mermas**.
> - **P&G mensual**: ventas netas, costo de ventas, comisiones de plataformas, costo de delivery,
>   mermas, utilidad bruta, gastos operativos, utilidad neta y márgenes.
> - **Flujo de caja** mensual con saldo acumulado.
> - **Cuentas por cobrar y por pagar** con antigüedad de saldos.
> - **Punto de equilibrio**.
> - Exportación a Excel de cada reporte.
>
> Importante: el costo de ventas de un pedido también se **congela** al momento del pedido, igual que
> la comisión. Cambiar el costo de un insumo mañana no puede alterar el margen histórico.

**Checklist:** el food cost de un pepito coincide con el cálculo a mano · el P&G del mes cuadra con la
suma de los pedidos · cambiar el costo de la carne no altera el margen de un pedido de la semana pasada.

---

## FASE 10 — Despliegue en AWS

> **PROMPT:**
> Fase 10. Vamos a desplegar. Recuerda que no he configurado nada en AWS. Guíame de una en una,
> esperando mi confirmación en cada acción, y dime exactamente dónde hacer clic:
>
> 1. Usuario IAM con permisos mínimos y llaves de acceso (nada de usar la cuenta raíz).
> 2. Zona alojada en Route 53 y apuntar el dominio.
> 3. Bucket S3 `cerotres-assets` privado, con CORS y política correctas.
> 4. Buckets y distribuciones CloudFront para `apps/web` y `apps/admin`, con certificados ACM
>    emitidos en `us-east-1` y redirección de todas las rutas a `index.html` (es una SPA).
> 5. EC2 t3.small con Amazon Linux 2023, Elastic IP, security group que solo abra 22 (a mi IP),
>    80 y 443, y llave SSH.
> 6. Docker + Docker Compose en el servidor: contenedor de la API, contenedor de PostgreSQL con
>    volumen persistente, y **Caddy** como proxy inverso (obtiene el HTTPS solo, es más simple que
>    nginx + certbot). Configura `proxy_buffering off` equivalente para que el SSE funcione.
> 7. `api.cerotres.com` apuntando al Elastic IP.
> 8. SES: verificar dominio, DKIM, registros en Route 53 y solicitud de salida del sandbox.
> 9. Script de despliegue en `infra/scripts/deploy.sh` y un workflow de GitHub Actions que
>    construya, corra los tests, suba los estáticos a S3, invalide CloudFront y actualice la API.
> 10. Variables de entorno de producción y cómo cargarlas de forma segura.
>
> Documenta todo en `docs/deploy.md` y dime el costo mensual aproximado antes de crear cada recurso.

**Checklist:** `https://cerotres.com` carga con candado · `https://admin.cerotres.com` pide login ·
`https://api.cerotres.com/health` responde · el seguimiento en vivo funciona en producción · un push a
`main` despliega solo.

---

## FASE 11 — Endurecimiento y respaldo

> **PROMPT:**
> Fase 11. Deja el sistema listo para operar de verdad:
>
> - `pg_dump` nocturno a S3 con versionado y ciclo de vida (30 días), y **prueba de restauración
>   documentada**: quiero que me guíes para restaurar un backup en local y confirmar que funciona.
> - Sentry para errores en las tres apps, y logs de la API rotados.
> - Rate limiting afinado por endpoint. Cabeceras de seguridad con Helmet.
> - Monitoreo de disponibilidad con alerta a mi email si `/health` falla.
> - Alarma de facturación en AWS.
> - `docs/runbook.md`: qué hacer si se cae el servidor, si se llena el disco, si SES bloquea el envío,
>   cómo restaurar la base y cómo revertir un despliegue.
> - Repasa el proyecto completo y dame una lista priorizada de riesgos técnicos pendientes.

**Checklist:** un backup restaurado en local y verificado · un error provocado a propósito llega a
Sentry · la alarma de facturación existe · el runbook está escrito.

---

## Después del lanzamiento — ideas ya previstas en el modelo de datos

Programa de puntos y referidos · notificaciones push (PWA) · pedidos programados y recurrentes ·
reseñas por pedido · combos dinámicos y promos por horario ("solo los sábados") · códigos QR en el
empaque · integración de pagos en línea · app de repartidor con seguimiento en mapa ·
predicción de demanda con el histórico para comprar mejor.

---

## Errores comunes que Cursor suele cometer aquí — vigílalos

1. Guardar dinero en `Float`. Siempre centavos enteros.
2. Calcular la comisión leyendo la tarifa vigente _hoy_ en vez del snapshot del pedido. Es el bug
   más peligroso del sistema y es silencioso.
3. Reutilizar el mismo tipo TypeScript para el DTO público y el interno. Tienen que ser tipos distintos.
4. Confiar en el total que envía el frontend.
5. Olvidar el `free_quantity` por producto y cobrar los extras incluidos del combo.
6. No congelar el nombre y precio del producto en el `order_item`.
7. Dejar el SSE roto detrás del proxy inverso por el buffering.
8. Meter la palabra "PedidosYa" en un componente compartido que termina en el bundle del cliente.
