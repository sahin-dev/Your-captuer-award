import httpStatus from "http-status";
import ApiError from "../../../errors/ApiError";
import prisma from "../../../shared/prisma";
import { AwardIdentity, contestLevelPrizeTypes, getAwardKey, getAwardSlotKey, normalizeAwardIdentity } from "../Awards/award.definitions";
import { z } from "zod";
import { contestAwardInputSchema, createPrizeSchema, updatePrizeSchema } from "./prize.validation";

type PrizeCreateData = z.infer<typeof createPrizeSchema>;
type PrizeUpdateData = z.infer<typeof updatePrizeSchema>;
type ContestAwardConfigData = z.infer<typeof contestAwardInputSchema>;

const ensurePrizeDefinitionAvailable = async (identity: AwardIdentity, ignoredPrizeId?: string) => {
  const existingPrize = await prisma.prize.findFirst({
    where: {
      type: identity.type,
      target: identity.target,
      rankLimit: identity.rankLimit,
      isActive: true,
      ...(ignoredPrizeId && { NOT: { id: ignoredPrizeId } }),
    },
  });

  if (existingPrize) {
    throw new ApiError(httpStatus.BAD_REQUEST, "An active prize already exists for this award");
  }
};

const createPrize = async (data: PrizeCreateData) => {
  const identity = normalizeAwardIdentity(data);
  await ensurePrizeDefinitionAvailable(identity);

  return prisma.prize.create({
    data: {
      ...data,
      ...identity,
    },
  });
};

const ensureUniqueAwardSlots = (prizes: Array<{category: any; type?: any; target?: any; rankLimit?: any}>) => {
  const slots = prizes.map((prize) => getAwardSlotKey(prize));
  if (new Set(slots).size !== slots.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Only one award threshold can be selected per award type and target");
  }
};

const getPrizes = async (includeInactive = false) => {
  return prisma.prize.findMany({
    where: {
      category: { notIn: contestLevelPrizeTypes },
      ...(includeInactive ? {} : { isActive: true }),
    },
    orderBy: { createdAt: "desc" },
  });
};

const getPrizeById = async (prizeId: string) => {
  const prize = await prisma.prize.findUnique({ where: { id: prizeId } });

  if (!prize) {
    throw new ApiError(httpStatus.NOT_FOUND, "Prize not found");
  }

  return prize;
};

const updatePrize = async (prizeId: string, data: PrizeUpdateData) => {
  const prize = await getPrizeById(prizeId);
  const identity = normalizeAwardIdentity({
    category: data.category ?? prize.category,
    type: data.type ?? prize.type,
    target: data.target ?? prize.target,
    rankLimit: data.rankLimit ?? prize.rankLimit,
  });

  await ensurePrizeDefinitionAvailable(identity, prize.id);

  return prisma.prize.update({
    where: { id: prizeId },
    data: {
      ...data,
      ...identity,
    },
  });
};

const deletePrize = async (prizeId: string) => {
  await getPrizeById(prizeId);

  return prisma.prize.update({
    where: { id: prizeId },
    data: { isActive: false },
  });
};

const getActivePrizesByIds = async (prizeIds: string[]) => {
  const uniquePrizeIds = [...new Set(prizeIds)];

  const prizes = await prisma.prize.findMany({
    where: {
      id: { in: uniquePrizeIds },
      isActive: true,
    },
  });

  if (prizes.length !== uniquePrizeIds.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, "One or more selected prizes are invalid or inactive");
  }

  const awardKeys = new Set(prizes.map((prize) => getAwardKey(prize)));
  if (awardKeys.size !== prizes.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Only one prize per award can be selected");
  }

  return prizes;
};

const getActivePrizesByAwardIdentities = async (identities: AwardIdentity[]) => {
  const uniqueIdentities = Array.from(
    new Map(identities.map((identity) => [getAwardKey(identity), identity])).values()
  );

  if (!uniqueIdentities.length) {
    return [];
  }

  const prizes = await prisma.prize.findMany({
    where: {
      isActive: true,
      OR: uniqueIdentities.flatMap((identity) => {
        const legacyIdentity = normalizeAwardIdentity({category:identity.category});
        const exactFilter = {
          type: identity.type,
          target: identity.target,
          rankLimit: identity.rankLimit,
        };

        if (legacyIdentity.target !== identity.target || legacyIdentity.rankLimit !== identity.rankLimit) {
          return [exactFilter];
        }

        return [exactFilter, {category: identity.category, type: null}];
      }),
    },
  });

  const prizeByAwardKey = new Map(prizes.map((prize) => [getAwardKey(prize), prize]));
  const selectedPrizes = uniqueIdentities.map((identity) => prizeByAwardKey.get(getAwardKey(identity)));

  if (selectedPrizes.some(prize => !prize)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "One or more selected award types are invalid or inactive");
  }

  return selectedPrizes.filter((prize): prize is NonNullable<typeof prize> => Boolean(prize));
};

