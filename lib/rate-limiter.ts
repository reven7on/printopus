type RateLimitOptions = {
  windowMs: number;
  max: number;
};

type RateLimitRecord = {
  timestamps: number[];
};

export class RateLimiter {
  private records = new Map<string, RateLimitRecord>();
  private windowMs: number;
  private max: number;

  constructor(options: RateLimitOptions) {
    this.windowMs = options.windowMs;
    this.max = options.max;
  }

  public check(key: string, now = Date.now()): { allowed: boolean; remaining: number; resetMs: number } {
    const record = this.records.get(key) ?? { timestamps: [] };
    const cutoff = now - this.windowMs;
    const validTimestamps = record.timestamps.filter((ts) => ts > cutoff);

    if (validTimestamps.length >= this.max) {
      const oldestValid = validTimestamps[0];
      const resetMs = oldestValid + this.windowMs - now;
      return { allowed: false, remaining: 0, resetMs };
    }

    validTimestamps.push(now);
    this.records.set(key, { timestamps: validTimestamps });

    if (this.records.size > 1000) {
      for (const [k, v] of this.records.entries()) {
        const fresh = v.timestamps.filter((ts) => ts > cutoff);
        if (fresh.length === 0) {
          this.records.delete(k);
        } else {
          this.records.set(k, { timestamps: fresh });
        }
      }
    }

    return {
      allowed: true,
      remaining: this.max - validTimestamps.length,
      resetMs: this.windowMs,
    };
  }

  public reset(key?: string) {
    if (key) {
      this.records.delete(key);
    } else {
      this.records.clear();
    }
  }
}

export function getClientIp(request: Request): string {
  const xForwardedFor = request.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    const firstIp = xForwardedFor.split(",")[0].trim();
    if (firstIp) return firstIp;
  }
  const xRealIp = request.headers.get("x-real-ip");
  if (xRealIp?.trim()) return xRealIp.trim();
  return "127.0.0.1";
}
