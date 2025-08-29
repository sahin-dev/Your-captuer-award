import passport from "passport";
import google, { Profile } from 'passport-google-oauth20'
import config from "../../config";
import { userService } from "../modules/User/user.service";
import { IUser } from "../modules/User/user.interface";
import prisma from "../../shared/prisma";

const googleConfig = {
    clientID:config.google.client_id as string, 
    clientSecret:config.google.client_secret as string, 
    callbackURL:config.google.callbackUrl
}

const googleCallback = async (accessToken:any, refreshToken:any, profile:Profile, done:any)=>{
    console.log('# Google Profile --->', profile, "------------###############################------------");
  try {
    

    if (!profile.emails || !profile.emails[0]?.value) {
      return done(new Error("No email found in Google profile"), null);
    }
    let user = await userService.getUserByEmail("google", profile.emails[0].value)
    console.log(user)
    
      if (!user){
         let userData:IUser = {
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
