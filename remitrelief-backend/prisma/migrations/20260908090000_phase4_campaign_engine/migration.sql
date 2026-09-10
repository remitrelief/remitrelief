CREATE TYPE "CampaignStatus" AS ENUM (
  'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'ACTIVE',
  'COMPLETED', 'REJECTED', 'CANCELLED', 'CLOSED', 'EXPIRED'
);
CREATE TYPE "CampaignCategory" AS ENUM (
  'MEDICAL', 'EDUCATION', 'FOOD', 'HOUSING',
  'EMERGENCY', 'DISASTER', 'FAMILY', 'COMMUNITY'
);
CREATE TYPE "CampaignCurrency" AS ENUM ('USDC', 'USD', 'NGN', 'EUR', 'GBP');
CREATE TYPE "CampaignVisibility" AS ENUM ('PUBLIC', 'UNLISTED', 'PRIVATE');
CREATE TYPE "MilestoneStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED');
CREATE TYPE "CampaignUpdateStatus" AS ENUM ('DRAFT', 'PUBLISHED');
CREATE TYPE "CampaignMediaType" AS ENUM ('IMAGE', 'VIDEO', 'DOCUMENT');

ALTER TABLE "campaigns"
  ADD COLUMN "slug" TEXT,
  ADD COLUMN "short_description" TEXT,
  ADD COLUMN "currency" "CampaignCurrency" NOT NULL DEFAULT 'USDC',
  ADD COLUMN "deadline" TIMESTAMP(3),
  ADD COLUMN "visibility" "CampaignVisibility" NOT NULL DEFAULT 'PUBLIC',
  ADD COLUMN "cover_image" TEXT,
  ADD COLUMN "rejection_reason" TEXT,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "submitted_at" TIMESTAMP(3),
  ADD COLUMN "approved_at" TIMESTAMP(3),
  ADD COLUMN "activated_at" TIMESTAMP(3),
  ADD COLUMN "completed_at" TIMESTAMP(3),
  ADD COLUMN "closed_at" TIMESTAMP(3),
  ADD COLUMN "recipient_id" TEXT;

UPDATE "campaigns" SET "slug" = "id";
ALTER TABLE "campaigns" ALTER COLUMN "slug" SET NOT NULL;
ALTER TABLE "campaigns" ALTER COLUMN "location" SET DEFAULT '';

ALTER TABLE "campaigns"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "CampaignStatus"
  USING (
    CASE UPPER("status")
      WHEN 'DRAFT' THEN 'DRAFT'
      WHEN 'SUBMITTED' THEN 'SUBMITTED'
      WHEN 'UNDER_REVIEW' THEN 'UNDER_REVIEW'
      WHEN 'APPROVED' THEN 'APPROVED'
      WHEN 'COMPLETED' THEN 'COMPLETED'
      WHEN 'REJECTED' THEN 'REJECTED'
      WHEN 'CANCELLED' THEN 'CANCELLED'
      WHEN 'CLOSED' THEN 'CLOSED'
      WHEN 'EXPIRED' THEN 'EXPIRED'
      ELSE 'ACTIVE'
    END
  )::"CampaignStatus",
  ALTER COLUMN "status" SET DEFAULT 'DRAFT';

ALTER TABLE "campaigns"
  ALTER COLUMN "category" DROP DEFAULT,
  ALTER COLUMN "category" TYPE "CampaignCategory"
  USING (
    CASE UPPER(COALESCE("category", 'EMERGENCY'))
      WHEN 'MEDICAL' THEN 'MEDICAL'
      WHEN 'EDUCATION' THEN 'EDUCATION'
      WHEN 'FOOD' THEN 'FOOD'
      WHEN 'HOUSING' THEN 'HOUSING'
      WHEN 'FAMILY' THEN 'FAMILY'
      WHEN 'COMMUNITY' THEN 'COMMUNITY'
      WHEN 'DISASTER' THEN 'DISASTER'
      WHEN 'FLOOD' THEN 'DISASTER'
      WHEN 'WILDFIRE' THEN 'DISASTER'
      WHEN 'CYCLONE' THEN 'DISASTER'
      WHEN 'EARTHQUAKE' THEN 'DISASTER'
      ELSE 'EMERGENCY'
    END
  )::"CampaignCategory",
  ALTER COLUMN "category" SET NOT NULL,
  ALTER COLUMN "category" SET DEFAULT 'EMERGENCY';

ALTER TABLE "milestones"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "status" "MilestoneStatus" NOT NULL DEFAULT 'PENDING';

UPDATE "milestones"
SET "status" = CASE
  WHEN "released" = true OR "verified" = true THEN 'COMPLETED'::"MilestoneStatus"
  ELSE 'PENDING'::"MilestoneStatus"
END;

CREATE TABLE "campaign_updates" (
  "id" TEXT NOT NULL,
  "campaign_id" TEXT NOT NULL,
  "author_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "status" "CampaignUpdateStatus" NOT NULL DEFAULT 'DRAFT',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "published_at" TIMESTAMP(3),
  CONSTRAINT "campaign_updates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "campaign_media" (
  "id" TEXT NOT NULL,
  "campaign_id" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "type" "CampaignMediaType" NOT NULL DEFAULT 'IMAGE',
  "alt_text" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_cover" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "campaign_media_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "campaigns_slug_key" ON "campaigns"("slug");
CREATE INDEX "campaigns_recipient_id_idx" ON "campaigns"("recipient_id");
CREATE INDEX "campaigns_organization_id_idx" ON "campaigns"("organization_id");
CREATE INDEX "campaigns_visibility_status_created_at_idx"
  ON "campaigns"("visibility", "status", "created_at");
CREATE INDEX "campaigns_deadline_idx" ON "campaigns"("deadline");
CREATE INDEX "campaign_updates_campaign_id_status_published_at_idx"
  ON "campaign_updates"("campaign_id", "status", "published_at");
CREATE INDEX "campaign_updates_author_id_idx" ON "campaign_updates"("author_id");
CREATE INDEX "campaign_media_campaign_id_sort_order_idx"
  ON "campaign_media"("campaign_id", "sort_order");
CREATE UNIQUE INDEX "campaign_media_one_cover_per_campaign"
  ON "campaign_media"("campaign_id") WHERE "is_cover" = true;

ALTER TABLE "campaigns"
  ADD CONSTRAINT "campaigns_recipient_id_fkey"
  FOREIGN KEY ("recipient_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "campaign_updates"
  ADD CONSTRAINT "campaign_updates_campaign_id_fkey"
  FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_updates"
  ADD CONSTRAINT "campaign_updates_author_id_fkey"
  FOREIGN KEY ("author_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "campaign_media"
  ADD CONSTRAINT "campaign_media_campaign_id_fkey"
  FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "donations" DROP CONSTRAINT "donations_campaign_id_fkey";
ALTER TABLE "donations"
  ADD CONSTRAINT "donations_campaign_id_fkey"
  FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
