/**
 * Development seed — NEVER run against production.
 * Uses public-only Stellar addresses from env or safe development defaults.
 */

import "dotenv/config";
import { getPrisma, disconnectPrisma } from "../src/database/prisma.js";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed production");
  process.exit(1);
}

// Public addresses only. Their private keys are neither known nor stored here.
const ADMIN =
  process.env.SEED_ADMIN_WALLET || "GD2LEBI4O76E6W4UTLV3EWJMMCIOM3VCEIPCP5VCCZNDFLTKTZ2EGE4V";
const DONOR =
  process.env.SEED_DONOR_WALLET || "GA67S7XRWR6XIWMAEJY5KPRQGYDBOVMAQVAAOYVLLHJAHLX7V74XTR4B";
const RECIPIENT =
  process.env.SEED_RECIPIENT_WALLET || "GCIGSQGDZLTXD26JRHTY6AIWB4II7B662JPSILGWVELT7IVMCXMDCAH7";
const NGO =
  process.env.SEED_NGO_WALLET || "GB5RJH4NW77KWB3ZBVFOCDYBPVWUQNSF7S5RQHV7WX2ISA4ZRYY76MXP";

async function main() {
  const prisma = getPrisma();

  const admin = await prisma.user.upsert({
    where: { walletAddress: ADMIN },
    create: {
      walletAddress: ADMIN,
      role: "ADMIN",
      roles: ["ADMIN", "DONOR"],
      status: "ACTIVE",
      profile: { create: { displayName: "Dev Admin" } },
    },
    update: { role: "ADMIN", roles: ["ADMIN", "DONOR"], status: "ACTIVE" },
  });

  const recipientUser = await prisma.user.upsert({
    where: { walletAddress: DONOR },
    create: {
      walletAddress: DONOR,
      role: "DONOR",
      roles: ["DONOR"],
      status: "ACTIVE",
      profile: { create: { displayName: "Dev Donor" } },
    },
    update: {},
  });

  await prisma.user.upsert({
    where: { walletAddress: RECIPIENT },
    create: {
      walletAddress: RECIPIENT,
      role: "RECIPIENT",
      roles: ["RECIPIENT", "DONOR"],
      status: "ACTIVE",
      profile: { create: { displayName: "Dev Recipient" } },
    },
    update: {},
  });

  const ngoUser = await prisma.user.upsert({
    where: { walletAddress: NGO },
    create: {
      walletAddress: NGO,
      role: "NGO",
      roles: ["NGO", "DONOR"],
      status: "ACTIVE",
      profile: { create: { displayName: "Dev NGO Operator" } },
    },
    update: { role: "NGO", roles: ["NGO", "DONOR"] },
  });

  const org = await prisma.organization.upsert({
    where: { slug: "dev-relief-org" },
    create: {
      name: "Dev Relief Org",
      slug: "dev-relief-org",
      description: "Seeded development NGO (not verified for production)",
      walletAddress: NGO,
      status: "PENDING",
    },
    update: {},
  });

  await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: { organizationId: org.id, userId: ngoUser.id },
    },
    create: {
      organizationId: org.id,
      userId: ngoUser.id,
      role: "OWNER",
      status: "ACTIVE",
    },
    update: { role: "OWNER" },
  });

  const deadline = (days) => new Date(Date.now() + days * 86_400_000);
  const campaignSeeds = [
    ["medical-recovery-demo", "Community Medical Recovery", "MEDICAL", "DRAFT"],
    ["education-access-demo", "Education Access Fund", "EDUCATION", "SUBMITTED"],
    ["food-security-demo", "Neighborhood Food Security", "FOOD", "UNDER_REVIEW"],
    ["housing-rebuild-demo", "Safe Housing Rebuild", "HOUSING", "APPROVED"],
    ["emergency-support-demo", "Emergency Family Support", "EMERGENCY", "ACTIVE"],
    ["disaster-recovery-demo", "Coastal Disaster Recovery", "DISASTER", "COMPLETED"],
    ["family-care-demo", "Family Care Assistance", "FAMILY", "REJECTED"],
    ["community-water-demo", "Community Water Access", "COMMUNITY", "ACTIVE"],
  ];

  for (const [id, name, category, status] of campaignSeeds) {
    const data = {
      slug: id,
      name,
      shortDescription: `Fictional ${category.toLowerCase()} campaign for local testing.`,
      location: "Fictional Test Community",
      description:
        "This is fictional development seed content used to exercise the campaign lifecycle safely.",
      category,
      goal: "10000",
      raised: "0",
      currency: "USDC",
      deadline: deadline(status === "COMPLETED" ? -10 : 60),
      visibility: ["ACTIVE", "COMPLETED"].includes(status) ? "PUBLIC" : "PRIVATE",
      status,
      rejectionReason:
        status === "REJECTED" ? "Seeded example requiring additional documentation." : null,
      submittedAt: ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "ACTIVE", "COMPLETED", "REJECTED"].includes(status)
        ? deadline(-20)
        : null,
      approvedAt: ["APPROVED", "ACTIVE", "COMPLETED"].includes(status) ? deadline(-15) : null,
      activatedAt: ["ACTIVE", "COMPLETED"].includes(status) ? deadline(-12) : null,
      completedAt: status === "COMPLETED" ? deadline(-10) : null,
      createdByWallet: NGO,
      createdByUserId: ngoUser.id,
      recipientId: recipientUser.id,
      recipientName: "Development Recipient",
      organizationId: org.id,
      milestonesTotal: 2,
      milestonesVerified: status === "COMPLETED" ? 2 : 0,
      milestoneLabels: [
        { index: 0, label: "Resources prepared", amount: "4000" },
        { index: 1, label: "Support delivered", amount: "6000" },
      ],
    };
    await prisma.campaign.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    });
    await prisma.milestone.deleteMany({ where: { campaignId: id } });
    await prisma.milestone.createMany({
      data: [
        {
          campaignId: id,
          index: 0,
          label: "Resources prepared",
          description: "Prepare the fictional campaign resources.",
          amount: "4000",
          status: status === "COMPLETED" ? "COMPLETED" : "PENDING",
          verified: status === "COMPLETED",
        },
        {
          campaignId: id,
          index: 1,
          label: "Support delivered",
          description: "Deliver support to the fictional beneficiary.",
          amount: "6000",
          status: status === "COMPLETED" ? "COMPLETED" : "PENDING",
          verified: status === "COMPLETED",
        },
      ],
    });
  }

  console.log("Seed complete (development only)", {
    admin: admin.walletAddress,
    org: org.slug,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await disconnectPrisma();
  });
