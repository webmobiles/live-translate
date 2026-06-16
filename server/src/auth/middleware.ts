import type { Request, Response, NextFunction } from 'express';
import { findUserByApiToken } from './db';

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Browser clients authenticate via the passport session cookie.
  if (req.isAuthenticated()) return next();

  // Native clients (the phone) send a long-lived bearer token instead, since
  // they have no cookie jar for the session.
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (token) {
    try {
      const user = await findUserByApiToken(token);
      if (user) {
        (req as any).user = user;
        return next();
      }
    } catch (err) {
      return next(err);
    }
  }

  res.status(401).json({ error: 'unauthenticated' });
}
