import z from "zod";
import { contestPrizeSchema } from "./contestPrize.validation";

export type ContestPrize = z.infer<typeof contestPrizeSchema>