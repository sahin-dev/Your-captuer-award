import { ContestStatus, Prisma, RecurringContest } from "../../../../prismaClient";
import { toFileKey } from "../../../../helpers/fileUrl";
import prisma, { PrismaTx } from "../../../../shared/prisma";
import { getAwardSlotKey } from "../../Awards/award.definitions";
import { getStoredCategories, resolveCategoryInput } from "../contestCategories";
import { contestCategoryService } from "../contestCategory.service";
import { contestRuleDefinitions } from "../ContestRules/contestRule.definitions";
import { contestRuleService } from "../ContestRules/contestRules.service";
import { ContestRuleConfigInput } from "../ContestRules/contestRules.type";
import { contestData } from "../contest.type";
import { policyFor } from "../contestTypePolicy";
import { resolveBanner } from "./bannerResolver";

// A blueprint is everything needed to create one contest. There are two ways to
// make one (from an admin request, or from a recurring template) and one way to
// save it, so the save logic exists only once.

export type AwardRow = Omit<Prisma.ContestAwardCreateManyInput, "contestId">;
export type LevelAwardRow = Omit<Prisma.ContestLevelAwardCreateManyInput, "contestId">;

export type ContestBlueprint = {
  contest: Prisma.ContestUncheckedCreateInput;
  rules: ContestRuleConfigInput[];
  awards: AwardRow[];
  levelAwards: LevelAwardRow[];
};

// Settings shared by regular contests and recurring templates.
export const getMoneySettings = (body: contestData) => ({
  isMoneyContest: body.isMoneyContest,
  currency: body.isMoneyContest ? body.currency : null,
  minPrize: body.isMoneyContest ? body.minPrize : 0,
  maxPrize: body.isMoneyContest ? body.maxPrize : 0,
  entryFeeAmount: body.entryFeeAmount || 0,
  entryFeeCoins: body.coinRequirement === false ? 0 : (body.entryFeeCoins || 0),
});

export const shouldUseDefaultAwards = (body: contestData) =>
  body.prizeIds === undefined && body.prizes === undefined;

export const blueprintFromRequest = async (
  creatorId: string,
  body: contestData,
  bannerFile: Express.Multer.File,
): Promise<ContestBlueprint> => {
  const policy = policyFor(body);
  const rules = policy.applyRuleOverrides(
    contestRuleService.normalizeContestRules(body.rules, body.rules === undefined),
  );
  const awards = await policy.resolveAwards({
    prizeIds: body.prizeIds || [],
    prizes: body.prizes || [],
    useDefaults: shouldUseDefaultAwards(body),
  });
  const categoryData = await contestCategoryService.prepareCategoryUpdate(resolveCategoryInput(body));
  // Last, so a request with invalid rules or awards never uploads a file.
  const bannerData = await resolveBanner(body.bannerUserPhotoId, bannerFile);

  return {
    contest: {
      // Same id as the banner folder (contests/<id>/banner) when a banner was uploaded.
      id: bannerFile?.recordId,
      creatorId,
      title: body.title,
      description: body.description,
      status: ContestStatus.UPCOMING,
      isPhotographyOfYear: body.isPhotographyOfYear,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      maxUpload: policy.getSubmissionLimit(rules),
      ...policy.applyMoneyRules(getMoneySettings(body)),
      ...categoryData,
      ...bannerData,
    } as Prisma.ContestUncheckedCreateInput,
    rules,
    awards: awards as AwardRow[],
    levelAwards: policy.resolveLevelAwards(body.levelAwards) as LevelAwardRow[],
  };
};

// Builds the next occurrence of a recurring contest. Reading the template now
// means edits to it apply to every occurrence generated afterwards.
export const blueprintFromTemplate = async (
  template: RecurringContest,
  startDate: Date,
  endDate: Date,
  status: ContestStatus,
): Promise<ContestBlueprint> => {
  const rawRules = typeof template.rules === "string"
    ? JSON.parse(template.rules) as ContestRuleConfigInput[]
    : template.rules as ContestRuleConfigInput[];
  const rules = contestRuleService.normalizeContestRules(rawRules);
  const [awards, levelAwards] = await Promise.all([
    prisma.recurringContestAward.findMany({ where: { recurringContestId: template.id } }),
    prisma.recurringContestLevelAward.findMany({ where: { recurringContestId: template.id } }),
  ]);

  return {
    contest: {
      title: template.title,
      description: template.description,
      banner: toFileKey(template.banner),
      bannerUploaderId: template.bannerUploaderId,
      isMoneyContest: template.isMoneyContest,
      maxPrize: template.maxPrize,
      minPrize: template.minPrize,
      currency: template.currency,
      entryFeeAmount: template.entryFeeAmount,
      entryFeeCoins: template.entryFeeCoins,
      ...resolveCategoryInput({ categories: getStoredCategories(template) }),
      creatorId: template.creatorId,
      recurringContestId: template.id,
      startDate,
      endDate,
      status,
      maxUpload: contestRuleService.getSubmissionLimitFromRules(rules),
      ...(status === ContestStatus.ACTIVE && { startedAt: new Date() }),
    },
    rules,
    // Copy every column except the template's own ids and timestamps, so a new
    // award column reaches generated contests without changing this code.
    awards: awards.map(({ id, recurringContestId, createdAt, updatedAt, ...award }) => ({
      ...award,
      slotKey: award.slotKey || getAwardSlotKey(award),
    })),
    levelAwards: levelAwards.map(({ id, recurringContestId, createdAt, updatedAt, ...award }) => award),
  };
};

export const insertContestRules = async (tx: PrismaTx, contestId: string, rules: ContestRuleConfigInput[]) => {
  if (rules.length === 0) {
    return;
  }
  await tx.contestRuleConfig.createMany({
    data: rules.map((rule) => ({
      contestId,
      key: rule.key,
      value: rule.value,
      enabled: rule.enabled ?? true,
      order: rule.order ?? contestRuleDefinitions[rule.key].order,
    })),
  });
};

export const insertContestAwards = async (tx: PrismaTx, contestId: string, awards: AwardRow[]) => {
  if (awards.length > 0) {
    await tx.contestAward.createMany({ data: awards.map((award) => ({ ...award, contestId })) });
  }
};

export const insertContestLevelAwards = async (tx: PrismaTx, contestId: string, levelAwards: LevelAwardRow[]) => {
  if (levelAwards.length > 0) {
    await tx.contestLevelAward.createMany({ data: levelAwards.map((award) => ({ ...award, contestId })) });
  }
};

export const saveContestBlueprint = async (tx: PrismaTx, blueprint: ContestBlueprint) => {
  const contest = await tx.contest.create({ data: blueprint.contest });
  await insertContestRules(tx, contest.id, blueprint.rules);
  await insertContestAwards(tx, contest.id, blueprint.awards);
  await insertContestLevelAwards(tx, contest.id, blueprint.levelAwards);
  return contest;
};
