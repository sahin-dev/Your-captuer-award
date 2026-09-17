import z from "zod";

const createFaqSchema = z.object({
  question: z
    .string({ required_error: "Question is required" })
    .trim()
    .min(1, "Question cannot be empty"),
  answer: z
    .string({ required_error: "Answer is required" })
    .trim()
    .min(1, "Answer cannot be empty"),
  category: z.string().trim().min(1, "Category cannot be empty").optional(),
  order: z.coerce.number().int().optional(),
  isActive: z.boolean().optional(),
});

const updateFaqSchema = createFaqSchema.partial().refine((data) => Object.keys(data).length > 0, {
  message: "At least one field is required",
});

export const faqValidation = {
  createFaqSchema,
  updateFaqSchema,
};
