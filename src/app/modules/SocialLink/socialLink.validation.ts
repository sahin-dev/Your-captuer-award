import z from "zod";
import { SocialPlatform } from "../../../prismaClient";

const createSocialLinkSchema = z.object({
  platform: z.nativeEnum(SocialPlatform, { required_error: "platform is required" }),
  url: z.string({ required_error: "url is required" }).trim().url("Must be a valid URL"),
  order: z.coerce.number().int().optional(),
  isActive: z.boolean().optional(),
});

const updateSocialLinkSchema = z.object({
  platform: z.nativeEnum(SocialPlatform).optional(),
  url: z.string().trim().url("Must be a valid URL").optional(),
  order: z.coerce.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const socialLinkValidation = {
  createSocialLinkSchema,
  updateSocialLinkSchema,
};
