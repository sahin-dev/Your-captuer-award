import passport from 'passport'
import passportGoogle from 'passport-google-oauth20'
import passportApple from 'passport-apple'
import config from '../config'
import prisma from '../shared/prisma'
import { generateToken } from './jwt'
import { Secret } from 'jsonwebtoken'
import fs from 'fs'

const GoogleStartegy = passportGoogle.Strategy
const AppleStrategy = passportApple.Strategy


passport.use(new GoogleStartegy({
    clientID:config.google.client_id as string,
    clientSecret:config.google.client_secret as string,
    callbackURL:"https://roady-5qly.onrender.com/api/v1/auth/google/callback"

},async (accessToken:any, refreshToken:any, profile:any, done:any) => {  
    // 🗂️ In a real app, you'd save the user info to your DB here  
  //   console.log('Google profile:', profile);  
  //   try {
  //     // Check if the user exists
  //     let user = await prisma.user.findFirstOrThrow({
  //       where: { email: profile.emails[0].value },
  //     });

  //     if (user) {
  //       // If not, create the user
  //       user = await prisma.user.create({
  //         data: {
  //           email: profile.emails[0].value,
  //           username: profile.displayName,
  //           firstName: profile.name?.givenName,
  //           lastName: profile.name?.familyName,
  //           photos: { url: profile.photos[0].value },
  //           isCompleteProfile: false,
  //           status: 'ACTIVE',
             
  //         },
  //       });
  //     }

      
  // const accessToken = generateToken(
  //   {
  //     id: user.id,
  //     email: user.email,
  //     role: user.role

  //   },
  //   config.jwt.jwt_secret as Secret,
  //   config.jwt.expires_in as string
  // );

      // Issue a JWT token
      // const token = jwt.sign(
      //   {
      //     id: user.id,
      //     email: user.email,
      //     role: user.role,
      //   },
      //   process.env.JWT_SECRET,
      //   { expiresIn: '7d' }
      // );

      // Pass the token to the next middleware
      return done(null, profile);
    // } catch (error) {
    //   return done(error, null);
    // }
  }  
)  )

// passport.use(new AppleStrategy({
//   clientID: 'com.example.app',            // Services ID
//   teamID: 'YOUR_TEAM_ID',
//   keyID: 'YOUR_KEY_ID',
//   callbackURL: '/api/v1/auth/apple/callback',
//   privateKeyString: fs.readFileSync('./AuthKey_XXXXXX.p8', 'utf8'), // OR use `privateKeyPath`
//   scope: ['name', 'email'],
//   passReqToCallback: true
// }, async (req, accessToken, refreshToken, idToken, profile, done) => {
//   try {
//     // You get profile info here
//     let user = await prisma.user.findFirstOrThrow({ where:{appleId:profile.id}});
//     if (!user) {
//       user = await prisma.user.create({data:{
//         appleId: profile.id,
//         email: profile.email,
//         username: profile.name?.firstName + ' ' + profile.name?.lastName,
//         firstName:profile.name?.firstName,
//         lastName:profile.name?.lastName

//       }});
//     }

      
//     return done(null, {user,accessToken});
//   } catch (err:any) {
//     return done(err);
//   }
// }));




// 🚀 Serialize user into session  
passport.serializeUser((user, done) => {  
    done(null, user);  
  });  
  passport.deserializeUser((user, done:any) => {  
    done(null, user);  
  });

