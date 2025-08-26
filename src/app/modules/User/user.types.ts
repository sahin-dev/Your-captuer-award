import z from "zod";
import { userSchema } from "./user.validation";

export type userUpdateData = z.infer<typeof userSchema.updateUserSchema>

export type userAdminUpdateData = z.infer<typeof userSchema.updateUserAdminSchema>
