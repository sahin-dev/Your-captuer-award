import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });


const config =  {
    env: process.env.NODE_ENV,
    stripe_key:process.env.STRIPE_SECRET_KEY,
    forontend_url:process.env.FRONTEND_URL,
    port: process.env.PORT,
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
    google:{client_id:process.env.GOOGLE_CLIENT_ID, client_secret:process.env.GOOGLE_CLIENT_SECRET},
    reset_pass_link: process.env.RESET_PASS_LINK,
    emailSender: {
        email: process.env.EMAIL,
        app_pass: process.env.APP_PASS
    },

}
export default config