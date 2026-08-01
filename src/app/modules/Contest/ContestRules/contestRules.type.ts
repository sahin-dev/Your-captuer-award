import z from "zod";
import { contestRuleConfigArraySchema, contestRuleConfigSchema, contestRuleSchema } from "./contestRule.validation";

export type ContestRule = z.infer<typeof contestRuleSchema>
export type ContestRuleConfigInput = z.infer<typeof contestRuleConfigSchema>
export type ContestRuleConfigInputArray = z.infer<typeof contestRuleConfigArraySchema>
