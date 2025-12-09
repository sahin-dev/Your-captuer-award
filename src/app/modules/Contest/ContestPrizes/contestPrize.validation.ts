import z from "zod";
import { PrizeType } from "../../../../prismaClient";

export const contestPrizeSchema = z.object({
    category:z.nativeEnum(PrizeType,{invalid_type_error:"category is invalid. values must be Top-photo, Top-photographer, Top-yc-pic", required_error:"category is required"}),
    key:z.number({ required_error:"keys are required"}),
    boost:z.number({ required_error:"Boost are required"}),
    swap:z.number({ required_error:"Swap are required"}),
})
