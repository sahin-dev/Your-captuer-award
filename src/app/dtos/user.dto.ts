import { User } from "@prisma/client";

export const UserDto = (user:User)=>{

    return {
        id:user.id,
        firstName:user.firstName,
        lastName: user.lastName,
        username:user.username,
        email: user.email,
        role: user.role,
        phone: user.phone,
        avatar: user.avatar
    }
}
