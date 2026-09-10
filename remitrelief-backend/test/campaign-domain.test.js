import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertCampaignTransition,
  getEffectiveCampaignStatus,
  slugifyCampaignTitle,
} from "../src/domain/campaign.js";
import { calculateProgress, normalizeMoney, sumMoney } from "../src/lib/money.js";
import {
  validateCampaignForSubmission,
  validateCampaignInput,
  validateMilestones,
} from "../src/validators/campaignValidator.js";

describe("campaign lifecycle", () => {
  it("allows only configured transitions", () => {
    assert.doesNotThrow(() => assertCampaignTransition("DRAFT", "SUBMITTED"));
    assert.doesNotThrow(() => assertCampaignTransition("UNDER_REVIEW", "APPROVED"));
    assert.throws(
      () => assertCampaignTransition("DRAFT", "COMPLETED"),
      (error) => error.code === "CAMPAIGN_INVALID_STATE"
    );
    assert.throws(
      () => assertCampaignTransition("CLOSED", "ACTIVE"),
      (error) => error.code === "CAMPAIGN_INVALID_STATE"
    );
  });

  it("derives expiry without mutating stored status", () => {
    const campaign = { status: "ACTIVE", deadline: "2020-01-01T00:00:00.000Z" };
    assert.equal(getEffectiveCampaignStatus(campaign), "EXPIRED");
    assert.equal(campaign.status, "ACTIVE");
  });
});

describe("campaign validation and money", () => {
  it("normalizes safe decimal strings and computes bounded progress", () => {
    assert.equal(normalizeMoney("100.2500000"), "100.25");
    assert.equal(sumMoney(["40.25", "59.75"]), "100");
    assert.equal(calculateProgress("42.5", "100"), 42.5);
    assert.equal(calculateProgress("150", "100"), 100);
    assert.throws(() => normalizeMoney("1.00000001"));
    assert.throws(() => normalizeMoney("-1"));
  });

  it("creates stable URL-safe slugs", () => {
    assert.equal(slugifyCampaignTitle("Help Á Family Rebuild!"), "help-a-family-rebuild");
  });

  it("validates controlled campaign fields and milestone totals", () => {
    const campaign = validateCampaignInput({
      title: "School meals for children",
      shortDescription: "A fictional education campaign",
      description:
        "This fictional campaign provides nutritious school meals for children in a test community.",
      category: "EDUCATION",
      goalAmount: "1000.00",
      currency: "USDC",
      visibility: "PUBLIC",
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      milestones: [
        { title: "Purchase supplies", targetAmount: "400" },
        { title: "Deliver meals", targetAmount: "600" },
      ],
    });
    campaign.recipientId = "recipient-id";
    campaign.milestones = validateMilestones(campaign.milestones, {
      requireTotal: true,
      goalAmount: campaign.goalAmount,
    });
    assert.doesNotThrow(() => validateCampaignForSubmission(campaign));
    assert.throws(
      () =>
        validateMilestones(
          [{ title: "Only milestone", targetAmount: "50" }],
          { requireTotal: true, goalAmount: "100" }
        ),
      (error) => error.code === "MILESTONE_INVALID"
    );
  });
});
