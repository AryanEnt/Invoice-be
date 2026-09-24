# Development Setup Guide

## Prerequisites

You need **PostgreSQL** and **Redis** running. Choose one of these options:

### Option 1: Docker (Recommended)
```bash
# Install Docker Desktop from https://www.docker.com/products/docker-desktop/
# Then run:
docker compose up -d
```

### Option 2: Local Installation
- **PostgreSQL 16+**: https://www.postgresql.org/download/
- **Redis 7+**: https://redis.io/download/

### Option 3: Cloud Services (No local install)
- **PostgreSQL**: Neon (https://neon.tech), Supabase (https://supabase.com), or Railway (https://railway.app)
- **Redis**: Upstash (https://upstash.com) or Redis Cloud (https://redis.com/cloud/)

---

## 1. Environment Configuration

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

**Required variables:**
| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (e.g., `postgresql://user:pass@localhost:5432/invoice_be`) |
| `JWT_SECRET` | Random string ≥16 chars (generate with `openssl rand -base64 32`) |
| `REDIS_URL` | Redis connection (e.g., `redis://localhost:6379`) - optional for dev |

**Optional but recommended for full features:**
- `STRIPE_SECRET_KEY` - Get from https://dashboard.stripe.com/apikeys
- `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` - Get from https://developer.paypal.com/
- `RESEND_API_KEY` - Get from https://resend.com/api-keys
- `R2_*` - Cloudflare R2 credentials for file storage

---

## 2. Database Setup

```bash
# Run migrations
npm run prisma:migrate

# (Optional) Seed database with demo data
npm run prisma:seed
# or for SIA demo data:
npm run seed:sia-demo
```

---

## 3. Run Development Server

```bash
# Terminal 1: API server
npm run dev

# Terminal 2: Background worker (for email jobs, etc.)
npm run dev:worker
```

Server runs at `http://localhost:4000`

---

## 4. Run Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch
```

---

## 5. Useful Commands

| Command | Description |
|---------|-------------|
| `npm run prisma:studio` | Open Prisma Studio (database GUI) |
| `npm run prisma:migrate:status` | Check migration status |
| `npm run typecheck` | TypeScript type checking |
| `npm run lint` | ESLint |
| `npm run build` | Production build |
| `npm run start` | Run production build |

---

## Database Connection Strings Examples

**Local PostgreSQL (Docker):**
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/invoice_be?schema=public
```

**Neon (Serverless):**
```
DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/invoice_be?sslmode=require
```

**Supabase:**
```
DATABASE_URL=postgresql://postgres:pass@db.xxx.supabase.co:5432/postgres?sslmode=require
```

**Local Redis (Docker):**
```
REDIS_URL=redis://localhost:6379
```

**Upstash Redis:**
```
REDIS_URL=rediss://:token@xxx.upstash.io:6379
```

---

## Troubleshooting

### "DATABASE_URL is required"
Make sure `.env` exists and has a valid `DATABASE_URL`.

### Prisma migration fails
```bash
# Reset database (DESTROYS DATA)
npm run prisma:migrate:baseline
# or
npx prisma migrate reset
```

### Port 4000 already in use
Change `PORT` in `.env` or kill the process:
```bash
npx kill-port 4000
```

### JWT_SECRET error
Generate a secure secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

---

## Git Workflow for New Features

```bash
# Create feature branch
git checkout -b feature/your-feature-name

# Make changes, commit
git add .
git commit -m "feat: your feature description"

# Push and create PR
git push origin feature/your-feature-name
```