const buildAwardRows = (prizes: Awaited<ReturnType<typeof getActivePrizesByIds>>, awards?: ContestAwardConfigData[]) => {
  const awardConfigByPrizeId = new Map(
    (awards || [])
      .filter((award): award is Extract<ContestAwardConfigData, {prizeId:string}> => "prizeId" in award)
      .map((award) => [award.prizeId, award])
  );
  const awardConfigByKey = new Map(
    (awards || [])
      .filter((award): award is Exclude<ContestAwardConfigData, {prizeId:string}> => !("prizeId" in award))
      .map((award) => [getAwardKey(award), award])
  );

  return prizes.map((prize) => {
    const identity = normalizeAwardIdentity(prize);
    const awardConfig = awardConfigByPrizeId.get(prize.id) || awardConfigByKey.get(getAwardKey(identity));
    const legacyAwardConfig = awardConfig && "prizeId" in awardConfig ? awardConfig : undefined;

    return {
      prizeId: prize.id,
      category: identity.category,
      type: identity.type,
      target: identity.target,
      rankLimit: identity.rankLimit,
      slotKey: getAwardSlotKey(identity),
      title: legacyAwardConfig?.title ?? prize.title,
      description: legacyAwardConfig?.description ?? prize.description,
      icon: legacyAwardConfig?.icon ?? prize.icon,
      key: awardConfig?.key ?? prize.key,
      boost: awardConfig?.boost ?? prize.boost,
      swap: awardConfig?.swap ?? prize.swap,
      coin: awardConfig?.coin ?? prize.coin,
    };
  });
};

const resolveAwardRows = async (prizeIds: string[] = [], awards: ContestAwardConfigData[] = []) => {
  const configuredPrizeIds = awards
    .filter((award): award is Extract<ContestAwardConfigData, {prizeId:string}> => "prizeId" in award)
    .map((award) => award.prizeId);
  const identities = awards
    .filter((award): award is Exclude<ContestAwardConfigData, {prizeId:string}> => !("prizeId" in award))
    .map((award) => normalizeAwardIdentity(award));
  const allPrizeIds = [...prizeIds, ...configuredPrizeIds];
  const prizes = [
    ...(allPrizeIds.length > 0 ? await getActivePrizesByIds(allPrizeIds) : []),
    ...(identities.length > 0 ? await getActivePrizesByAwardIdentities(identities) : []),
  ];

  ensureUniqueAwardSlots(prizes);
  return buildAwardRows(prizes, awards);
};

const createContestAwardsFromPrizeIds = async (contestId: string, prizeIds: string[]) => {
  if (!prizeIds.length) {
    return [];
  }

  const prizes = await getActivePrizesByIds(prizeIds);
  ensureUniqueAwardSlots(prizes);

  await prisma.contestAward.createMany({
    data: buildAwardRows(prizes).map((prize) => ({
      contestId,
      prizeId: prize.prizeId,
      category: prize.category,
      type: prize.type,
      target: prize.target,
      rankLimit: prize.rankLimit,
      slotKey: prize.slotKey,
      title: prize.title,
      description: prize.description,
      icon: prize.icon,
      key: prize.key,
      boost: prize.boost,
      swap: prize.swap,
      coin: prize.coin,
    })),
  });

  return getContestAwards(contestId);
};

const createContestAwardsFromConfigs = async (contestId: string, awards: ContestAwardConfigData[]) => {
  if (!awards.length) {
    return [];
  }

  const prizeIds = awards.filter((award): award is Extract<ContestAwardConfigData, {prizeId:string}> => "prizeId" in award).map((award) => award.prizeId);
  const identities = awards
    .filter((award): award is Exclude<ContestAwardConfigData, {prizeId:string}> => !("prizeId" in award))
    .map((award) => normalizeAwardIdentity(award));
  const prizes = [
    ...(prizeIds.length > 0 ? await getActivePrizesByIds(prizeIds) : []),
    ...(identities.length > 0 ? await getActivePrizesByAwardIdentities(identities) : []),
  ];
  ensureUniqueAwardSlots(prizes);

  await prisma.contestAward.createMany({
    data: buildAwardRows(prizes, awards).map((award) => ({
      contestId,
      ...award,
    })),
  });

  return getContestAwards(contestId);
};

