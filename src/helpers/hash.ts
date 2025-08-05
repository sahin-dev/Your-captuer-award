import bcrypt from 'bcrypt'
import config from "../config"

const hashPassowrd = async (password:string)=>{
    const salt = config.bcrypt_salt_rounds as string
    if(!salt){
        throw new Error("Salt is not provided")
    }
    const hashedPassword = await bcrypt.hash(password, salt)

    return hashedPassword
}

export const hashing = {
    hashPassowrd
}