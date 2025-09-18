import z from "zod";
import { contestRuleSchema } from "./contestRule.validation";

export type ContestRule = z.infer<typeof contestRuleSchema>