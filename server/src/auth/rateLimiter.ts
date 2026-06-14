import { RateLimiterPostgres } from 'rate-limiter-flexible';
import { pool } from './db';
import type { Request, Response, NextFunction } from 'express';

function intEnv(key: string, fallback: number) {
  const v = parseInt(process.env[key] ?? '', 10);
  return Number.isFinite(v) ? v : fallback;
}

function buildLimiter(keyPrefix: string, pointsKey: string, durationKey: string, blockKey: string,
  pointsDef: number, durationDef: number, blockDef: number) {
  return new RateLimiterPostgres({
    storeClient:   pool,
    tableName:     'rate_limits',
    keyPrefix,
    points:        intEnv(pointsKey,  pointsDef),
    duration:      intEnv(durationKey, durationDef),
    blockDuration: intEnv(blockKey,   blockDef),
  });
}

// Lazily instantiated after pool is ready
let _loginLimiter:    RateLimiterPostgres | null = null;
let _apiUserLimiter:  RateLimiterPostgres | null = null;
let _apiGuestLimiter: RateLimiterPostgres | null = null;

function loginLimiter()    { return _loginLimiter    ??= buildLimiter('login',     'RATE_LOGIN_POINTS',     'RATE_LOGIN_DURATION',     'RATE_LOGIN_BLOCK',     10,  900, 1800) }
function apiUserLimiter()  { return _apiUserLimiter  ??= buildLimiter('api_user',  'RATE_API_USER_POINTS',  'RATE_API_USER_DURATION',  'RATE_API_USER_BLOCK',  120, 60,  300) }
function apiGuestLimiter() { return _apiGuestLimiter ??= buildLimiter('api_guest', 'RATE_API_GUEST_POINTS', 'RATE_API_GUEST_DURATION', 'RATE_API_GUEST_BLOCK', 30,  60,  600) }

const FRONTEND_URL = () => process.env.FRONTEND_URL ?? 'http://localhost:5173';

function tooManyJson(res: Response, msBeforeNext: number) {
  res.set('Retry-After', String(Math.ceil(msBeforeNext / 1000)));
  res.status(429).json({ error: 'too_many_requests', retry_after: Math.ceil(msBeforeNext / 1000) });
}

function tooManyRedirect(res: Response) {
  res.redirect(`${FRONTEND_URL()}/login?error=too_many_requests`);
}

export function rateLimitLogin(req: Request, res: Response, next: NextFunction) {
  loginLimiter().consume(req.ip ?? 'unknown')
    .then(() => next())
    .catch((rej: any) => {
      // OAuth routes expect a redirect, not JSON
      if (req.path.startsWith('/google')) return tooManyRedirect(res);
      tooManyJson(res, rej.msBeforeNext);
    });
}

export function rateLimitApi(req: Request, res: Response, next: NextFunction) {
  const user = req.user as any;
  const limiter = user?.role === 'guest' ? apiGuestLimiter() : apiUserLimiter();
  limiter.consume((user?.id ?? req.ip) ?? 'unknown')
    .then(() => next())
    .catch((rej: any) => tooManyJson(res, rej.msBeforeNext));
}
