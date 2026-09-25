# Cero Tres

Plataforma de pedidos online + panel de administraciÃ³n para la dark kitchen **Cero Tres**.

## Requisitos

- Node **20** (recomendado con `fnm`)
- **pnpm** 9 (`corepack prepare pnpm@9.15.9 --activate`)
- **Docker Desktop** (para PostgreSQL)

## Arranque rÃ¡pido

Desde la raÃ­z del repo:

```bash
pnpm install
pnpm db:up
pnpm --filter @cerotres/api exec -- cp -n .env.example .env
pnpm --filter @cerotres/web exec -- cp -n .env.example .env
pnpm --filter @cerotres/admin exec -- cp -n .env.example .env
pnpm --filter @cerotres/shared build
pnpm dev
```

En Windows (PowerShell), si `cp -n` no existe, copia a mano:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env
Copy-Item apps/admin/.env.example apps/admin/.env
```

## URLs locales

| App           | URL                                        |
| ------------- | ------------------------------------------ |
| Cliente (PWA) | http://localhost:5173                      |
| Admin         | http://localhost:5174                      |
| API health    | http://localhost:3000/health               |
| Postgres      | `localhost:15432` user/pass/db: `cerotres` |

## Scripts Ãºtiles

| Comando                       | QuÃ© hace                     |
| ----------------------------- | ----------------------------- |
| `pnpm dev`                    | API + web + admin en paralelo |
| `pnpm build`                  | Build de todos los paquetes   |
| `pnpm lint`                   | ESLint en el monorepo         |
| `pnpm db:up` / `pnpm db:down` | Sube/baja Postgres con Docker |

## Estructura

```
apps/api      Express + TypeScript
apps/web      PWA de clientes (Vite + React)
apps/admin    Panel de administraciÃ³n
packages/shared   Tipos y esquemas Zod compartidos
packages/config   tsconfig / eslint / tailwind compartidos
infra/docker      docker-compose (Postgres 16)
docs/             briefs y prompts por fase
```
