import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL ?? "",
  token: process.env.UPSTASH_REDIS_REST_TOKEN ?? "",
});

export type RateLimitConfig = {
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  success: boolean;
  remaining: number;
  resetAt: number;
};

export async function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowKey = `ratelimit:${key}`;

  const count = await redis.incr(windowKey);

  if (count === 1) {
    await redis.pexpire(windowKey, config.windowMs);
  }

  const ttl = await redis.pttl(windowKey);
  const resetAt = ttl > 0 ? now + ttl : now + config.windowMs;

  if (count > config.limit) {
    return {
      success: false,
      remaining: 0,
      resetAt,
    };
  }

  return {
    success: true,
    remaining: config.limit - count,
    resetAt,
  };
}

export const RATE_LIMITS = {
  EPISODE_PROCESSING: {
    limit: 5,
    windowMs: 60 * 60 * 1000,
  },
  SIGNAL_REGENERATION: {
    limit: 10,
    windowMs: 60 * 60 * 1000,
  },
  READWISE_SYNC: {
    limit: 10,
    windowMs: 60 * 60 * 1000,
  },
} as const;