const createRecurringContestAwardsFromPrizeIds = async (recurringContestId: string, prizeIds: string[]) => {
  if (!prizeIds.length) {
    return [];
  }

  const prizes = await getActivePrizesByIds(prizeIds);
  ensureUniqueAwardSlots(prizes);

  await prisma.recurringContestAward.createMany({
    data: buildAwardRows(prizes).map((prize) => ({
      recurringContestId,
      prizeId: prize.prizeId,
      category: prize.category,
      type: prize.type,
      target: prize.target,
      rankLimit: prize.rankLimit,
      slotKey: prize.slotKey,
      title: prize.title,
      description: prize.description,
      icon: prize.icon,
      key: prize.key,
      boost: prize.boost,
      swap: prize.swap,
      coin: prize.coin,
    })),
  });

  return getRecurringContestAwards(recurringContestId);
};

const createRecurringContestAwardsFromConfigs = async (
  recurringContestId: string,
  awards: ContestAwardConfigData[]
) => {
  if (!awards.length) {
    return [];
  }

  const prizeIds = awards.filter((award): award is Extract<ContestAwardConfigData, {prizeId:string}> => "prizeId" in award).map((award) => award.prizeId);
  const identities = awards
    .filter((award): award is Exclude<ContestAwardConfigData, {prizeId:string}> => !("prizeId" in award))
    .map((award) => normalizeAwardIdentity(award));
  const prizes = [
    ...(prizeIds.length > 0 ? await getActivePrizesByIds(prizeIds) : []),
    ...(identities.length > 0 ? await getActivePrizesByAwardIdentities(identities) : []),
  ];
  ensureUniqueAwardSlots(prizes);

  await prisma.recurringContestAward.createMany({
    data: buildAwardRows(prizes, awards).map((award) => ({
      recurringContestId,
      ...award,
    })),
  });

  return getRecurringContestAwards(recurringContestId);
};

const replaceRecurringContestAwards = async (recurringContestId: string, prizeIds: string[]) => {
  const rows = await resolveAwardRows(prizeIds);
  await prisma.$transaction(async tx => {
    await tx.recurringContestAward.deleteMany({ where: { recurringContestId } });
    if (rows.length > 0) {
      await tx.recurringContestAward.createMany({
        data: rows.map((row) => ({ recurringContestId, ...row })),
      });
    }
  });
  return getRecurringContestAwards(recurringContestId);
};

const copyRecurringAwardsToContest = async (recurringContestId: string, contestId: string) => {
  const awards = await prisma.recurringContestAward.findMany({ where: { recurringContestId } });

  if (!awards.length) {
    return [];
  }

  await prisma.contestAward.createMany({
    data: awards.map((award) => ({
      contestId,
      prizeId: award.prizeId,
      category: award.category,
      type: award.type,
      target: award.target,
      rankLimit: award.rankLimit,
      slotKey: award.slotKey || getAwardSlotKey(award),
      title: award.title,
      description: award.description,
      icon: award.icon,
      key: award.key,
      boost: award.boost,
      swap: award.swap,
      coin: award.coin,
    })),
  });

  return getContestAwards(contestId);
};

const getContestAwards = async (contestId: string) => {
  return prisma.contestAward.findMany({
    where: { contestId },
    include: {
      prize: {
        select: {
          id: true,
          category: true,
          type: true,
          target: true,
          rankLimit: true,
          title: true,
          description: true,
          icon: true,
          isActive: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
};

const getRecurringContestAwards = async (recurringContestId: string) => {
  return prisma.recurringContestAward.findMany({
    where: { recurringContestId },
    orderBy: { createdAt: "asc" },
  });
};

export const prizeService = {
  createPrize,
  getPrizes,
  getPrizeById,
  updatePrize,
  deletePrize,
  createContestAwardsFromPrizeIds,
  createContestAwardsFromConfigs,
  createRecurringContestAwardsFromPrizeIds,
  createRecurringContestAwardsFromConfigs,
  replaceRecurringContestAwards,
  copyRecurringAwardsToContest,
  getContestAwards,
  getRecurringContestAwards,
  resolveAwardRows,
};

