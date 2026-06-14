import { Router } from 'express';
import passport from 'passport';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { rateLimitLogin } from './rateLimiter';
import { updateProfile, updateAvatarUrl } from './db';
import { requireAuth } from './middleware';

const IMAGES_DIR = () => process.env.PROFILE_IMAGES_DIR ?? './data/images/profiles';

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = IMAGES_DIR();
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, _file, cb) => {
      const user = req.user as any;
      // Named by user id — overwrites previous upload
      cb(null, `${user.id}.jpg`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

const router = Router();

const FRONTEND_URL  = () => process.env.FRONTEND_URL  ?? 'http://localhost:5173';
const AFTER_LOGIN   = () => `${FRONTEND_URL()}/`;
const AFTER_LOGOUT  = () => `${FRONTEND_URL()}/login`;
const MOBILE_SCHEME = 'hellovia-translate://';

function getMobileReturnTo(value: unknown) {
  if (typeof value !== 'string') return null;
  if (!value.startsWith(MOBILE_SCHEME)) return null;
  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}

function withQuery(url: string, params: Record<string, string>) {
  const target = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    target.searchParams.set(key, value);
  }
  return target.toString();
}

// ── Google OAuth ──────────────────────────────────────────────────────────

const googleEnabled = () =>
  !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

router.get('/google', rateLimitLogin, (req, res, next) => {
  const mobileReturnTo = getMobileReturnTo(req.query.returnTo);
  if (mobileReturnTo) {
    (req.session as any).mobileReturnTo = mobileReturnTo;
  }

  if (!googleEnabled()) {
    if (mobileReturnTo) {
      return res.redirect(withQuery(mobileReturnTo, { error: 'google_not_configured' }));
    }
    return res.redirect(`${FRONTEND_URL()}/login?error=google_not_configured`);
  }
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    ...(mobileReturnTo ? { state: mobileReturnTo } : {}),
  })(req, res, next);
});

router.get('/google/callback', rateLimitLogin, (req, res, next) => {
  const mobileReturnTo =
    getMobileReturnTo(req.query.state) ??
    getMobileReturnTo((req.session as any).mobileReturnTo);
  delete (req.session as any).mobileReturnTo;

  if (!googleEnabled()) {
    if (mobileReturnTo) {
      return res.redirect(withQuery(mobileReturnTo, { error: 'google_not_configured' }));
    }
    return res.redirect(`${FRONTEND_URL()}/login?error=google_not_configured`);
  }
  passport.authenticate('google', {
    failureRedirect: mobileReturnTo
      ? withQuery(mobileReturnTo, { error: 'oauth_failed' })
      : `${FRONTEND_URL()}/login?error=oauth_failed`,
  })(req, res, (err?: any) => {
    if (err) return next(err);
    const user = req.user as any;
    if (mobileReturnTo) {
      return res.redirect(withQuery(mobileReturnTo, {
        status: 'ok',
        onboarding: !user?.nickname || !user?.mother_language ? '1' : '0',
      }));
    }
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

// ── Avatar upload ─────────────────────────────────────────────────────────

router.post('/profile/avatar', requireAuth, avatarUpload.single('avatar'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'no_file' });
    const user = req.user as any;
    const avatarUrl = `/uploads/profiles/${path.basename(req.file.path)}`;
    const updated = await updateAvatarUrl(user.id, avatarUrl);
    req.login(updated, err => {
      if (err) return next(err);
      res.json({ avatar_url: avatarUrl });
    });
  } catch (err) {
    next(err);
  }
});

export { router as authRouter };
