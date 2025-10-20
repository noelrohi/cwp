import { randomUUID } from "node:crypto";
import { checkRateLimit } from "@/lib/rate-limit";
import { inngest } from "../client";

/**
 * Health Check Function - Every 6 hours
 * Monitors Upstash rate limiting functionality
 */
export const healthCheck = inngest.createFunction(
  { id: "health-check" },
  { cron: "0 */6 * * *" }, // Every 6 hours
  async ({ step, logger }) => {
    const now = new Date();
    const healthCheckId = randomUUID();

    logger.info(`Running health check (id=${healthCheckId})`);

    // Check Upstash rate limiting functionality
    await step.run("check-upstash-ratelimit", async () => {
      try {
        const testKey = `health-check:${healthCheckId}`;
        const result = await checkRateLimit(testKey, {
          limit: 1,
          windowMs: 60000, // 1 minute window
        });

        if (!result.success) {
          throw new Error(
            "Rate limit check failed: Unexpected rate limit exceeded on first check",
          );
        }

        logger.info("Upstash rate limit check passed", {
          remaining: result.remaining,
          resetAt: new Date(result.resetAt).toISOString(),
        });

        // Verify rate limiting is actually enforced with a second call
        const secondResult = await checkRateLimit(testKey, {
          limit: 1,
          windowMs: 60000,
        });

        if (secondResult.success) {
          throw new Error(
            "Rate limit enforcement failed: Second call should have been rate limited",
          );
        }

        logger.info("Upstash rate limit enforcement verified", {
          rateLimited: true,
        });

        return { status: "ok", result };
      } catch (error) {
        logger.error("Upstash rate limit check failed", { error });
        throw new Error(
          `Upstash rate limiting is not working: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    });

    logger.info(`Health check ${healthCheckId} completed`, {
      timestamp: now.toISOString(),
      upstashRateLimitStatus: "ok",
    });

    return {
      healthCheckId,
      timestamp: now.toISOString(),
      upstashRateLimitStatus: "ok",
    };
  },
);
