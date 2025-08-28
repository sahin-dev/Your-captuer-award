import z from "zod";
import { PrizeType } from "../../../../prismaClient";

export const contestPrizeSchema = z.object({
    category:z.nativeEnum(PrizeType,{invalid_type_error:"category is invalid. values must be Top-photo, Top-photographer, Top-yc-pic", required_error:"category is required"}),
    keys:z.string({ required_error:"keys are required"}),
    trades:z.string({ required_error:"trades are required"}),
    charges:z.string({ required_error:"charges are required"}),
})
