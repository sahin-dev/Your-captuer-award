import facebook, {Profile, StrategyOptions} from "passport-facebook"
import config from "../../config";
import { IUser } from "../modules/User/user.interface";
import prisma from "../../shared/prisma";
import globalEventHandler from "../event/eventEmitter";
import Events from "../event/events.constant";

const facebookConfig:StrategyOptions = {
    clientID:config.facebook.client_id as string, 
    clientSecret:config.facebook.client_secret as string, 
    callbackURL:config.facebook.callbackUrl as string,
    profileFields: ['id', 'displayName', 'name', 'photos', 'email']
}

const facebookCallback = async (accessToken:any, refreshToken:any, profile:Profile, done:any)=>{
    try{
        // 1. Try to find user by social provider and social ID
        let user = await prisma.user.findFirst({
            where: { socialProvider: "facebook", socialId: profile.id }
        });

        // 2. If not found by social ID, check by email
        if (!user) {
            const email = (profile.emails && profile.emails[0]?.value) || null;
            if (email) {
                user = await prisma.user.findUnique({ where: { email } });
                if (user) {
                    // Check if user is blocked before linking
                    if (user.isBlocked) {
                        return done(new Error("Your account is blocked!"), null);
                    }

                    // Link existing account
                    user = await prisma.user.update({
                        where: { id: user.id },
                        data: {
                            socialProvider: "facebook",
                            socialId: profile.id,
                            isActive: true, // Mark active since OAuth is authenticated
                            avatar: user.avatar || (profile.photos && profile.photos[0]?.value),
                            fullName: user.fullName || profile.displayName
                        }
                    });
                }
            }
        } else {
            // User was found by social ID, check if they are blocked
            if (user.isBlocked) {
                return done(new Error("Your account is blocked!"), null);
            }
        }

        // 3. If user still does not exist, register new user
        if (!user){
            // Fallback email if Facebook did not provide one
            const finalEmail = (profile.emails && profile.emails[0]?.value) || `facebook_${profile.id}@yourcaptureawards.com`;
            let userData:IUser = {
                socialProvider:"facebook",
                socialId: profile?.id,
                fullName: profile?.displayName,
                email: finalEmail,
                avatar: profile?.photos && profile?.photos[0]?.value,
                firstName:profile.name?.givenName,
                lastName:profile.name?.familyName
            };

            user = await prisma.$transaction(async tx => {
                const createdUser = await tx.user.create({
                    data: {   
                        email:userData.email as string, 
                        firstName:userData.firstName as string, 
                        lastName:userData.lastName as string,
                        fullName:userData.fullName as string,
                        socialProvider:userData.socialProvider, 
                        socialId:userData.socialId,
                        avatar:userData.avatar,
                        isActive: true // Mark active since OAuth email is verified
                    }
                });

                await tx.userStore.create({data:{userId:createdUser.id, key:0, boost:0, swap:0, coins:0}});

                return createdUser;
            });

            // Publish a new user registration event
            globalEventHandler.publish(Events.USER_REGISTERED, user);
        }
        return done(null, user);

    }catch(error){
         console.error(error, "Error in Facebook Strategy");
        done(error, null);
    }
}

const facebookStrategy = new facebook.Strategy(facebookConfig, facebookCallback)

export default facebookStrategy
