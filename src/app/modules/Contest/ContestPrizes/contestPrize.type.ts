import z from "zod";
import { contestPrizeSchema } from "./contestPrize.validation";

export type ContestPrizeData = z.infer<typeof contestPrizeSchema>