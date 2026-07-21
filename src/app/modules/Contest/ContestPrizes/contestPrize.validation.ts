import z from "zod";
import { AwardTarget, PrizeType } from "../../../../prismaClient";
import { isContestPrizeCategory } from "../../Awards/award.definitions";

export const contestPrizeSchema = z.object({
    category:z.nativeEnum(PrizeType,{invalid_type_error:"category is invalid. values must be Top-photo, Top-photographer, Top-yc-pic", required_error:"category is required"}).refine(isContestPrizeCategory, {
        message:"Contest level badges cannot be configured as prizes",
    }),
    target:z.nativeEnum(AwardTarget).optional(),
    rankLimit:z.number().int().positive().optional(),
    key:z.number({ required_error:"keys are required"}),
    boost:z.number({ required_error:"Boost are required"}),
    swap:z.number({ required_error:"Swap are required"}),
    coin:z.number().default(0),
})
