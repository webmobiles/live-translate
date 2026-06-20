import { Router } from 'express';
import passport from 'passport';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { promisify } from 'util';
import { rateLimitLogin } from './rateLimiter';
import { createPasswordUser, findUserByEmail, setPasswordForUser, updateProfile, updateAvatarUrl, ensureApiToken, upsertPreuserWithCode, verifyPreuserCode, isEmailValidated, clearPreuser } from './db';
import { requireAuth } from './middleware';
import { publishVerificationEmail } from '../email/queue';

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
const scrypt = promisify(crypto.scrypt);

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

function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizePassword(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function publicUser(user: any) {
  const {
    id,
    nickname,
    first_name,
    last_name,
    country,
    email,
    avatar_url,
    mother_language,
    target_language,
    realtime_provider,
    realtime_seconds_used,
    realtime_seconds_credit,
    voice_seconds_used,
    voice_seconds_credit,
    text_words_used,
    text_words_credit,
  } = user;
  return {
    id,
    nickname,
    first_name,
    last_name,
    country,
    email,
    avatar_url,
    mother_language,
    target_language,
    realtime_provider,
    realtime_seconds_used,
    realtime_seconds_credit,
    voice_seconds_used,
    voice_seconds_credit,
    text_words_used,
    text_words_credit,
    usage_balance: {
      realtime: {
        provider: realtime_provider ?? null,
        usedSeconds: Number(realtime_seconds_used ?? 0),
        creditSeconds: Number(realtime_seconds_credit ?? 0),
        balanceSeconds: Number(realtime_seconds_credit ?? 0) - Number(realtime_seconds_used ?? 0),
      },
      voice: {
        usedSeconds: Number(voice_seconds_used ?? 0),
        creditSeconds: Number(voice_seconds_credit ?? 0),
        balanceSeconds: Number(voice_seconds_credit ?? 0) - Number(voice_seconds_used ?? 0),
      },
      text: {
        usedWords: Number(text_words_used ?? 0),
        creditWords: Number(text_words_credit ?? 0),
        balanceWords: Number(text_words_credit ?? 0) - Number(text_words_used ?? 0),
      },
    },
  };
}

// ── Email verification codes ────────────────────────────────────────────────

function codeTtlMs() {
  return (parseInt(process.env.EMAIL_CODE_TTL_SECONDS || '7200', 10)) * 1000;
}

function codeMaxAttempts() {
  return parseInt(process.env.EMAIL_CODE_MAX_ATTEMPTS || '5', 10);
}

function generateCode() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function hashCode(code: string) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

// System-wide password policy: at least 8 characters and one uppercase letter.
// Returns an i18n error code, or null when the password is acceptable.
function passwordError(password: string): string | null {
  if (password.length < 8) return 'password_too_short';
  if (!/[A-Z]/.test(password)) return 'password_no_uppercase';
  return null;
}

async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${key.toString('hex')}`;
}

async function verifyPassword(password: string, storedHash: string | null | undefined) {
  if (!storedHash) return false;
  const [scheme, salt, hash] = storedHash.split(':');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const key = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, 'hex');
  return expected.length === key.length && crypto.timingSafeEqual(expected, key);
}

function loginAndRespond(req: any, res: any, next: any, user: any) {
  req.login(publicUser(user), async (err: any) => {
    if (err) return next(err);
    // Mint a bearer token so native clients can authenticate later API calls.
    // Browser clients rely on the session cookie and simply ignore it.
    let token: string | null = null;
    try { token = await ensureApiToken(user.id); } catch (e) { return next(e); }
    res.json({
      user: publicUser(user),
      needsOnboarding: !user?.nickname || !user?.mother_language,
      token,
    });
  });
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
  })(req, res, async (err?: any) => {
    if (err) return next(err);
    const user = req.user as any;
    if (mobileReturnTo) {
      // The app has no cookie jar, so hand it a bearer token on the deep link.
      let token: string | null = null;
      try { token = await ensureApiToken(user.id); } catch (e) { return next(e); }
      return res.redirect(withQuery(mobileReturnTo, {
        status: 'ok',
        onboarding: !user?.nickname || !user?.mother_language ? '1' : '0',
        ...(token ? { token } : {}),
      }));
    }
    if (!user?.nickname || !user?.mother_language) {
      return res.redirect(`${FRONTEND_URL()}/onboarding`);
    }
    res.redirect(AFTER_LOGIN());
  });
});

// ── Email verification (registration codes) ─────────────────────────────────

// Step 1: arm a verification code and enqueue the email (Redpanda → emailWorker).
router.post('/email/send-code', rateLimitLogin, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'email_invalid' });

    // Already a full password account — they should sign in, not re-register.
    const existing = await findUserByEmail(email);
    if (existing?.password_hash) return res.status(409).json({ error: 'email_already_registered' });

    const code = generateCode();
    const expiresAt = new Date(Date.now() + codeTtlMs());
    const preuser = await upsertPreuserWithCode(email, hashCode(code), expiresAt);
    await publishVerificationEmail({ preuserId: preuser.id, email: preuser.email, code });

    // Never leak the code in the response.
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Step 2: verify the submitted code. Marks the pre-user validated on success,
// which is what gates /email/signup below.
router.post('/email/verify-code', rateLimitLogin, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    if (!email || !/^\d{6}$/.test(code)) return res.status(400).json({ error: 'invalid_code' });

    const result = await verifyPreuserCode(email, hashCode(code), codeMaxAttempts());
    if (!result.ok) return res.status(400).json({ error: result.reason });

    res.json({ verified: true });
  } catch (err) {
    next(err);
  }
});

// ── Email + password ──────────────────────────────────────────────────────

router.post('/email/signup', rateLimitLogin, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = normalizePassword(req.body?.password);
    const name = typeof req.body?.name === 'string' && req.body.name.trim()
      ? req.body.name.trim().slice(0, 255)
      : email.split('@')[0];

    if (!email || !email.includes('@')) return res.status(400).json({ error: 'email_invalid' });
    const pwError = passwordError(password);
    if (pwError) return res.status(400).json({ error: pwError });

    // Email must have passed code verification first (the pre-user is validated).
    if (!(await isEmailValidated(email))) return res.status(403).json({ error: 'email_not_verified' });

    const passwordHash = await hashPassword(password);
    const existing = await findUserByEmail(email);
    if (existing?.password_hash) return res.status(409).json({ error: 'email_already_registered' });

    const user = existing
      ? await setPasswordForUser(existing.id, passwordHash)
      : await createPasswordUser({ email, name, passwordHash });

    // Promoted to a real account — the pre-user row is no longer needed.
    await clearPreuser(email);

    loginAndRespond(req, res, next, user);
  } catch (err) {
    next(err);
  }
});

router.post('/email/login', rateLimitLogin, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = normalizePassword(req.body?.password);
    if (!email || !password) return res.status(400).json({ error: 'email_password_required' });

    const user = await findUserByEmail(email);
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return res.status(401).json({ error: 'invalid_credentials' });
    }

    loginAndRespond(req, res, next, user);
  } catch (err) {
    next(err);
  }
});

// ── Password reset (forgot password) ────────────────────────────────────────

// Step 1: email a reset code to a registered account. Anti-enumeration — always
// responds ok, and only arms/sends a code when the account actually exists. The
// client then verifies the code via /email/verify-code (shared with signup),
// which marks the pre-user validated.
router.post('/password/forgot', rateLimitLogin, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'email_invalid' });

    const user = await findUserByEmail(email);
    if (user) {
      const code = generateCode();
      const expiresAt = new Date(Date.now() + codeTtlMs());
      const preuser = await upsertPreuserWithCode(email, hashCode(code), expiresAt);
      await publishVerificationEmail({ preuserId: preuser.id, email: preuser.email, code });
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Step 2: set the new password. Gated on the code having been verified
// (pre-user validated). Does NOT auto-login — the client returns to /login.
router.post('/password/reset', rateLimitLogin, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = normalizePassword(req.body?.password);

    const pwError = passwordError(password);
    if (pwError) return res.status(400).json({ error: pwError });

    if (!(await isEmailValidated(email))) return res.status(403).json({ error: 'email_not_verified' });

    const user = await findUserByEmail(email);
    if (!user) return res.status(404).json({ error: 'user_not_found' });

    await setPasswordForUser(user.id, await hashPassword(password));
    await clearPreuser(email);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── Session ───────────────────────────────────────────────────────────────

router.get('/me', requireAuth, (req, res) => {
  res.json(publicUser(req.user as any));
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
    const { nickname, firstName, lastName, country, motherLanguage, targetLanguage } = req.body as {
      nickname: string;
      firstName?: string;
      lastName?: string;
      country?: string;
      motherLanguage: string;
      targetLanguage: string;
    };

    // Required for every save (onboarding + settings). first/last/country are
    // optional on the wire — onboarding omits them and the DB keeps the prior
    // value; the settings screen enforces them client-side.
    if (!nickname?.trim())       return res.status(400).json({ error: 'nickname_required' });
    if (!motherLanguage?.trim()) return res.status(400).json({ error: 'mother_language_required' });
    if (!targetLanguage?.trim()) return res.status(400).json({ error: 'target_language_required' });

    const user = req.user as any;
    const updated = await updateProfile(user.id, {
      nickname:       nickname.trim().slice(0, 100),
      firstName:      typeof firstName === 'string' ? firstName.trim().slice(0, 100) : undefined,
      lastName:       typeof lastName === 'string' ? lastName.trim().slice(0, 100) : undefined,
      country:        typeof country === 'string' ? country.trim().slice(0, 2).toUpperCase() : undefined,
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
