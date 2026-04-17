# SincroStock — Sincronización de Stock Multi-Marketplace

Sincroniza automáticamente el stock entre **Bsale** y los marketplaces **Paris**, **Falabella** y **Ripley**.

## ¿Cómo funciona?

- **Cada 15 minutos**: cron job que lee el stock de Bsale y actualiza los 3 marketplaces
- **Venta en marketplace → webhook → descuento en Bsale** automático
- **Cambio en Bsale → webhook → actualización en marketplaces** en tiempo real
- **Dashboard web** para monitorear el estado, ver logs y configurar las APIs

## Stack

- Next.js 14 (App Router) + TypeScript
- Prisma + PostgreSQL
- node-cron
- Tailwind CSS

## Deploy en Railway (recomendado)

1. Haz fork de este repo en GitHub
2. Ve a [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Agrega un plugin **PostgreSQL** en el proyecto
4. Railway detecta el `railway.json` automáticamente
5. En **Variables**, Railway agrega `DATABASE_URL` automáticamente desde el plugin
6. En el primer deploy, Railway ejecuta `prisma migrate deploy` automáticamente

### Variables de entorno requeridas

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Railway lo genera automáticamente con el plugin PostgreSQL |

Las credenciales de APIs (Bsale, Paris, Falabella, Ripley) se configuran desde la **interfaz web** en `/settings`, no como variables de entorno.

## Desarrollo local

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar base de datos local en .env
cp .env.example .env
# Edita DATABASE_URL con tu PostgreSQL local

# 3. Crear tablas
npm run db:push

# 4. Iniciar servidor
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000)

## URLs de Webhooks

Configura estas URLs en cada marketplace:

| Plataforma | URL |
|---|---|
| Bsale (stock changes) | `https://tu-app.railway.app/api/webhooks/bsale` |
| Paris (órdenes) | `https://tu-app.railway.app/api/webhooks/paris` |
| Falabella (órdenes) | `https://tu-app.railway.app/api/webhooks/falabella` |
| Ripley (órdenes) | `https://tu-app.railway.app/api/webhooks/ripley` |

## Estructura del proyecto

```
├── app/
│   ├── (app)/              # Páginas con sidebar
│   │   ├── dashboard/      # Panel principal + sync manual
│   │   ├── stock/          # Tabla de stock comparativa
│   │   ├── settings/       # Configuración de API keys
│   │   └── logs/           # Historial de sincronizaciones
│   └── api/
│       ├── webhooks/       # Endpoints para cada marketplace
│       ├── sync/           # Sync manual POST
│       ├── dashboard/      # Datos del dashboard
│       ├── stock/          # Listado de stock
│       └── logs/           # Historial de logs
├── lib/
│   ├── bsale.ts            # API Bsale
│   ├── paris.ts            # API Paris/Cencosud
│   ├── falabella.ts        # API Falabella
│   ├── ripley.ts           # API Ripley/Mirakl
│   ├── sync.ts             # Lógica de sincronización
│   ├── cron.ts             # Cron job 15 min
│   └── db.ts               # Cliente Prisma
├── components/
│   └── Sidebar.tsx
├── prisma/
│   └── schema.prisma
├── instrumentation.ts      # Inicia el cron al arrancar
└── railway.json            # Config de deploy
```
