# Development & Deployment Setup Guide

## Quick Start (Local Development)

### Prerequisites
- **Node.js 20+** (LTS)
- **PostgreSQL 16+** and **Redis 7+** (see options below)

### Option 1: Docker (Easiest Local)
```bash
docker compose up -d
```

### Option 2: Cloud Databases (No Local Install)
| Service | PostgreSQL | Redis |
|---------|-----------|-------|
| **Neon** | ✅ Serverless, free tier | - |
| **Supabase** | ✅ Free tier | - |
| **Railway** | ✅ Plugin | ✅ Plugin |
| **Upstash** | - | ✅ Serverless, free tier |
| **Redis Cloud** | - | ✅ Free tier |

### Option 3: Local Installation
- PostgreSQL: https://www.postgresql.org/download/
- Redis: https://redis.io/download/

---

## 1. Environment Configuration

```bash
cp .env.example .env
```

**Required for local dev:**
| Variable | Local Value Example |
|----------|---------------------|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/invoice_be?schema=public` |
| `JWT_SECRET` | Generate: `openssl rand -base64 32` |
| `REDIS_URL` | `redis://localhost:6379` |

**Optional (for full features):**
- Stripe, PayPal, Resend, R2 credentials

---

## 2. Database Setup

```bash
# Generate Prisma Client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# Seed demo data (optional)
npm run prisma:seed
# or
npm run seed:sia-demo
```

---

## 3. Run Development

```bash
# Terminal 1: API Server (http://localhost:4000)
npm run dev

# Terminal 2: Background Worker (emails, jobs)
npm run dev:worker
```

---

## 4. Testing & Quality

```bash
npm test           # Run tests
npm run test:watch # Watch mode
npm run typecheck  # TypeScript check
npm run lint       # ESLint
npm run build      # Production build
npm run start      # Run production build
```

---

# 🚂 Railway Deployment (Recommended)

Railway is the **simplest path** - managed PostgreSQL + Redis, auto-deploys from GitHub.

## One-Click Deploy

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/your-template-id)

Or manually:

### Step 1: Push to GitHub
```bash
git add .
git commit -m "feat: railway deployment ready"
git push origin main
```

### Step 2: Create Railway Project
1. Go to https://railway.app → **New Project**
2. **Deploy from GitHub repo** → Select your repo
3. Railway auto-detects Node.js and builds

### Step 3: Add Database Plugins
In Railway Dashboard:
1. **New Service** → **Database** → **PostgreSQL**
2. **New Service** → **Database** → **Redis**

Railway automatically injects:
- `DATABASE_URL` (PostgreSQL)
- `REDIS_URL` (Redis)
- `PORT` (auto-assigned)

### Step 4: Set Environment Variables
In **Railway Dashboard > Variables**, add:

| Variable | Required | Notes |
|----------|----------|-------|
| `JWT_SECRET` | ✅ | `openssl rand -base64 32` |
| `PAYMENT_TOKEN_ENCRYPTION_KEY` | ✅ (prod) | `openssl rand -base64 32` |
| `NODE_ENV` | ✅ | `production` |
| `CORS_ORIGIN` | ✅ | Your frontend URL (e.g., `https://app.yourdomain.com`) |
| `API_URL` | ✅ | Your Railway URL (e.g., `https://your-app.up.railway.app`) |
| `APP_URL` | ✅ | Your frontend URL |
| `BOOTSTRAP_SUPER_ADMIN_EMAIL` | Optional | For initial admin user |
| `BOOTSTRAP_SUPER_ADMIN_PASSWORD` | Optional | For initial admin user |
| `STRIPE_*` | Optional | If using Stripe |
| `PAYPAL_*` | Optional | If using PayPal |
| `RESEND_API_KEY` | Optional | If using email |
| `EMAIL_FROM` | Optional | If using email |
| `R2_*` | Optional | If using file storage |

### Step 5: Deploy
- Railway auto-deploys on `git push`
- First deploy runs `prisma:migrate` automatically (via nixpacks.toml)
- View logs: **Deployments > [latest] > Logs**

### Step 6: Custom Domain (Optional)
**Settings > Domains > Custom Domain** → Add your domain

---

## Railway Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        RAILWAY PROJECT                       │
├─────────────────┬─────────────────┬─────────────────────────┤
│   Web Service   │  PostgreSQL     │  Redis                  │
│  (your app)     │  (plugin)       │  (plugin)               │
│                 │                 │                         │
│  PORT=auto      │  DATABASE_URL   │  REDIS_URL              │
│  NODE_ENV=prod  │  (auto-injected)│  (auto-injected)        │
└─────────────────┴─────────────────┴─────────────────────────┘
```

---

## Railway Configuration Files

| File | Purpose |
|------|---------|
| `railway.toml` | Health check, restart policy, start command |
| `nixpacks.toml` | Build phases, Node version, migrate on deploy |
| `.env.example` | Template for required variables |

---

## Railway-Specific Commands

```bash
# View logs
railway logs

# Run one-off command (migrate, seed, shell)
railway run npm run prisma:migrate:status
railway run npm run prisma:seed
railway run bash

# Open Railway dashboard
railway open

# Link existing project
railway link
```

Install Railway CLI:
```bash
npm i -g @railway/cli
railway login
```

---

## Production Checklist

- [ ] `NODE_ENV=production`
- [ ] `JWT_SECRET` set (32+ chars)
- [ ] `PAYMENT_TOKEN_ENCRYPTION_KEY` set (32+ chars)
- [ ] `CORS_ORIGIN` = your frontend domain
- [ ] `API_URL` = your Railway backend domain
- [ ] `APP_URL` = your frontend domain
- [ ] Stripe/PayPal webhook URLs updated to Railway domain
- [ ] Custom domain configured (optional)
- [ ] Health check `/health` responding

---

## Troubleshooting

### Build Fails
```bash
# Check build logs in Railway Dashboard
# Common: TypeScript errors → run `npm run typecheck` locally first
```

### Database Connection Error
- Verify `DATABASE_URL` is set (auto-injected by PostgreSQL plugin)
- Check PostgreSQL service is "Running" in Railway

### Redis Connection Error
- Verify `REDIS_URL` is set (auto-injected by Redis plugin)
- Check Redis service is "Running" in Railway

### Migration Fails on Deploy
```bash
# Run manually via Railway CLI
railway run npm run prisma:migrate:status
railway run npm run prisma:migrate
```

### Port Issues
- Railway sets `PORT` automatically - don't hardcode
- App must listen on `0.0.0.0:$PORT` (already configured in server.ts)

### Health Check Fails
- Ensure `/health` endpoint exists (in app.ts)
- Check `railway.toml` healthcheckPath matches

---

## Git Workflow

```bash
# Feature branch
git checkout -b feature/your-feature

# Commit changes
git add .
git commit -m "feat: description"

# Push → Auto-deploys to Railway (if connected to main)
git push origin feature/your-feature

# Merge to main via PR → Production deploy
```

---

## Useful Links

- Railway Docs: https://docs.railway.app/
- Railway CLI: https://docs.railway.app/develop/cli
- Node.js on Railway: https://docs.railway.app/guides/nodejs
- Database plugins: https://docs.railway.app/databases/overview