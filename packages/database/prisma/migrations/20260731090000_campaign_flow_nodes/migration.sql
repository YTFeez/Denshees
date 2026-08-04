-- CreateTable
CREATE TABLE "campaign_flow_nodes" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "pitch_id" TEXT,
    "config" JSONB,
    "flow_x" DOUBLE PRECISION,
    "flow_y" DOUBLE PRECISION,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_flow_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_flow_wires" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "source_node_id" TEXT NOT NULL,
    "source_handle" TEXT NOT NULL,
    "target_node_id" TEXT NOT NULL,
    "target_handle" TEXT NOT NULL DEFAULT 'in',
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_flow_wires_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "campaigns_email" ADD COLUMN IF NOT EXISTS "current_node_id" TEXT;

-- CreateIndex
CREATE INDEX "campaign_flow_nodes_campaign_id_idx" ON "campaign_flow_nodes"("campaign_id");
CREATE INDEX "campaign_flow_nodes_pitch_id_idx" ON "campaign_flow_nodes"("pitch_id");
CREATE INDEX "campaign_flow_wires_campaign_id_idx" ON "campaign_flow_wires"("campaign_id");
CREATE UNIQUE INDEX "campaign_flow_wires_campaign_id_source_node_id_source_handle_key" ON "campaign_flow_wires"("campaign_id", "source_node_id", "source_handle");
CREATE INDEX "campaigns_email_current_node_id_idx" ON "campaigns_email"("current_node_id");

-- AddForeignKey
ALTER TABLE "campaign_flow_nodes" ADD CONSTRAINT "campaign_flow_nodes_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_flow_nodes" ADD CONSTRAINT "campaign_flow_nodes_pitch_id_fkey" FOREIGN KEY ("pitch_id") REFERENCES "pitches_email"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "campaign_flow_wires" ADD CONSTRAINT "campaign_flow_wires_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_flow_wires" ADD CONSTRAINT "campaign_flow_wires_source_node_id_fkey" FOREIGN KEY ("source_node_id") REFERENCES "campaign_flow_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_flow_wires" ADD CONSTRAINT "campaign_flow_wires_target_node_id_fkey" FOREIGN KEY ("target_node_id") REFERENCES "campaign_flow_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaigns_email" ADD CONSTRAINT "campaigns_email_current_node_id_fkey" FOREIGN KEY ("current_node_id") REFERENCES "campaign_flow_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
