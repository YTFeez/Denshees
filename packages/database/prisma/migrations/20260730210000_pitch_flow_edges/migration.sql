-- AlterTable
ALTER TABLE "campaigns_email" ADD COLUMN "current_pitch_id" TEXT;

-- CreateTable
CREATE TABLE "pitch_flow_edges" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "from_pitch_id" TEXT,
    "to_pitch_id" TEXT,
    "condition" TEXT NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pitch_flow_edges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaigns_email_current_pitch_id_idx" ON "campaigns_email"("current_pitch_id");

-- CreateIndex
CREATE INDEX "pitch_flow_edges_campaign_id_idx" ON "pitch_flow_edges"("campaign_id");

-- CreateIndex
-- Postgres treats NULLs as distinct in unique indexes; app enforces one ALWAYS-from-start per campaign.
CREATE UNIQUE INDEX "pitch_flow_edges_campaign_id_from_pitch_id_condition_key" ON "pitch_flow_edges"("campaign_id", "from_pitch_id", "condition");

-- AddForeignKey
ALTER TABLE "campaigns_email" ADD CONSTRAINT "campaigns_email_current_pitch_id_fkey" FOREIGN KEY ("current_pitch_id") REFERENCES "pitches_email"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pitch_flow_edges" ADD CONSTRAINT "pitch_flow_edges_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pitch_flow_edges" ADD CONSTRAINT "pitch_flow_edges_from_pitch_id_fkey" FOREIGN KEY ("from_pitch_id") REFERENCES "pitches_email"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pitch_flow_edges" ADD CONSTRAINT "pitch_flow_edges_to_pitch_id_fkey" FOREIGN KEY ("to_pitch_id") REFERENCES "pitches_email"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill graph from linear stages
INSERT INTO "pitch_flow_edges" ("id", "campaign_id", "from_pitch_id", "to_pitch_id", "condition", "created", "updated")
SELECT
  md5(random()::text || clock_timestamp()::text)::text,
  p."campaign",
  NULL,
  p."id",
  'ALWAYS',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "pitches_email" p
WHERE p."stage" = 0 AND p."campaign" IS NOT NULL;

INSERT INTO "pitch_flow_edges" ("id", "campaign_id", "from_pitch_id", "to_pitch_id", "condition", "created", "updated")
SELECT
  md5(random()::text || clock_timestamp()::text || p."id")::text,
  p."campaign",
  p."id",
  nxt."id",
  'NO_REPLY',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "pitches_email" p
JOIN "pitches_email" nxt
  ON nxt."campaign" = p."campaign" AND nxt."stage" = p."stage" + 1
WHERE p."campaign" IS NOT NULL;

INSERT INTO "pitch_flow_edges" ("id", "campaign_id", "from_pitch_id", "to_pitch_id", "condition", "created", "updated")
SELECT
  md5(random()::text || clock_timestamp()::text || p."id" || 'REPLIED')::text,
  p."campaign",
  p."id",
  NULL,
  'REPLIED',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "pitches_email" p
WHERE p."campaign" IS NOT NULL;

INSERT INTO "pitch_flow_edges" ("id", "campaign_id", "from_pitch_id", "to_pitch_id", "condition", "created", "updated")
SELECT
  md5(random()::text || clock_timestamp()::text || p."id" || 'OPENED')::text,
  p."campaign",
  p."id",
  NULL,
  'OPENED',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "pitches_email" p
WHERE p."campaign" IS NOT NULL;

-- Backfill current_pitch_id for leads that already received mail
UPDATE "campaigns_email" ce
SET "current_pitch_id" = p."id"
FROM "pitches_email" p
WHERE ce."campaign" = p."campaign"
  AND ce."stage" IS NOT NULL
  AND ce."stage" > 0
  AND p."stage" = ce."stage" - 1;
