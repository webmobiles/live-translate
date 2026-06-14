import { pool } from './db';

export interface UsageEntry {
  userId: string;
  languageCode: string;
  usageType: 'words' | 'audio';
  amount: number;
  roomCode?: string;
  isGuest?: boolean;
}

// Record usage and deduct from credits. Initialises credits from defaults on first use.
export async function recordUsage(entry: UsageEntry): Promise<void> {
  const { userId, languageCode, usageType, amount, roomCode = null, isGuest = false } = entry;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Log the event
    await client.query(
      `INSERT INTO usage_log (user_id, room_code, language_code, usage_type, amount, is_guest)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, roomCode, languageCode, usageType, amount, isGuest],
    );

    // Upsert running totals
    const wordsCol   = isGuest ? 'guest_words_consumed'   : 'words_consumed';
    const secondsCol = isGuest ? 'guest_seconds_consumed' : 'seconds_consumed';
    const col = usageType === 'words' ? wordsCol : secondsCol;

    await client.query(
      `INSERT INTO user_language_stats (user_id, language_code, ${col})
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, language_code)
       DO UPDATE SET ${col} = user_language_stats.${col} + $3, updated_at = NOW()`,
      [userId, languageCode, amount],
    );

    // Deduct from credits (initialise from defaults if row missing)
    if (!isGuest) {
      await client.query(
        `INSERT INTO user_language_credits (user_id, language_code, words_remaining, seconds_remaining)
         SELECT $1, $2, free_words, free_seconds
         FROM language_credits_defaults
         WHERE language_code = $2
         ON CONFLICT (user_id, language_code) DO NOTHING`,
        [userId, languageCode],
      );

      const creditCol = usageType === 'words' ? 'words_remaining' : 'seconds_remaining';
      await client.query(
        `UPDATE user_language_credits
         SET ${creditCol} = GREATEST(0, ${creditCol} - $3), updated_at = NOW()
         WHERE user_id = $1 AND language_code = $2`,
        [userId, languageCode, amount],
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getUserUsageSummary(userId: string) {
  const [stats, credits, billing] = await Promise.all([
    pool.query(
      `SELECT language_code, words_consumed, seconds_consumed,
              guest_words_consumed, guest_seconds_consumed
       FROM user_language_stats WHERE user_id = $1 ORDER BY words_consumed DESC`,
      [userId],
    ),
    pool.query(
      `SELECT c.language_code, c.words_remaining, c.seconds_remaining,
              d.free_words, d.free_seconds
       FROM user_language_credits c
       JOIN language_credits_defaults d USING (language_code)
       WHERE c.user_id = $1`,
      [userId],
    ),
    pool.query(
      `SELECT balance, currency, total_paid, total_consumed
       FROM user_billing WHERE user_id = $1`,
      [userId],
    ),
  ]);

  return {
    stats:   stats.rows,
    credits: credits.rows,
    billing: billing.rows[0] ?? null,
  };
}

export async function hasCredits(
  userId: string,
  languageCode: string,
  type: 'words' | 'audio',
): Promise<boolean> {
  const col = type === 'words' ? 'words_remaining' : 'seconds_remaining';

  // Initialise from defaults if no row yet
  await pool.query(
    `INSERT INTO user_language_credits (user_id, language_code, words_remaining, seconds_remaining)
     SELECT $1, $2, free_words, free_seconds
     FROM language_credits_defaults WHERE language_code = $2
     ON CONFLICT (user_id, language_code) DO NOTHING`,
    [userId, languageCode],
  );

  const { rows } = await pool.query(
    `SELECT ${col} FROM user_language_credits WHERE user_id = $1 AND language_code = $2`,
    [userId, languageCode],
  );
  return rows.length > 0 && rows[0][col] > 0;
}
