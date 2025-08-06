import z from "zod";
import { SignInSchema, userRegistrationSchema } from "./auth.validation";

export type UserRegistrationData = z.infer<typeof userRegistrationSchema>

export type UserSignInData = z.infer<typeof SignInSchema>