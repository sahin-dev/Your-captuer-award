import { ContestRuleKey, LevelRequirementValue } from "../contestRule.definitions";
import { RuleHandler } from "./ruleHandler";
import { submissionFormatHandler } from "./submissionFormat.handler";
import { submissionLimitHandler } from "./submissionLimit.handler";
import { submissionRulesHandler } from "./submissionRules.handler";

const levelRequirementsHandler: RuleHandler<LevelRequirementValue[]> = {
  summarize: (levels) =>
    levels.map((item) => `- ${item.level.replace("_", " ")} - ${item.votes} votes`).join("\n"),
};

// `minAge` on ELIGIBILITY is displayed copy only. It is deliberately not
// enforced, so joining is never gated on the user's date of birth.
const eligibilityHandler: RuleHandler<{ requiresAcceptance?: boolean }> = {
  acceptance: {
    isRequired: (value) => Boolean(value.requiresAcceptance),
    errorMessage: "Eligibility rule must be accepted before joining this contest",
  },
};

const copyrightHandler: RuleHandler<{ requiresOwnership?: boolean; requiresAcceptance?: boolean }> = {
  acceptance: {
    isRequired: (value) => Boolean(value.requiresAcceptance || value.requiresOwnership),
    errorMessage: "Copyright rule must be accepted before joining this contest",
  },
};

const participationHandler: RuleHandler<{ requiresTermsAcceptance?: boolean }> = {
  acceptance: {
    isRequired: (value) => Boolean(value.requiresTermsAcceptance),
    errorMessage: "Participation terms must be accepted before joining this contest",
  },
};

export const ruleHandlers: Record<ContestRuleKey, RuleHandler> = {
  SUBMISSION_LIMIT: submissionLimitHandler,
  SUBMISSION_RULES: submissionRulesHandler,
  LEVEL_REQUIREMENTS: levelRequirementsHandler,
  SUBMISSION_FORMAT: submissionFormatHandler,
  ELIGIBILITY: eligibilityHandler,
  COPYRIGHT: copyrightHandler,
  // Enforced by validateVotingRules in contestRule.engine.ts.
  VOTING: {},
  PARTICIPATION: participationHandler,
};

// Rules are checked in this order, which decides the error a user sees first.
export const uploadRuleOrder: ContestRuleKey[] = ["SUBMISSION_LIMIT", "SUBMISSION_FORMAT", "SUBMISSION_RULES"];
export const acceptanceRuleOrder: ContestRuleKey[] = ["ELIGIBILITY", "COPYRIGHT", "PARTICIPATION"];

export const summarizeRule = (key: ContestRuleKey, value: any): string => {
  const summarize = ruleHandlers[key].summarize;
  return summarize ? summarize(value) : value?.text || "";
};
