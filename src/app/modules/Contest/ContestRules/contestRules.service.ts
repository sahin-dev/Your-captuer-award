import ApiError from "../../../../errors/ApiError";
import prisma from "../../../../shared/prisma";
import httpStatus from "http-status";
import {
  ContestRuleKey,
  contestRuleDefinitions,
  getContestRuleDefinitions as getContestRuleDefinitionConfigs,
  getContestRuleDefinitionViews,
  isContestRuleKey,
} from "./contestRule.definitions";
import { contestRuleConfigArraySchema } from "./contestRule.validation";
import { summarizeRule } from "./handlers";
import { ContestRuleConfigInput } from "./contestRules.type";
import { contestCache } from "../contest.cache";

type RuleConfigRecord = {
  id?: string;
  contestId?: string;
  key: string;
  value: unknown;
  enabled: boolean;
  order: number;
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const buildDefaultContestRules = (): ContestRuleConfigInput[] => {
  const defaults = getContestRuleDefinitionConfigs().map((definition) => ({
    key: definition.key,
    value: clone(definition.defaultValue),
    enabled: true,
    order: definition.order,
  }));

  return defaults as ContestRuleConfigInput[];
};

const normalizeContestRules = (
  rules?: ContestRuleConfigInput[],
  includeDefaults = true
): ContestRuleConfigInput[] => {
  const ruleMap = new Map<ContestRuleKey, ContestRuleConfigInput>();

  if (includeDefaults) {
    buildDefaultContestRules().forEach((rule) => {
      ruleMap.set(rule.key, rule);
    });
  }

  rules?.forEach((rule) => {
    ruleMap.set(rule.key, {
      ...rule,
      enabled: rule.enabled ?? true,
      order: rule.order ?? contestRuleDefinitions[rule.key].order,
    });
  });

  const normalized = Array.from(ruleMap.values()).sort((a, b) => {
    const aOrder = a.order ?? contestRuleDefinitions[a.key].order;
    const bOrder = b.order ?? contestRuleDefinitions[b.key].order;
    return aOrder - bOrder;
  });

  return contestRuleConfigArraySchema.parse(normalized);
};

const getSubmissionLimitFromRules = (rules: ContestRuleConfigInput[]): number => {
  const rule = rules.find((r) => r.key === "SUBMISSION_LIMIT");
  const value = rule?.enabled === false ? undefined : rule?.value;

  return typeof value === "number" ? value : (contestRuleDefinitions.SUBMISSION_LIMIT.defaultValue as number);
};

const addContestRules = async (
  contestId: string,
  rules?: ContestRuleConfigInput[]
) => {
  const contest = await prisma.contest.findUnique({ where: { id: contestId } });

  if (!contest) {
    throw new ApiError(httpStatus.NOT_FOUND, "Contest not found");
  }

  const normalizedRules = normalizeContestRules(rules);

  const savedRules = await prisma.$transaction(async (tx) => {
    await tx.contestRuleConfig.deleteMany({ where: { contestId } });
    await tx.contestRuleConfig.createMany({
      data: normalizedRules.map((rule) => ({
        contestId,
        key: rule.key,
        value: rule.value,
        enabled: rule.enabled ?? true,
        order: rule.order ?? contestRuleDefinitions[rule.key].order,
      })),
    });

    return tx.contestRuleConfig.findMany({
      where: { contestId },
      orderBy: { order: "asc" },
    }) as Promise<RuleConfigRecord[]>;
  });
  await contestCache.invalidateContest(contestId);

  return savedRules;
};

const getContestRuleConfigs = async (contestId: string): Promise<RuleConfigRecord[]> => {
  return prisma.contestRuleConfig.findMany({
    where: { contestId },
    orderBy: { order: "asc" },
  }) as Promise<RuleConfigRecord[]>;
};

const getEffectiveContestRuleConfigs = async (contestId: string): Promise<RuleConfigRecord[]> => {
  const configs = await getContestRuleConfigs(contestId);
  if (configs.length > 0) {
    return configs;
  }

  const contest = await prisma.contest.findUnique({ where: { id: contestId } });
  if (!contest) {
    throw new ApiError(httpStatus.NOT_FOUND, "Contest not found");
  }

  return normalizeContestRules().map((rule) => ({
    key: rule.key,
    value: rule.value,
    enabled: rule.enabled ?? true,
    order: rule.order ?? contestRuleDefinitions[rule.key].order,
  }));
};

const getRuleConfigMap = async (contestId: string) => {
  const rules = await getEffectiveContestRuleConfigs(contestId);
  const map = new Map<ContestRuleKey, RuleConfigRecord>();

  rules.forEach((rule) => {
    if (isContestRuleKey(rule.key) && rule.enabled) {
      map.set(rule.key, rule);
    }
  });

  return map;
};

const getRuleValue = async <T>(contestId: string, key: ContestRuleKey): Promise<T> => {
  const ruleMap = await getRuleConfigMap(contestId);
  const rule = ruleMap.get(key);

  if (!rule) {
    return clone(contestRuleDefinitions[key].defaultValue) as T;
  }

  return rule.value as T;
};

// A contest's rules, loaded once. Validation that checks several rules should
// load this at the start, so one request does not query the rules many times.
const loadRuleSet = async (contestId: string) => {
  const configs = await getEffectiveContestRuleConfigs(contestId);

  return {
    // The rule's value, its default when it was never configured, or null when
    // an admin turned it off.
    value<T = any>(key: ContestRuleKey): T | null {
      const rule = configs.find((config) => config.key === key);
      if (rule && !rule.enabled) {
        return null;
      }
      return (rule?.value ?? clone(contestRuleDefinitions[key].defaultValue)) as T;
    },
  };
};

export type ContestRuleSet = Awaited<ReturnType<typeof loadRuleSet>>;

const getEnabledRuleValue = async <T>(contestId: string, key: ContestRuleKey): Promise<T | null> =>
  (await loadRuleSet(contestId)).value<T>(key);

const getContestRules = async (contestId: string) => {
  const configs = await getEffectiveContestRuleConfigs(contestId);

  return configs
    .filter((rule) => isContestRuleKey(rule.key) && rule.enabled)
    .map((rule) => {
      const definition = contestRuleDefinitions[rule.key as ContestRuleKey];

      return {
        key: definition.key,
        label: definition.label,
        name: definition.label,
        icon: definition.icon,
        inputType: definition.inputType,
        appliesTo: definition.appliesTo,
        displayOnly: definition.displayOnly,
        enabled: rule.enabled,
        order: rule.order,
        value: rule.value,
        description: summarizeRule(definition.key, rule.value),
      };
    })
    .sort((a, b) => a.order - b.order);
};

export const contestRuleService = {
  addContestRules,
  getContestRules,
  getContestRuleConfigs,
  getEffectiveContestRuleConfigs,
  getRuleConfigMap,
  getRuleValue,
  getEnabledRuleValue,
  loadRuleSet,
  formatRuleSummary: summarizeRule,
  getContestRuleDefinitions: getContestRuleDefinitionViews,
  normalizeContestRules,
  getSubmissionLimitFromRules,
};
