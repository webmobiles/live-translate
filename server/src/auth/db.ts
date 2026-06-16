import pg from 'pg';
import { logger } from '../observability/logger';

const { Pool } = pg;

export let pool: pg.Pool;

export async function connectAuthDb() {
  const url = process.env.AUTH_DB_URL;
  if (!url) throw new Error('AUTH_DB_URL is not set');

  pool = new Pool({ connectionString: url });
  await pool.query('SELECT 1');
  await initSchema();
  logger.info({ event: 'auth_db.connected' }, 'Auth DB connected');
}

async function initSchema() {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    -- ── Users ────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS users (
      id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      nickname         VARCHAR(100),
      first_name       VARCHAR(100),
      last_name        VARCHAR(100),
      country          VARCHAR(2),
      email            VARCHAR(255) UNIQUE,
      avatar_url       TEXT,
      provider         VARCHAR(20)  NOT NULL DEFAULT 'google',
      provider_id      VARCHAR(255),
      password_hash    TEXT,
      mother_language  VARCHAR(10),
      target_language  VARCHAR(10),
      created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_provider UNIQUE (provider, provider_id)
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;

    -- ── Profile fields (replaces the legacy single name column) ──────────────
    ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name  VARCHAR(100);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS country    VARCHAR(2);

    -- Migrate any existing name into first_name, then drop it. Guarded so this
    -- is a no-op on fresh databases (which never create the column).
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'name'
      ) THEN
        UPDATE users SET first_name = name
          WHERE first_name IS NULL AND name IS NOT NULL AND name <> '';
        ALTER TABLE users DROP COLUMN name;
      END IF;
    END $$;

    -- Long-lived bearer token for native clients (the phone has no cookie jar).
    ALTER TABLE users ADD COLUMN IF NOT EXISTS api_token UUID;

    -- ── Sessions ─────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS session (
      sid    VARCHAR      NOT NULL COLLATE "default",
      sess   JSONB        NOT NULL,
      expire TIMESTAMPTZ  NOT NULL,
      CONSTRAINT session_pkey PRIMARY KEY (sid)
    );
    CREATE INDEX IF NOT EXISTS session_expire_idx ON session (expire);

    -- ── Rate limits ───────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS rate_limits (
      key        VARCHAR(255) PRIMARY KEY,
      points     INTEGER      NOT NULL DEFAULT 0,
      expire     BIGINT
    );
    CREATE INDEX IF NOT EXISTS rate_limits_expire_idx ON rate_limits (expire);

    -- ── Language credit defaults (one row per supported language) ─────────────
    CREATE TABLE IF NOT EXISTS language_credits_defaults (
      language_code   VARCHAR(10)   PRIMARY KEY,
      language_name   VARCHAR(100)  NOT NULL,
      free_words      INTEGER       NOT NULL DEFAULT 10000,
      free_seconds    INTEGER       NOT NULL DEFAULT 7200,
      updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    );

    -- ── Per-user per-language credits ─────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS user_language_credits (
      id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      language_code     VARCHAR(10) NOT NULL,
      words_remaining   INTEGER     NOT NULL DEFAULT 0,
      seconds_remaining INTEGER     NOT NULL DEFAULT 0,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_user_lang_credits UNIQUE (user_id, language_code)
    );

    -- ── Per-user per-language usage stats (running totals) ───────────────────
    CREATE TABLE IF NOT EXISTS user_language_stats (
      id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id                 UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      language_code           VARCHAR(10) NOT NULL,
      words_consumed          BIGINT      NOT NULL DEFAULT 0,
      seconds_consumed        BIGINT      NOT NULL DEFAULT 0,
      guest_words_consumed    BIGINT      NOT NULL DEFAULT 0,
      guest_seconds_consumed  BIGINT      NOT NULL DEFAULT 0,
      created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_user_lang_stats UNIQUE (user_id, language_code)
    );

    -- ── Detailed usage log ────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS usage_log (
      id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      room_code      VARCHAR(20),
      language_code  VARCHAR(10) NOT NULL,
      usage_type     VARCHAR(10) NOT NULL CHECK (usage_type IN ('words','audio')),
      amount         INTEGER     NOT NULL CHECK (amount > 0),
      is_guest       BOOLEAN     NOT NULL DEFAULT FALSE,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS usage_log_user_idx ON usage_log (user_id, created_at DESC);

    -- ── Billing per user ──────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS user_billing (
      id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
      balance         NUMERIC(12,4) NOT NULL DEFAULT 0,
      currency        VARCHAR(3)    NOT NULL DEFAULT 'USD',
      total_paid      NUMERIC(12,4) NOT NULL DEFAULT 0,
      total_consumed  NUMERIC(12,4) NOT NULL DEFAULT 0,
      created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    );

    -- ── Payment history ───────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS payments (
      id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount       NUMERIC(12,4) NOT NULL CHECK (amount > 0),
      currency     VARCHAR(3)    NOT NULL DEFAULT 'USD',
      status       VARCHAR(20)   NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','completed','failed','refunded')),
      provider     VARCHAR(50),
      provider_ref VARCHAR(255),
      created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS payments_user_idx ON payments (user_id, created_at DESC);

    -- ── Email verifications (future self-registration) ────────────────────────
    CREATE TABLE IF NOT EXISTS email_verifications (
      id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      email      VARCHAR(255) NOT NULL,
      token      VARCHAR(255) NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ  NOT NULL,
      used       BOOLEAN      NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
  `);

  await seedLanguageDefaults();
}

const LANGUAGE_DEFAULTS: [string, string][] = [
  ['af', 'Afrikaans'],  ['sq', 'Albanian'],    ['am', 'Amharic'],
  ['ar', 'Arabic'],     ['hy', 'Armenian'],    ['az', 'Azerbaijani'],
  ['eu', 'Basque'],     ['be', 'Belarusian'],  ['bn', 'Bengali'],
  ['bs', 'Bosnian'],    ['bg', 'Bulgarian'],   ['ca', 'Catalan'],
  ['zh', 'Chinese'],    ['hr', 'Croatian'],    ['cs', 'Czech'],
  ['da', 'Danish'],     ['nl', 'Dutch'],       ['en', 'English'],
  ['et', 'Estonian'],   ['fi', 'Finnish'],     ['fr', 'French'],
  ['gl', 'Galician'],   ['ka', 'Georgian'],    ['de', 'German'],
  ['el', 'Greek'],      ['gu', 'Gujarati'],    ['ht', 'Haitian Creole'],
  ['ha', 'Hausa'],      ['he', 'Hebrew'],      ['hi', 'Hindi'],
  ['hu', 'Hungarian'],  ['is', 'Icelandic'],   ['ig', 'Igbo'],
  ['id', 'Indonesian'], ['ga', 'Irish'],       ['it', 'Italian'],
  ['ja', 'Japanese'],   ['kn', 'Kannada'],     ['kk', 'Kazakh'],
  ['km', 'Khmer'],      ['ko', 'Korean'],      ['ku', 'Kurdish'],
  ['ky', 'Kyrgyz'],     ['lo', 'Lao'],         ['lv', 'Latvian'],
  ['lt', 'Lithuanian'], ['lb', 'Luxembourgish'],['mk', 'Macedonian'],
  ['mg', 'Malagasy'],   ['ms', 'Malay'],       ['ml', 'Malayalam'],
  ['mt', 'Maltese'],    ['mi', 'Maori'],       ['mr', 'Marathi'],
  ['mn', 'Mongolian'],  ['my', 'Myanmar'],     ['ne', 'Nepali'],
  ['no', 'Norwegian'],  ['ps', 'Pashto'],      ['fa', 'Persian'],
  ['pl', 'Polish'],     ['pt', 'Portuguese'],  ['pa', 'Punjabi'],
  ['ro', 'Romanian'],   ['ru', 'Russian'],     ['sm', 'Samoan'],
  ['sr', 'Serbian'],    ['st', 'Sesotho'],     ['sn', 'Shona'],
  ['sd', 'Sindhi'],     ['si', 'Sinhala'],     ['sk', 'Slovak'],
  ['sl', 'Slovenian'],  ['so', 'Somali'],      ['es', 'Spanish'],
  ['su', 'Sundanese'],  ['sw', 'Swahili'],     ['sv', 'Swedish'],
  ['tl', 'Tagalog'],    ['tg', 'Tajik'],       ['ta', 'Tamil'],
  ['te', 'Telugu'],     ['th', 'Thai'],        ['tr', 'Turkish'],
  ['uk', 'Ukrainian'],  ['ur', 'Urdu'],        ['uz', 'Uzbek'],
  ['vi', 'Vietnamese'], ['cy', 'Welsh'],       ['xh', 'Xhosa'],
  ['yi', 'Yiddish'],    ['yo', 'Yoruba'],      ['zu', 'Zulu'],
];

async function seedLanguageDefaults() {
  if (LANGUAGE_DEFAULTS.length === 0) return;
  const values = LANGUAGE_DEFAULTS
    .map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2}, 10000, 7200)`)
    .join(', ');
  const params = LANGUAGE_DEFAULTS.flat();
  await pool.query(
    `INSERT INTO language_credits_defaults (language_code, language_name, free_words, free_seconds)
     VALUES ${values}
     ON CONFLICT (language_code) DO NOTHING`,
    params,
  );
}

export async function findOrCreateUser(profile: {
  provider: string;
  providerId: string;
  name: string;
  email?: string;
  avatarUrl?: string;
}): Promise<{ id: string; nickname: string | null; first_name: string | null; last_name: string | null; country: string | null; mother_language: string | null; target_language: string | null }> {
  // The provider's display name seeds first_name for brand-new accounts; we
  // never overwrite a name the user has already edited in settings.
  const byProvider = await pool.query(
    `UPDATE users
     SET first_name = COALESCE(first_name, NULLIF($3, '')),
         email      = COALESCE($4, email),
         avatar_url = COALESCE($5, avatar_url),
         updated_at = NOW()
     WHERE provider = $1 AND provider_id = $2
     RETURNING id, nickname, first_name, last_name, country, mother_language, target_language`,
    [profile.provider, profile.providerId, profile.name, profile.email ?? null, profile.avatarUrl ?? null],
  );
  if (byProvider.rows[0]) return byProvider.rows[0];

  if (profile.email) {
    const byEmail = await pool.query(
      `UPDATE users
       SET first_name = COALESCE(first_name, NULLIF($1, '')),
           avatar_url = COALESCE($2, avatar_url),
           provider = $3,
           provider_id = $4,
           updated_at = NOW()
       WHERE lower(email) = lower($5)
       RETURNING id, nickname, first_name, last_name, country, mother_language, target_language`,
      [profile.name, profile.avatarUrl ?? null, profile.provider, profile.providerId, profile.email],
    );
    if (byEmail.rows[0]) return byEmail.rows[0];
  }

  const inserted = await pool.query(
    `INSERT INTO users (first_name, email, avatar_url, provider, provider_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, nickname, first_name, last_name, country, mother_language, target_language`,
    [profile.name, profile.email ?? null, profile.avatarUrl ?? null, profile.provider, profile.providerId],
  );
  return inserted.rows[0];
}

export async function findUserByEmail(email: string) {
  const { rows } = await pool.query(
    `SELECT id, nickname, first_name, last_name, country, email, avatar_url, mother_language, target_language, password_hash
     FROM users WHERE lower(email) = lower($1)`,
    [email],
  );
  return rows[0] ?? null;
}

export async function createPasswordUser(data: {
  email: string;
  name: string;
  passwordHash: string;
}) {
  const { rows } = await pool.query(
    `INSERT INTO users (first_name, email, provider, provider_id, password_hash)
     VALUES ($1, $2, 'email', $4, $3)
     RETURNING id, nickname, first_name, last_name, country, email, avatar_url, mother_language, target_language`,
    [data.name, data.email, data.passwordHash, data.email.toLowerCase()],
  );
  return rows[0];
}

export async function setPasswordForUser(id: string, passwordHash: string) {
  const { rows } = await pool.query(
    `UPDATE users
     SET password_hash = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING id, nickname, first_name, last_name, country, email, avatar_url, mother_language, target_language`,
    [id, passwordHash],
  );
  return rows[0] ?? null;
}

export async function findUserById(id: string) {
  const { rows } = await pool.query(
    `SELECT id, nickname, first_name, last_name, country, email, avatar_url, mother_language, target_language
     FROM users WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function updateProfile(id: string, data: {
  nickname: string;
  firstName?: string;
  lastName?: string;
  country?: string;
  motherLanguage: string;
  targetLanguage: string;
}) {
  // COALESCE($n, column) leaves first/last/country untouched when the caller
  // (e.g. onboarding) passes undefined → null, so a partial save never wipes them.
  const { rows } = await pool.query(
    `UPDATE users
     SET nickname        = $2,
         first_name      = COALESCE($3, first_name),
         last_name       = COALESCE($4, last_name),
         country         = COALESCE($5, country),
         mother_language = $6,
         target_language = $7,
         updated_at      = NOW()
     WHERE id = $1
     RETURNING id, nickname, first_name, last_name, country, email, avatar_url, mother_language, target_language`,
    [id, data.nickname, data.firstName ?? null, data.lastName ?? null, data.country ?? null, data.motherLanguage, data.targetLanguage],
  );
  return rows[0] ?? null;
}

export async function updateAvatarUrl(id: string, avatarUrl: string) {
  const { rows } = await pool.query(
    `UPDATE users
     SET avatar_url = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING id, nickname, first_name, last_name, country, email, avatar_url, mother_language, target_language`,
    [id, avatarUrl],
  );
  return rows[0] ?? null;
}

// ── Native-client bearer tokens ──────────────────────────────────────────────

/** Returns the user's API token, minting one on first use. */
export async function ensureApiToken(id: string): Promise<string | null> {
  const { rows } = await pool.query(
    `UPDATE users
     SET api_token = COALESCE(api_token, gen_random_uuid())
     WHERE id = $1
     RETURNING api_token`,
    [id],
  );
  return rows[0]?.api_token ?? null;
}

/** Looks up a user by bearer token (public columns only — same shape as the session user). */
export async function findUserByApiToken(token: string) {
  const { rows } = await pool.query(
    `SELECT id, nickname, first_name, last_name, country, email, avatar_url, mother_language, target_language
     FROM users WHERE api_token = $1`,
    [token],
  );
  return rows[0] ?? null;
}
