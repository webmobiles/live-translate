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

    CREATE TABLE IF NOT EXISTS users (
      id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      name             VARCHAR(255) NOT NULL,
      nickname         VARCHAR(100),
      email            VARCHAR(255) UNIQUE,
      avatar_url       TEXT,
      provider         VARCHAR(20)  NOT NULL DEFAULT 'google',
      provider_id      VARCHAR(255),
      mother_language  VARCHAR(10),
      target_language  VARCHAR(10),
      created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_provider UNIQUE (provider, provider_id)
    );

    -- connect-pg-simple session store table
    CREATE TABLE IF NOT EXISTS session (
      sid    VARCHAR      NOT NULL COLLATE "default",
      sess   JSONB        NOT NULL,
      expire TIMESTAMPTZ  NOT NULL,
      CONSTRAINT session_pkey PRIMARY KEY (sid)
    );
    CREATE INDEX IF NOT EXISTS session_expire_idx ON session (expire);

    -- rate-limiter-flexible store
    CREATE TABLE IF NOT EXISTS rate_limits (
      key        VARCHAR(255) PRIMARY KEY,
      points     INTEGER      NOT NULL DEFAULT 0,
      expire     BIGINT
    );
    CREATE INDEX IF NOT EXISTS rate_limits_expire_idx ON rate_limits (expire);
  `);
}

export async function findOrCreateUser(profile: {
  provider: string;
  providerId: string;
  name: string;
  email?: string;
  avatarUrl?: string;
}): Promise<{ id: string; name: string; nickname: string | null; mother_language: string | null; target_language: string | null }> {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, avatar_url, provider, provider_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (provider, provider_id)
     DO UPDATE SET
       name       = EXCLUDED.name,
       email      = EXCLUDED.email,
       avatar_url = EXCLUDED.avatar_url,
       updated_at = NOW()
     RETURNING id, name, nickname, mother_language, target_language`,
    [profile.name, profile.email ?? null, profile.avatarUrl ?? null, profile.provider, profile.providerId],
  );
  return rows[0];
}

export async function findUserById(id: string) {
  const { rows } = await pool.query(
    `SELECT id, name, nickname, email, avatar_url, mother_language, target_language
     FROM users WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function updateProfile(id: string, data: {
  nickname: string;
  motherLanguage: string;
  targetLanguage: string;
}) {
  const { rows } = await pool.query(
    `UPDATE users
     SET nickname        = $2,
         mother_language = $3,
         target_language = $4,
         updated_at      = NOW()
     WHERE id = $1
     RETURNING id, name, nickname, email, avatar_url, mother_language, target_language`,
    [id, data.nickname, data.motherLanguage, data.targetLanguage],
  );
  return rows[0] ?? null;
}
