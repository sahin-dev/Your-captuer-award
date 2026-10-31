import ApiError from "../../../../errors/ApiError";
import { PrismaTx } from "../../../../shared/prisma";

// The items a user can spend. These are UserStore column names:
//   boost = promote a photo, swap = trade a photo, key = charge exposure,
//   coins = pay a contest entry fee
export type StoreItem = "boost" | "swap" | "key" | "coins";

export type NotEnoughError = { status: number; message: string };

// The only way to spend a store item. The balance check and the decrement are
// one database operation, so two requests at the same time can never take the
// balance below zero. Reading the balance first and updating it later cannot
// give that guarantee.
export const consumeStoreItem = async (
  tx: PrismaTx,
  userId: string,
  item: StoreItem,
  notEnough: NotEnoughError,
  amount = 1,
) => {
  const spent = await tx.userStore.updateMany({
    where: { userId, [item]: { gte: amount } },
    data: { [item]: { decrement: amount } },
  });

  if (spent.count !== 1) {
    throw new ApiError(notEnough.status, notEnough.message);
  }
};
