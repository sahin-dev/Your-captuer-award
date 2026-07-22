import passport from 'passport';
import googleStrategy from './google.strategy';
import facebookStrategy from './facebook.strategy';

passport.use('google', googleStrategy);
passport.use('facebook', facebookStrategy);
