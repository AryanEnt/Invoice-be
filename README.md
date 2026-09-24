# Invoice Backend

Express + TypeScript API with PostgreSQL, Prisma, Redis, and BullMQ.

## Local Development

### Prerequisites
- Node.js 20+
- Docker (for PostgreSQL and Redis)

### Start Databases
```bash
docker compose up -d
```

### Configure Environment
```bash
copy .env.example .env
```
Edit `.env` with:
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/invoice_be?schema=public`
- `JWT_SECRET=` (generate: `openssl rand -base64 32`)
- `REDIS_URL=redis://localhost:6379`

### Setup Database
```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

### Run Development
```bash
# Terminal 1: API Server (http://localhost:4000)
npm run dev

# Terminal 2: Background Worker (emails, jobs)
npm run dev:worker
```

### Health Check
```
GET http://localhost:4000/api/health
```

---

## Railway Deployment

### Minimal Steps

1. Push to GitHub
2. Railway: New Project -> Deploy from GitHub repo
3. Add PostgreSQL plugin (auto-injects `DATABASE_URL`)
4. Add Redis plugin (auto-injects `REDIS_URL`)
5. Set 6 required variables in Dashboard > Variables:
   - `JWT_SECRET` (generate: `openssl rand -base64 32`)
   - `PAYMENT_TOKEN_ENCRYPTION_KEY` (generate: `openssl rand -base64 32`)
   - `NODE_ENV=production`
   - `CORS_ORIGIN` (your frontend URL)
   - `API_URL` (your Railway URL)
   - `APP_URL` (your frontend URL)
6. Done - auto-deploys on push to main

### Deployment Architecture
- `nixpacks.toml`: installs dev dependencies, runs `prisma:generate` and compiles TypeScript (`npm run build`)
- `railway.toml`: runs database migrations via `preDeployCommand`, health checks `/api/health`, and handles restarts
- `package.json`: contains scripts and dependencies for API and workers

---

## Optional Features (Add Variables Only If Needed)

| Feature | Variables |
|---------|-----------|
| Super admin bootstrap | `BOOTSTRAP_SUPER_ADMIN_EMAIL`, `BOOTSTRAP_SUPER_ADMIN_PASSWORD` |
| Stripe payments | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_REDIRECT_URI` |
| PayPal payments | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_REDIRECT_URI` |
| Email (Resend) | `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_FROM_NAME`, `EMAIL_REPLY_TO` |
| File storage (R2) | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT` |

---

## Useful Commands

```bash
npm test           # Run tests
npm run typecheck  # TypeScript check
npm run lint       # ESLint
npm run build      # Production build
npm run start      # Run production build
npm run prisma:studio  # Database GUI
```