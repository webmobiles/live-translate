import { Router } from 'express';
import passport from 'passport';
import { rateLimitLogin } from './rateLimiter';
import { updateProfile } from './db';
import { requireAuth } from './middleware';

const router = Router();

const FRONTEND_URL  = () => process.env.FRONTEND_URL  ?? 'http://localhost:5173';
const AFTER_LOGIN   = () => `${FRONTEND_URL()}/`;
const AFTER_LOGOUT  = () => `${FRONTEND_URL()}/login`;

// ── Google OAuth ──────────────────────────────────────────────────────────

const googleEnabled = () =>
  !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

router.get('/google', rateLimitLogin, (req, res, next) => {
  if (!googleEnabled()) {
    return res.redirect(`${FRONTEND_URL()}/login?error=google_not_configured`);
  }
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

router.get('/google/callback', rateLimitLogin, (req, res, next) => {
  if (!googleEnabled()) {
    return res.redirect(`${FRONTEND_URL()}/login?error=google_not_configured`);
  }
  passport.authenticate('google', {
    failureRedirect: `${FRONTEND_URL()}/login?error=oauth_failed`,
  })(req, res, (err?: any) => {
    if (err) return next(err);
    const user = req.user as any;
    if (!user?.nickname || !user?.mother_language) {
      return res.redirect(`${FRONTEND_URL()}/onboarding`);
    }
    res.redirect(AFTER_LOGIN());
  });
});

// ── Session ───────────────────────────────────────────────────────────────

router.get('/me', (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'unauthenticated' });
  const { id, name, nickname, email, avatar_url, mother_language, target_language } = req.user as any;
  res.json({ id, name, nickname, email, avatar_url, mother_language, target_language });
});

router.post('/logout', requireAuth, (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);
    req.session.destroy(() => {
      res.clearCookie('lt.sid');
      res.redirect(AFTER_LOGOUT());
    });
  });
});

// ── Profile (onboarding + updates) ────────────────────────────────────────

router.patch('/profile', requireAuth, async (req, res, next) => {
  try {
    const { nickname, motherLanguage, targetLanguage } = req.body as {
      nickname: string;
      motherLanguage: string;
      targetLanguage: string;
    };

    if (!nickname?.trim())       return res.status(400).json({ error: 'nickname_required' });
    if (!motherLanguage?.trim()) return res.status(400).json({ error: 'mother_language_required' });
    if (!targetLanguage?.trim()) return res.status(400).json({ error: 'target_language_required' });

    const user = req.user as any;
    const updated = await updateProfile(user.id, {
      nickname:       nickname.trim().slice(0, 100),
      motherLanguage: motherLanguage.trim().slice(0, 10),
      targetLanguage: targetLanguage.trim().slice(0, 10),
    });

    // Refresh passport session with updated user
    req.login(updated, err => {
      if (err) return next(err);
      res.json(updated);
    });
  } catch (err) {
    next(err);
  }
});

export { router as authRouter };
