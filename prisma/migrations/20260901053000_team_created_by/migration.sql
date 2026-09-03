-- AlterTable
ALTER TABLE "teams" ADD COLUMN "createdById" TEXT;

-- Backfill owner from the Administrator already on the team
UPDATE "teams" AS t
SET "createdById" = (
  SELECT u.id
  FROM "team_members" AS tm
  INNER JOIN "users" AS u ON u.id = tm."userId"
  WHERE tm."teamId" = t.id AND u.role = 'ADMIN'
  ORDER BY tm."createdAt" ASC
  LIMIT 1
)
WHERE t."createdById" IS NULL;

-- Remaining teams: first Administrator in the same organization
UPDATE "teams" AS t
SET "createdById" = (
  SELECT u.id
  FROM "users" AS u
  WHERE u."organizationId" = t."organizationId" AND u.role = 'ADMIN'
  ORDER BY u."createdAt" ASC
  LIMIT 1
)
WHERE t."createdById" IS NULL;

-- CreateIndex
CREATE INDEX "teams_createdById_idx" ON "teams"("createdById");

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
