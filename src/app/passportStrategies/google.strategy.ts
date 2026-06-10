import passport from "passport";
import google, { Profile } from 'passport-google-oauth20'
import config from "../../config";
import { userService } from "../modules/User/user.service";
import { IUser } from "../modules/User/user.interface";
import prisma from "../../shared/prisma";
import { userStoreService } from "../modules/User/UserStore/userStore.service";

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
    
    const email = profile.emails[0].value;
    let user = await userService.getUserByEmail("google", email);
    console.log(user);
    
    if (user) {
      // If the user exists but doesn't have Google linked, link it.
      if (!user.socialProvider || !user.socialId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            socialProvider: "google",
            socialId: profile.id,
            isActive: true, // Mark active since OAuth email is verified
            avatar: user.avatar || (profile.photos && profile.photos[0]?.value),
            fullName: user.fullName || profile.displayName
          }
        });
      }
    } else {
      let userData:IUser = {
        socialProvider:"google",
        socialId: profile?.id,
        fullName: profile?.displayName,
        email: email,
        avatar: profile?.photos && profile?.photos[0]?.value,
        firstName:profile.name?.givenName,
        lastName:profile.name?.familyName
      };

      user = await prisma.$transaction(async tx => {
        let createdUser = await tx.user.create({
          data: {   
            email: userData.email as string, 
            firstName: userData.firstName as string, 
            lastName: userData.lastName as string,
            fullName: userData.fullName as string,
            socialProvider: userData.socialProvider, 
            socialId: userData.socialId,
            avatar: userData.avatar,
            isActive: true // Mark active since OAuth email is verified
          }
        });
        await tx.userStore.create({ data: { userId: createdUser.id, key: 0, swap: 0, boost: 0, coins: 0 } });
        return createdUser;
      });
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
