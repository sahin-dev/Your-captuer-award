import z from "zod";


const resetPasswordSchema = z.object({
    email:z.string().email({message:"email is not valid"}),
    token: z.string(),
    password: z.string(),
    confirmPassword: z.string(),

}).refine(data => data.password === data.confirmPassword, {message:"Password do not match", path:['confirmPassword']})


export const userSchema = {

    resetPasswordSchema
}