// ═══════════════════════════════════════════════════════════════════════════
// DeltaAI WhatsApp Bot v2 — Rate Limiter
// ═══════════════════════════════════════════════════════════════════════════

import config from './config.js';

class RateLimiter {
  constructor() {
    /** @type {Map<string, number[]>} phone → timestamps */
    this.requests = new Map();
    this.limit = config.RATE_LIMIT_PER_MINUTE;
    this.windowMs = 60_000;
    setInterval(() => this.cleanup(), 5 * 60_000);
  }

  check(phone) {
    const now = Date.now();
    const timestamps = this.requests.get(phone) || [];
    const recent = timestamps.filter(t => now - t < this.windowMs);
    
    const allowed = recent.length < this.limit;
    const remaining = Math.max(0, this.limit - recent.length - 1);
    const resetIn = recent.length > 0 ? this.windowMs - (now - recent[0]) : 0;

    if (allowed) {
      recent.push(now);
    }
    this.requests.set(phone, recent);
    return { allowed, remaining, resetIn };
  }

  cleanup() {
    const now = Date.now();
    for (const [phone, timestamps] of this.requests) {
      const recent = timestamps.filter(t => now - t < this.windowMs);
      if (recent.length === 0) {
        this.requests.delete(phone);
      } else {
        this.requests.set(phone, recent);
      }
    }
  }
}

const rateLimiter = new RateLimiter();
export default rateLimiter;
