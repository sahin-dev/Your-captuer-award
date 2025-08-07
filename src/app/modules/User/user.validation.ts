import z from "zod";
import { UserLevel } from "../../../prismaClient";


const updateUserSchema = z.object({
    firstName:z.string().optional(),
    lastName:z.string().optional(),
    location: z.string().optional(),
})
// .transform(data => {
//     return Object.fromEntries( Object.entries(data).filter( ([_, v])=> v!== null))
// })

const updateUserAdminSchema = z.object({
    firstName:z.string().optional(),
    lastName:z.string().optional(),
    location: z.string().optional(),
    level:z.nativeEnum(UserLevel).optional()
})
const forgetPasswordSchema = z.object({
    email:z.string({required_error:"Email is required"}).email({message:"Email is invalid"})
})

const resetPasswordSchema = z.object({
    email:z.string().email({message:"email is not valid"}),
    token: z.string(),
    password: z.string(),
    confirmPassword: z.string(),

}).refine(data => data.password === data.confirmPassword, {message:"Password does not match", path:['confirmPassword']})


const changePasswordSchema = z.object({
    oldPassword: z.string(),
    newPassword: z.string(),

})

const verifyOtpSchema = z.object({
    email:z.string({required_error:"Email is required"}).email({message:"email is not valid"}),
    code:z.string({required_error:"code is required"})
})

export const userSchema = {

    resetPasswordSchema,
    updateUserSchema,
    updateUserAdminSchema,
    forgetPasswordSchema,
    changePasswordSchema,
    verifyOtpSchema
}