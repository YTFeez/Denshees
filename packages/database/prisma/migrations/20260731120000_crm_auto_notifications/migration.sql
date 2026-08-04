-- AlterTable
ALTER TABLE "crm_deals" ADD COLUMN IF NOT EXISTS "stage_locked" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "crm_stages" ADD COLUMN IF NOT EXISTS "key" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "crm_deals_lead_idx" ON "crm_deals"("lead");
CREATE INDEX IF NOT EXISTS "crm_deals_campaign_idx" ON "crm_deals"("campaign");
CREATE INDEX IF NOT EXISTS "crm_stages_campaign_key_idx" ON "crm_stages"("campaign", "key");

-- CreateTable
CREATE TABLE IF NOT EXISTS "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "campaign_id" TEXT,
    "deal_id" TEXT,
    "lead_id" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "notifications_user_id_read_created_idx" ON "notifications"("user_id", "read", "created");
CREATE INDEX IF NOT EXISTS "notifications_lead_id_type_created_idx" ON "notifications"("lead_id", "type", "created");

ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_user_id_fkey";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_deal_id_fkey";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "crm_deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
