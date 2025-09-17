import facebook, {Profile, StrategyOptions} from "passport-facebook"
import config from "../../config";
import { userService } from "../modules/User/user.service";
import { IUser } from "../modules/User/user.interface";
import prisma from "../../shared/prisma";



const facebookConfig:StrategyOptions = {
    clientID:config.facebook.client_id as string, 
    clientSecret:config.facebook.client_secret as string, 
    callbackURL:config.facebook.callbackUrl as string,
    profileFields: ['id', 'displayName', 'photos', 'email']
}

const facebookCallback = async (accessToken:any, refreshToken:any, profile:Profile, done:any)=>{
    try{
        let user = await userService.getUserBySocialId("facebook", profile.id)
        if (!user){
         let userData:IUser = {
                socialProvider:"facebook",
                socialId: profile?.id,
                fullName: profile?.displayName,
                email: profile?.emails && profile?.emails[0]?.value,
                avatar: profile?.photos && profile?.photos[0]?.value,
                firstName:profile.name?.givenName,
                lastName:profile.name?.familyName
              };

            user = await  prisma.$transaction(async tx => {
                
                const user = await tx.user.create({data:
                {   
                    email:userData.email as string, 
                    firstName:userData.firstName as string, 
                    lastName:userData.lastName as string,
                    socialProvider:userData.socialProvider, 
                    socialId:userData.socialId,
                    avatar:userData.avatar
                }})

                await tx.userStore.create({data:{userId:user.id, promotes:0, charges:0, trades:0}})

                return user
            })
      }
        return done(null, user);

    }catch(error){
         console.error(error, "Error in Facebook Strategy");
        done(error, null);
    }
}

const facebookStrategy = new facebook.Strategy(facebookConfig, facebookCallback)

export default facebookStrategy
