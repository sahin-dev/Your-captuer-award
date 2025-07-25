import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });



const config =  {
    env: process.env.NODE_ENV,
    stripe_key:process.env.STRIPE_SECRET_KEY,
    forontend_url:process.env.FRONTEND_URL,
    port: process.env.PORT,
    db:process.env.DATABASE_URL,
    bcrypt_salt_rounds:process.env.BCRYPT_SALT_ROUNDS,
    webhook_secret:process.env.STRIPE_WEBHOOK_KEY,
    jwt: {
        jwt_secret: process.env.JWT_SECRET,
        expires_in: process.env.EXPIRES_IN,
        refresh_token_secret: process.env.REFRESH_TOKEN_SECRET,
        refresh_token_expires_in: process.env.REFRESH_TOKEN_EXPIRES_IN,
        reset_pass_secret: process.env.RESET_PASS_TOKEN,
        reset_pass_token_expires_in: process.env.RESET_PASS_TOKEN_EXPIRES_IN
    },
    google:{
        client_id:process.env.GOOGLE_CLIENT_ID, 
        client_secret:process.env.GOOGLE_CLIENT_SECRET, 
        callbackUrl:process.env.GOOGLE_CALLBACK_URL
    },
    facebook:{
        client_id: process.env.FACEBOOK_CLIENT_ID,
        client_secret: process.env.FACEBOOK_CLIENT_SECRET,
        callbackUrl: process.env.FACEBOOK_CALLBACK_URL
    },
    reset_pass_link: process.env.RESET_PASS_LINK,
    emailSender: {
        email: process.env.EMAIL,
        app_pass: process.env.APP_PASS
    },
    cloud:[{
        provider:"digitalOcean",
        endpoint: process.env.DO_SPACE_ENDPOINT,
        origin_endpoint: process.env.DO_SPACE_ORIGIN_ENDPOINT,
        access_key: process.env.DO_SPACE_ACCESS_KEY,
        secret_key: process.env.DO_SPACE_SECRET_KEY,
        bucket: process.env.DO_SPACE_BUCKET
        },
    ]
    

}
export default config