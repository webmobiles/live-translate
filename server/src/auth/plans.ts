/**
 * Per-plan limits. The `plan` column on users drives how much room history and
 * chat history a user can see. Unknown/absent plans fall back to Free; any
 * recognised paid plan gets effectively-unlimited caps for now.
 */

export interface PlanLimits {
  /** Max rooms shown in the room-history list (home shows fewer). */
  rooms: number;
  /** Max chat messages loaded when entering a room. */
  messages: number;
}

const FREE: PlanLimits = { rooms: 10, messages: 100 };
const PAID: PlanLimits = { rooms: 1000, messages: 100_000 };

const LIMITS: Record<string, PlanLimits> = {
  Free: FREE,
};

export function planLimits(plan: string | null | undefined): PlanLimits {
  if (!plan || plan === 'Free') return FREE;
  return LIMITS[plan] ?? PAID;
}
