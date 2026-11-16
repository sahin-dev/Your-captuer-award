import { PaymentStatus, PaymentType } from "../../../prismaClient";
import prisma from "../../../shared/prisma";
import { resolveChargeCurrency, SupportedCurrency } from "../Payment/paymentCurrency";

// Entry fees for Photographer of the Year go into one pot. 40% of it is the
// prize pool divided among the winning participants; the other 60% is kept by
// the platform. A free contest has an empty pot. The split is not shown as text
// on the website, only the resulting prize pool amount.
export const POTY_PRIZE_POOL_SHARE_PERCENT = 40;
export const POTY_PLATFORM_SHARE_PERCENT = 100 - POTY_PRIZE_POOL_SHARE_PERCENT;

export type PotyPrizePool = {
  collectedFees: number;
  prizePool: number;
  sharePercent: number;
  platformShare: number;
  platformSharePercent: number;
  currency: SupportedCurrency;
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;

// Display-only test amount added to every POTY pot so the prize strap can be
// previewed before real entries exist. Leave unset in production.
const testCollectedFees = () => Number(process.env.POTY_TEST_COLLECTED_FEES_USD) || 0;

export const getPotyPrizePools = async (contestIds: string[]) => {
  const pools = new Map<string, PotyPrizePool>();
  if (contestIds.length === 0) {
    return pools;
  }

  // The pot is in the contest's currency. Its entry fee and currency lock once
  // anyone registers, so every paid entry is in that currency; a payment in
  // another currency (an old checkout) cannot be added to it.
  const [contests, groups] = await Promise.all([
    prisma.contest.findMany({ where: { id: { in: contestIds } }, select: { id: true, currency: true } }),
    // Refunded entries leave SUCCEEDED, so they drop out of the pot automatically.
    prisma.payment.groupBy({
      by: ["contestId", "currency"],
      where: { contestId: { in: contestIds }, type: PaymentType.CONTEST, status: PaymentStatus.SUCCEEDED },
      _sum: { amount: true },
    }),
  ]);
  const currencyByContestId = new Map(contests.map((contest) => [contest.id, resolveChargeCurrency(contest.currency)]));
  const collectedByContestId = new Map<string, number>();
  groups.forEach((group) => {
    if (!group.contestId) return;
    const currency = currencyByContestId.get(group.contestId) ?? resolveChargeCurrency(null);
    if (resolveChargeCurrency(group.currency) !== currency) return;
    collectedByContestId.set(group.contestId, (collectedByContestId.get(group.contestId) ?? 0) + (group._sum.amount ?? 0));
  });

  contestIds.forEach((contestId) => {
    const collectedFees = roundMoney((collectedByContestId.get(contestId) ?? 0) + testCollectedFees());
    const prizePool = roundMoney((collectedFees * POTY_PRIZE_POOL_SHARE_PERCENT) / 100);
    pools.set(contestId, {
      collectedFees,
      prizePool,
      sharePercent: POTY_PRIZE_POOL_SHARE_PERCENT,
      // Derived from the rounded pool so the two parts always add up to the fees.
      platformShare: roundMoney(collectedFees - prizePool),
      platformSharePercent: POTY_PLATFORM_SHARE_PERCENT,
      currency: currencyByContestId.get(contestId) ?? resolveChargeCurrency(null),
    });
  });

  return pools;
};

// Adds `potyPrizePool` to the Photographer of the Year contests in a list.
export const withPotyPrizePools = async <T extends { id: string; isPhotographyOfYear?: boolean | null }>(contests: T[]) => {
  const pools = await getPotyPrizePools(
    contests.filter((contest) => contest.isPhotographyOfYear).map((contest) => contest.id),
  );
  return contests.map((contest) => {
    const pool = pools.get(contest.id);
    return pool ? { ...contest, potyPrizePool: pool } : contest;
  });
};
