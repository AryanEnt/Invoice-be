-- Admin-level company branding (inherited by members under that administrator).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "companyName" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "companyLogoObjectKey" TEXT;
