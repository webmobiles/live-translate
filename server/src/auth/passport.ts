import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { findOrCreateUser, findUserById } from './db';

export function configurePassport() {
  const clientID     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const callbackURL  = process.env.GOOGLE_CALLBACK_URL ?? 'http://localhost:4000/auth/google/callback';

  if (!clientID || !clientSecret) {
    console.warn('[auth] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set — Google login disabled');
    // Still wire up serialize/deserialize so sessions don't crash
    passport.serializeUser((user: any, done) => done(null, user.id));
    passport.deserializeUser(async (id: string, done) => {
      try { done(null, (await findUserById(id)) ?? false); } catch (err) { done(err); }
    });
    return;
  }

  passport.use(new GoogleStrategy(
    { clientID, clientSecret, callbackURL },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email    = profile.emails?.[0]?.value;
        const avatarUrl = profile.photos?.[0]?.value;
        const user = await findOrCreateUser({
          provider:   'google',
          providerId: profile.id,
          name:       profile.displayName,
          email,
          avatarUrl,
        });
        done(null, user);
      } catch (err) {
        done(err as Error);
      }
    },
  ));

  passport.serializeUser((user: any, done) => done(null, user.id));

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await findUserById(id);
      done(null, user ?? false);
    } catch (err) {
      done(err);
    }
  });
}
