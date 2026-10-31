import { PaymentStatus, PaymentType } from "../../../prismaClient";
import prisma from "../../../shared/prisma";

// Photographer of the Year is a paid contest: every entry fee goes into one pot
// and this share of it is split between the 1st, 2nd and 3rd place winners.
export const POTY_PRIZE_POOL_SHARE_PERCENT = 60;

export type PotyPrizePool = {
  collectedFees: number;
  prizePool: number;
  sharePercent: number;
  currency: "USD";
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

  // Refunded entries leave SUCCEEDED, so they drop out of the pot automatically.
  const groups = await prisma.payment.groupBy({
    by: ["contestId"],
    where: { contestId: { in: contestIds }, type: PaymentType.CONTEST, status: PaymentStatus.SUCCEEDED },
    _sum: { amount: true },
  });
  const collectedByContestId = new Map(groups.map((group) => [group.contestId, group._sum.amount ?? 0]));

  contestIds.forEach((contestId) => {
    const collectedFees = roundMoney((collectedByContestId.get(contestId) ?? 0) + testCollectedFees());
    pools.set(contestId, {
      collectedFees,
      prizePool: roundMoney((collectedFees * POTY_PRIZE_POOL_SHARE_PERCENT) / 100),
      sharePercent: POTY_PRIZE_POOL_SHARE_PERCENT,
      currency: "USD",
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
