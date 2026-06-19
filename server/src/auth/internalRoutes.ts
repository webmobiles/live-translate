import { Router } from 'express';
import { recordUsage, getUserUsageSummary } from './usage';
import type { UsageEntry, UsageKind } from './usage';

const router = Router();

// Internal routes are only reachable from the server itself (or trusted internal services).
// Guard with a shared secret set in INTERNAL_API_SECRET.
router.use((req, res, next) => {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return next(); // no secret configured → allow in dev
  if (req.headers['x-internal-secret'] === secret) return next();
  res.status(403).json({ error: 'forbidden' });
});

function usageKindFromLegacy(type: string): UsageKind | null {
  if (type === 'words') return 'text_words';
  if (type === 'audio') return 'voice_seconds';
  return null;
}

// POST /internal/usage/text
router.post('/usage/text', async (req, res, next) => {
  try {
    const { userId, words, roomCode } = req.body;
    if (!userId || typeof words !== 'number' || words <= 0)
      return res.status(400).json({ error: 'invalid_params' });

    const balance = await recordUsage({ userId, usageKind: 'text_words', amount: words, roomCode });
    res.json({ ok: true, balance });
  } catch (err) { next(err); }
});

// POST /internal/usage/voice
router.post('/usage/voice', async (req, res, next) => {
  try {
    const { userId, seconds, roomCode } = req.body;
    if (!userId || typeof seconds !== 'number' || seconds <= 0)
      return res.status(400).json({ error: 'invalid_params' });

    const balance = await recordUsage({ userId, usageKind: 'voice_seconds', amount: seconds, roomCode });
    res.json({ ok: true, balance });
  } catch (err) { next(err); }
});

// POST /internal/usage/realtime
router.post('/usage/realtime', async (req, res, next) => {
  try {
    const { userId, seconds, roomCode } = req.body;
    if (!userId || typeof seconds !== 'number' || seconds <= 0)
      return res.status(400).json({ error: 'invalid_params' });

    const balance = await recordUsage({ userId, usageKind: 'realtime_seconds', amount: seconds, roomCode });
    res.json({ ok: true, balance });
  } catch (err) { next(err); }
});

// POST /internal/usage/batch
router.post('/usage/batch', async (req, res, next) => {
  try {
    const { entries } = req.body as { entries: Array<UsageEntry & {
      usageType?: string;
      words?: number;
      seconds?: number;
    }> };
    if (!Array.isArray(entries) || entries.length === 0)
      return res.status(400).json({ error: 'invalid_params' });

    const balances = await Promise.all(entries.map(e => {
      const usageKind = e.usageKind ?? usageKindFromLegacy(String(e.usageType || ''));
      const amount = e.amount ?? e.words ?? e.seconds ?? 0;
      if (!usageKind) throw new Error('invalid_usage_kind');
      return recordUsage({ userId: e.userId, usageKind, amount, roomCode: e.roomCode });
    }));
    res.json({ ok: true, processed: entries.length, balances });
  } catch (err) { next(err); }
});

// GET /internal/usage/:userId
router.get('/usage/:userId', async (req, res, next) => {
  try {
    const summary = await getUserUsageSummary(req.params.userId);
    res.json(summary);
  } catch (err) { next(err); }
});

export { router as internalRouter };
