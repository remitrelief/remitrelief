import { AppError, ErrorCodes } from "./errors.js";

const DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.(\d{1,7}))?$/;
const SCALE = 10_000_000n;

export function normalizeMoney(value, field = "amount") {
  const raw = String(value ?? "").trim();
  const match = DECIMAL_PATTERN.exec(raw);
  const wholePart = raw.split(".")[0];
  if (!match || wholePart.length > 13) {
    throw new AppError(ErrorCodes.CAMPAIGN_INVALID_GOAL, `${field} must be a positive decimal`);
  }
  const [whole, fraction = ""] = raw.split(".");
  const units = BigInt(whole) * SCALE + BigInt(fraction.padEnd(7, "0"));
  if (units <= 0n) {
    throw new AppError(ErrorCodes.CAMPAIGN_INVALID_GOAL, `${field} must be greater than zero`);
  }
  return `${whole}${fraction ? `.${fraction.replace(/0+$/, "")}` : ""}`.replace(/\.$/, "");
}

export function moneyToUnits(value) {
  const raw = String(value ?? "0");
  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const units = BigInt(whole || "0") * SCALE + BigInt(fraction.padEnd(7, "0").slice(0, 7));
  return negative ? -units : units;
}

export function calculateProgress(raised, goal) {
  const raisedUnits = moneyToUnits(raised);
  const goalUnits = moneyToUnits(goal);
  if (goalUnits <= 0n) return 0;
  const tenths = (raisedUnits * 1000n) / goalUnits;
  return Math.min(100, Number(tenths) / 10);
}

export function sumMoney(values) {
  const total = values.reduce((sum, value) => sum + moneyToUnits(value), 0n);
  const whole = total / SCALE;
  const fraction = String(total % SCALE).padStart(7, "0").replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""}`;
}
