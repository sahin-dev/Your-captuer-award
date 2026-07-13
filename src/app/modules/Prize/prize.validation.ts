import { z } from "zod";
import { PrizeType } from "../../../prismaClient";

const numberField = z.preprocess((value) => {
  if (typeof value === "string" && value.trim() !== "") {
    return Number(value);
  }
  return value;
}, z.number().int().min(0).default(0));

export const createPrizeSchema = z.object({
  category: z.nativeEnum(PrizeType),
  title: z.string().optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
  key: numberField,
  boost: numberField,
  swap: numberField,
  coin: numberField,
});

export const updatePrizeSchema = createPrizeSchema.partial();

