import z from "zod";


const userRegistrationSchema = z.object({
    firstname:z.string({required_error:"first name is required"}),
    lastname:z.string({required_error:"last name is required"}),
    email:z.string().email({message:"Email is invalid"}),
    phone:z.string({required_error:"phone is required"}),
    password:z.string({required_error:"password is required"})
})


export const userSchema = {
    userRegistrationSchema
}