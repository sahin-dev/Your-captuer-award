import z from 'zod'

export const SignInSchema = z.object({
    
emailorusername: z.string({required_error:"email or username is required"}),
password: z.string({required_error:"password is required"})

})