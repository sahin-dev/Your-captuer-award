import z from "zod";

export const contestRuleSchema = z.object({
    icon:z.string().optional(),
    name:z.string({required_error:"rule name is rwequired"}),
    description: z.string({required_error:"contest description is required"})
})

