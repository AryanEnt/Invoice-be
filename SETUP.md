# Development & Deployment Setup Guide

## Local Development

### Prerequisites
- **Node.js 20+** (LTS)

### Start Databases (Docker)
```bash
docker compose up -d
```
This starts PostgreSQL on port 5432 and Redis on port 6379.

### Configure Environment
```bash
cp .env.example .env
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

### Testing & Quality
```bash
npm test           # Run tests
npm run typecheck  # TypeScript check
npm run lint       # ESLint
npm run build      # Production build
npm run start      # Run production build
```

---

## Railway Deployment (Recommended)

### Minimal Steps

1. **Push to GitHub**
   ```bash
   git push origin main
   ```

2. **Create Railway Project**
   - Go to https://railway.app -> New Project -> Deploy from GitHub repo
   - Select your repo
   - Railway auto-detects Node.js, runs `npm ci` -> `npm run build` -> `npm run start`

3. **Add Database Plugins** (in Railway Dashboard)
   - New Service -> Database -> PostgreSQL (auto-injects `DATABASE_URL`)
   - New Service -> Database -> Redis (auto-injects `REDIS_URL`)

4. **Set 6 Required Variables** (in Railway Dashboard > Variables)
   | Variable | Value |
   |----------|-------|
   | `JWT_SECRET` | `openssl rand -base64 32` |
   | `PAYMENT_TOKEN_ENCRYPTION_KEY` | `openssl rand -base64 32` |
   | `NODE_ENV` | `production` |
   | `CORS_ORIGIN` | Your frontend URL (e.g., `https://app.yourdomain.com`) |
   | `API_URL` | Your Railway URL (e.g., `https://your-app.up.railway.app`) |
   | `APP_URL` | Your frontend URL |

5. **Done** - Auto-deploys on every push to main

### Why This Works Without Extra Config

| File | Handles |
|------|---------|
| `nixpacks.toml` | Pinned Node 20, `npm ci`, `npm run build`, runs `prisma:migrate:status` on deploy |
| `railway.toml` | Health check at `/api/health`, restart on failure, `npm run start` |
| `package.json` | `prisma:generate` runs in `postinstall`, `build` compiles TypeScript |

No Dockerfile, no custom scripts, no Railway CLI needed.

### Optional Variables (Add Only If Using Feature)

| Feature | Variables |
|---------|-----------|
| Super admin bootstrap | `BOOTSTRAP_SUPER_ADMIN_EMAIL`, `BOOTSTRAP_SUPER_ADMIN_PASSWORD` |
| Stripe payments | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_REDIRECT_URI` |
| PayPal payments | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_REDIRECT_URI` |
| Email (Resend) | `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_FROM_NAME`, `EMAIL_REPLY_TO` |
| File storage (R2) | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT` |

### Custom Domain (Optional)
Settings > Domains > Custom Domain -> Add your domain

---

## Troubleshooting

### Build Fails
- Check build logs in Railway Dashboard
- Common: TypeScript errors -> run `npm run typecheck` locally first

### Database Connection Error
- Verify PostgreSQL plugin shows "Running"
- `DATABASE_URL` is auto-injected

### Redis Connection Error
- Verify Redis plugin shows "Running"
- `REDIS_URL` is auto-injected

### Migration Fails on Deploy
```bash
railway run npm run prisma:migrate:status
railway run npm run prisma:migrate
```

### Health Check Fails
- Verify `/api/health` endpoint responds (returns 200 with db/redis status)
- Check `railway.toml` healthcheckPath = `/api/health`

---

## Git Workflow

```bash
# Feature branch
git checkout -b feature/your-feature

# Commit changes
git add .
git commit -m "feat: description"

# Push -> Auto-deploys to Railway (if connected to main)
git push origin feature/your-feature

# Merge to main via PR -> Production deploy
```