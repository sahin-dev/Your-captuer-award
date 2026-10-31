import { contestRuleService } from "./ContestRules/contestRules.service";
import { ContestRuleConfigInput } from "./ContestRules/contestRules.type";
import { prizeService } from "../Prize/prize.service";

// Everything that differs between a regular contest and Photographer of the
// Year (POTY). Other code asks policyFor(contest) instead of checking
// isPhotographyOfYear. To add a new contest type, add a new policy object here.

export type ContestType = "REGULAR" | "POTY";

type MoneySettings = {
  isMoneyContest?: boolean;
  minPrize?: number | null;
  maxPrize?: number | null;
  entryFeeCoins?: number;
};

type AwardInput = {
  prizeIds: string[];
  prizes: Parameters<typeof prizeService.resolveAwardRows>[1];
  useDefaults: boolean;
};

export type ContestTypePolicy = {
  type: ContestType;
  acceptsDirectVotes: boolean;
  // True when the contest ends without automatic awards, and an admin publishes
  // the results later.
  closesForJudging: boolean;
  requiresStripeEntry(contest: { entryFeeAmount: number }): boolean;
  applyRuleOverrides(rules: ContestRuleConfigInput[]): ContestRuleConfigInput[];
  getSubmissionLimit(rules: ContestRuleConfigInput[]): number;
  resolveAwards(input: AwardInput): ReturnType<typeof prizeService.resolveAwardRows> | Promise<never[]>;
  resolveLevelAwards<T>(levelAwards?: T[]): T[];
  applyMoneyRules<T extends MoneySettings>(settings: T): T;
};

const POTY_SUBMISSION_LIMIT = 8;

const regularPolicy: ContestTypePolicy = {
  type: "REGULAR",
  acceptsDirectVotes: true,
  closesForJudging: false,
  requiresStripeEntry: (contest) => contest.entryFeeAmount > 0,
  applyRuleOverrides: (rules) => rules,
  getSubmissionLimit: (rules) => contestRuleService.getSubmissionLimitFromRules(rules),
  resolveAwards: ({ prizeIds, prizes, useDefaults }) => prizeService.resolveAwardRows(prizeIds, prizes, useDefaults),
  resolveLevelAwards: (levelAwards) => levelAwards ?? [],
  applyMoneyRules: (settings) => settings,
};

const potyPolicy: ContestTypePolicy = {
  type: "POTY",
  // POTY scores come from votes in regular contests.
  acceptsDirectVotes: false,
  closesForJudging: true,
  requiresStripeEntry: () => true,
  applyRuleOverrides: (rules) =>
    rules.map((rule) => rule.key === "SUBMISSION_LIMIT"
      ? { ...rule, value: POTY_SUBMISSION_LIMIT, enabled: true }
      : rule),
  getSubmissionLimit: () => POTY_SUBMISSION_LIMIT,
  resolveAwards: async () => [],
  resolveLevelAwards: () => [],
  applyMoneyRules: (settings) => ({ ...settings, isMoneyContest: false, minPrize: 0, maxPrize: 0, entryFeeCoins: 0 }),
};

export const policyFor = (contest: { isPhotographyOfYear?: boolean | null }) =>
  contest.isPhotographyOfYear ? potyPolicy : regularPolicy;
