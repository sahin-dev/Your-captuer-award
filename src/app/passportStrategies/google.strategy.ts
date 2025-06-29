import passport from "passport";
import google, { Profile } from 'passport-google-oauth20'
import config from "../../config";
import { userService } from "../modules/User/user.service";
import { IUserRegister } from "../modules/User/user.interface";
import prisma from "../../shared/prisma";

const googleConfig = {
    clientID:config.google.client_id as string, 
    clientSecret:config.google.client_secret as string, 
    callbackURL:config.google.callbackUrl
}

const googleCallback = async (accessToken:any, refreshToken:any, profile:Profile, done:any)=>{
    console.log('# Google Profile --->', profile, "------------###############################------------");
  try {
    let user = await userService.getUserBySocialId("google", profile.id)
      if (!user){
         let userData:IUserRegister = {
                socialProvider:"google",
                socialId: profile?.id,
                fullName: profile?.displayName,
                email: profile?.emails && profile?.emails[0]?.value,
                avatar: profile?.photos && profile?.photos[0]?.value,
                firstName:profile.name?.givenName,
                lastName:profile.name?.familyName
              };

        user = await prisma.user.create({data:
                {   
                    email:userData.email as string, 
                    firstName:userData.firstName as string, 
                    lastName:userData.lastName as string,
                    socialProvider:userData.socialProvider, 
                    socialId:userData.socialId,
                    avatar:userData.avatar
                }})
      }

    return done(null, user);

  } catch (error) {
    console.error(error, "Error in Google Strategy");
    done(error, null);
  }
        
    }


const googleStrategy = new google.Strategy(googleConfig,googleCallback)



// passport.use(googleStrategy);

export default googleStrategy
