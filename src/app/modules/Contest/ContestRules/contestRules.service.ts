import ApiError from "../../../../errors/ApiError";
import prisma from "../../../../shared/prisma";
import httpStatus from "http-status";
import {
  ContestRuleDefinition,
  ContestRuleKey,
  contestRuleDefinitions,
  getContestRuleDefinitions as getContestRuleDefinitionConfigs,
  getContestRuleDefinitionViews,
  isContestRuleKey,
  LevelRequirementValue,
} from "./contestRule.definitions";
import { contestRuleConfigArraySchema } from "./contestRule.validation";
import { ContestRuleConfigInput } from "./contestRules.type";

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
  rules?: ContestRuleConfigInput[]
): ContestRuleConfigInput[] => {
  const ruleMap = new Map<ContestRuleKey, ContestRuleConfigInput>();

  buildDefaultContestRules().forEach((rule) => {
    ruleMap.set(rule.key, rule);
  });

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

const addContestRules = async (
  contestId: string,
  rules?: ContestRuleConfigInput[]
) => {
  const contest = await prisma.contest.findUnique({ where: { id: contestId } });

  if (!contest) {
    throw new ApiError(httpStatus.NOT_FOUND, "Contest not found");
  }

  const normalizedRules = normalizeContestRules(rules);

  await prisma.contestRuleConfig.deleteMany({ where: { contestId } });
  await prisma.contestRuleConfig.createMany({
    data: normalizedRules.map((rule) => ({
      contestId,
      key: rule.key,
      value: rule.value,
      enabled: rule.enabled ?? true,
      order: rule.order ?? contestRuleDefinitions[rule.key].order,
    })),
  });

  return getContestRuleConfigs(contestId);
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

const getEnabledRuleValue = async <T>(contestId: string, key: ContestRuleKey): Promise<T | null> => {
  const rules = await getEffectiveContestRuleConfigs(contestId);
  const rule = rules.find((config) => config.key === key);

  if (rule && !rule.enabled) {
    return null;
  }

  return (rule?.value ?? clone(contestRuleDefinitions[key].defaultValue)) as T;
};

const formatRuleSummary = (definition: ContestRuleDefinition, value: any) => {
  switch (definition.key) {
    case "SUBMISSION_LIMIT":
      return `${value} photo submits per participant`;
    case "SUBMISSION_RULES": {
      if (Array.isArray(value)) {
        return value.map((item: string) => `- ${item}`).join("\n");
      }

      const lines = [
        value?.intro,
        ...(value?.disallowed || []).map((item: string) => `- ${item}`),
        value?.removalNotice,
      ].filter(Boolean);
      return lines.join("\n");
    }
    case "LEVEL_REQUIREMENTS":
      return (value as LevelRequirementValue[])
        .map((item) => `- ${item.level.replace("_", " ")} - ${item.votes} votes`)
        .join("\n");
    case "SUBMISSION_FORMAT": {
      const mimeTypes = Array.isArray(value.mimeTypes) ? value.mimeTypes : [];
      const formats = mimeTypes
        .map((mimeType: string) => mimeType.replace("image/", "").toUpperCase())
        .join(", ");
      return `${formats}, minimum resolution of ${value.minWidth}px x ${value.minHeight}px, maximum size ${value.maxSizeMB}MB`;
    }
    default:
      return value?.text || "";
  }
};

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
        description: formatRuleSummary(definition, rule.value),
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
  getContestRuleDefinitions: getContestRuleDefinitionViews,
  normalizeContestRules,
};
