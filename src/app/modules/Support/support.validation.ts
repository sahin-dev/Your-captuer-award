import z from "zod";
import { SupportStatus } from "../../../prismaClient";

const createSupportSchema = z.object({
  name: z.string({ required_error: "Name is required" }).min(1, "Name cannot be empty"),
  email: z.string({ required_error: "Email is required" }).email("Invalid email address"),
  subject: z.string({ required_error: "Subject is required" }).min(1, "Subject cannot be empty"),
  message: z.string({ required_error: "Message is required" }).min(1, "Message cannot be empty"),
});

const updateSupportStatusSchema = z.object({
  status: z.nativeEnum(SupportStatus, { required_error: "Status is required" }),
});

export const supportValidation = {
  createSupportSchema,
  updateSupportStatusSchema,
};
