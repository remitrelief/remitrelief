-- Phase 6: milestone proof records for verify/release workflow
CREATE TYPE "MilestoneProofStatus" AS ENUM ('SUBMITTED', 'ACCEPTED', 'REJECTED');

CREATE TABLE "milestone_proofs" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "milestone_id" TEXT,
    "milestone_index" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "evidence_urls" JSONB NOT NULL DEFAULT '[]',
    "submitted_by_wallet" TEXT NOT NULL,
    "submitted_by_user_id" TEXT,
    "status" "MilestoneProofStatus" NOT NULL DEFAULT 'SUBMITTED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "milestone_proofs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "milestone_proofs_campaign_id_milestone_index_idx" ON "milestone_proofs"("campaign_id", "milestone_index");
CREATE INDEX "milestone_proofs_milestone_id_idx" ON "milestone_proofs"("milestone_id");

ALTER TABLE "milestone_proofs" ADD CONSTRAINT "milestone_proofs_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "milestone_proofs" ADD CONSTRAINT "milestone_proofs_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "milestones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
