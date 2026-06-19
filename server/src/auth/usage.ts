import { pool } from './db';

export type UsageKind = 'text_words' | 'voice_seconds' | 'realtime_seconds';

export interface UsageEntry {
  userId: string;
  usageKind: UsageKind;
  amount: number;
  roomCode?: string | null;
}

export type UsageBalance = {
  realtime: {
    provider: string | null;
    usedSeconds: number;
    creditSeconds: number;
    balanceSeconds: number;
  };
  voice: {
    usedSeconds: number;
    creditSeconds: number;
    balanceSeconds: number;
  };
  text: {
    usedWords: number;
    creditWords: number;
    balanceWords: number;
  };
};

const USAGE_COLUMNS: Record<UsageKind, { used: string; credit: string }> = {
  text_words: {
    used: 'text_words_used',
    credit: 'text_words_credit',
  },
  voice_seconds: {
    used: 'voice_seconds_used',
    credit: 'voice_seconds_credit',
  },
  realtime_seconds: {
    used: 'realtime_seconds_used',
    credit: 'realtime_seconds_credit',
  },
};

function toInt(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number.parseInt(value, 10) || 0;
  return 0;
}

export function buildUsageBalance(row: any): UsageBalance {
  const realtimeUsed = toInt(row.realtime_seconds_used);
  const realtimeCredit = toInt(row.realtime_seconds_credit);
  const voiceUsed = toInt(row.voice_seconds_used);
  const voiceCredit = toInt(row.voice_seconds_credit);
  const textUsed = toInt(row.text_words_used);
  const textCredit = toInt(row.text_words_credit);

  return {
    realtime: {
      provider: row.realtime_provider ?? null,
      usedSeconds: realtimeUsed,
      creditSeconds: realtimeCredit,
      balanceSeconds: realtimeCredit - realtimeUsed,
    },
    voice: {
      usedSeconds: voiceUsed,
      creditSeconds: voiceCredit,
      balanceSeconds: voiceCredit - voiceUsed,
    },
    text: {
      usedWords: textUsed,
      creditWords: textCredit,
      balanceWords: textCredit - textUsed,
    },
  };
}

export function wordCount(text: string): number {
  const matches = text.trim().match(/\S+/g);
  return matches?.length ?? 0;
}

export async function recordUsage(entry: UsageEntry): Promise<UsageBalance | null> {
  const { userId, usageKind, roomCode = null } = entry;
  const amount = Math.ceil(Number(entry.amount));
  const columns = USAGE_COLUMNS[usageKind];
  if (!userId || !columns || amount <= 0) return null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const updated = await client.query(
      `UPDATE users
       SET ${columns.used} = ${columns.used} + $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING realtime_provider,
                 realtime_seconds_used, realtime_seconds_credit,
                 voice_seconds_used, voice_seconds_credit,
                 text_words_used, text_words_credit`,
      [userId, amount],
    );

    const row = updated.rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      return null;
    }

    const balanceAfter = toInt(row[columns.credit]) - toInt(row[columns.used]);
    await client.query(
      `INSERT INTO usage_log (user_id, room_code, usage_kind, amount, balance_after)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, roomCode, usageKind, amount, balanceAfter],
    );

    await client.query('COMMIT');
    return buildUsageBalance(row);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getUserUsageSummary(userId: string): Promise<UsageBalance | null> {
  const { rows } = await pool.query(
    `SELECT realtime_provider,
            realtime_seconds_used, realtime_seconds_credit,
            voice_seconds_used, voice_seconds_credit,
            text_words_used, text_words_credit
     FROM users WHERE id = $1`,
    [userId],
  );
  return rows[0] ? buildUsageBalance(rows[0]) : null;
}

export async function hasUsageBalance(userId: string, usageKind: UsageKind): Promise<boolean> {
  const columns = USAGE_COLUMNS[usageKind];
  if (!userId || !columns) return false;

  const { rows } = await pool.query(
    `SELECT realtime_provider, ${columns.used} AS used, ${columns.credit} AS credit
     FROM users WHERE id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return false;
  if (usageKind === 'realtime_seconds' && row.realtime_provider !== 'openai') return false;
  return toInt(row.credit) - toInt(row.used) > 0;
}
