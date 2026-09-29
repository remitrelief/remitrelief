-- Phase 9 KYC-lite verification status (application status gating, not full KYC)

CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED');

ALTER TABLE "profiles"
  ADD COLUMN "verification_status" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED';

CREATE TABLE "verification_requests" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "wallet_address" TEXT,
  "requested_role" "UserRole" NOT NULL,
  "statement" TEXT NOT NULL,
  "evidence_urls" JSONB NOT NULL DEFAULT '[]',
  "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
  "review_note" TEXT,
  "reviewed_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "reviewed_at" TIMESTAMP(3),
  CONSTRAINT "verification_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "verification_requests_status_idx" ON "verification_requests"("status");
CREATE INDEX "verification_requests_user_id_idx" ON "verification_requests"("user_id");

ALTER TABLE "verification_requests"
  ADD CONSTRAINT "verification_requests_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
