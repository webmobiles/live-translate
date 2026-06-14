import { Router } from 'express';
import { recordUsage, getUserUsageSummary } from './usage';
import type { UsageEntry } from './usage';

const router = Router();

// Internal routes are only reachable from the server itself (or trusted internal services).
// Guard with a shared secret set in INTERNAL_API_SECRET.
router.use((req, res, next) => {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return next(); // no secret configured → allow in dev
  if (req.headers['x-internal-secret'] === secret) return next();
  res.status(403).json({ error: 'forbidden' });
});

// POST /internal/usage/words
router.post('/usage/words', async (req, res, next) => {
  try {
    const { userId, languageCode, words, roomCode, isGuest } = req.body;
    if (!userId || !languageCode || typeof words !== 'number' || words <= 0)
      return res.status(400).json({ error: 'invalid_params' });

    await recordUsage({ userId, languageCode, usageType: 'words', amount: words, roomCode, isGuest });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /internal/usage/audio
router.post('/usage/audio', async (req, res, next) => {
  try {
    const { userId, languageCode, seconds, roomCode, isGuest } = req.body;
    if (!userId || !languageCode || typeof seconds !== 'number' || seconds <= 0)
      return res.status(400).json({ error: 'invalid_params' });

    await recordUsage({ userId, languageCode, usageType: 'audio', amount: seconds, roomCode, isGuest });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /internal/usage/batch
router.post('/usage/batch', async (req, res, next) => {
  try {
    const { entries } = req.body as { entries: UsageEntry[] };
    if (!Array.isArray(entries) || entries.length === 0)
      return res.status(400).json({ error: 'invalid_params' });

    await Promise.all(entries.map(e => recordUsage(e)));
    res.json({ ok: true, processed: entries.length });
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
