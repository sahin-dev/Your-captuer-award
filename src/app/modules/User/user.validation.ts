import z from "zod";
import { IUser } from "./user.interface";


const updateUserSchema = z.object({
    firstName:z.string().optional(),
    lastName:z.string().optional(),
    location: z.string().optional(),

})
// .transform(data => {
//     return Object.fromEntries( Object.entries(data).filter( ([_, v])=> v!== null))
// })

const resetPasswordSchema = z.object({
    email:z.string().email({message:"email is not valid"}),
    token: z.string(),
    password: z.string(),
    confirmPassword: z.string(),

}).refine(data => data.password === data.confirmPassword, {message:"Password do not match", path:['confirmPassword']})


export const userSchema = {

    resetPasswordSchema,
    updateUserSchema
}