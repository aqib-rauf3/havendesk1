/**
 * HavenDesk Production Security Hardening Middleware
 * - Security Headers (CSP, X-Frame-Options, X-Content-Type-Options, etc.)
 * - Auth Rate Limiting (max 5 failed logins / 15 min per IP)
 * - Public Widget Rate Limiting (max 60 req/min per IP)
 * - Input Sanitization (XSS mitigation)
 * - CSRF & Origin Validation
 */

// In-memory buckets for rate limiting
const authFailureBuckets = new Map(); // ip -> { count: number, resetAt: number }
const widgetBuckets = new Map();      // ip -> { count: number, resetAt: number }

// Cleanup expired buckets every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of authFailureBuckets.entries()) {
    if (now > data.resetAt) authFailureBuckets.delete(ip);
  }
  for (const [ip, data] of widgetBuckets.entries()) {
    if (now > data.resetAt) widgetBuckets.delete(ip);
  }
}, 5 * 60 * 1000).unref();

/**
 * Apply Standard Security HTTP Headers
 */
export function applySecurityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');
  
  // Set Content-Security-Policy permitting Google Fonts and inline UI helpers
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self' 'unsafe-inline' 'unsafe-eval' https://fonts.googleapis.com https://fonts.gstatic.com data: blob:;"
  );

  next();
}

/**
 * Rate Limiter for Authentication Endpoints (Login / Forgot Password)
 * Max 5 failed logins per 15 minutes per IP address.
 */
export function authRateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
  const now = Date.now();
  const record = authFailureBuckets.get(ip);

  if (record && now < record.resetAt && record.count >= 5) {
    const minutesLeft = Math.ceil((record.resetAt - now) / 60000);
    return res.status(429).json({
      error: `Too many failed login attempts. Account temporarily locked for security. Please try again in ${minutesLeft} minute(s).`
    });
  }

  next();
}

export function recordFailedLogin(ip) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const record = authFailureBuckets.get(ip) || { count: 0, resetAt: now + windowMs };

  if (now > record.resetAt) {
    record.count = 1;
    record.resetAt = now + windowMs;
  } else {
    record.count += 1;
  }

  authFailureBuckets.set(ip, record);
}

export function clearFailedLogins(ip) {
  authFailureBuckets.delete(ip);
}

/**
 * Rate Limiter for Public Widget Endpoints
 * Max 60 requests per minute per IP address.
 */
export function widgetRateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxReq = 60;

  let record = widgetBuckets.get(ip);
  if (!record || now > record.resetAt) {
    record = { count: 1, resetAt: now + windowMs };
  } else {
    record.count += 1;
  }

  widgetBuckets.set(ip, record);

  if (record.count > maxReq) {
    return res.status(429).json({
      error: 'Widget rate limit reached. Please wait a moment before sending more messages.'
    });
  }

  next();
}

/**
 * Recursive Input Sanitizer (XSS Mitigation)
 * Strips dangerous HTML tags and scripts from incoming request bodies.
 */
export function sanitizeInput(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  next();
}

function sanitizeObject(obj) {
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  if (obj !== null && typeof obj === 'object') {
    const cleaned = {};
    for (const [k, v] of Object.entries(obj)) {
      cleaned[k] = sanitizeObject(v);
    }
    return cleaned;
  }
  if (typeof obj === 'string') {
    // Strip script tags and javascript: pseudo-protocols
    return obj
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:[^\s"']+/gi, '');
  }
  return obj;
}

/**
 * CSRF Guard for Mutation Requests
 * Protects state-changing endpoints (POST/PUT/DELETE)
 */
export function csrfGuard(req, res, next) {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) return next();

  // If request uses Bearer token, it is protected from browser ambient credential attacks
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return next();
  }

  // Allow webhooks which sign payloads or use webhook signatures
  if (req.path.startsWith('/api/v1/webhooks')) {
    return next();
  }

  // Check Origin or Referer for same-site browser mutations
  const origin = req.get('origin');
  const host = req.get('host');

  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost !== host && !originHost.includes('localhost') && !originHost.includes('127.0.0.1')) {
        return res.status(403).json({ error: 'Cross-site request forgery detected. Request rejected.' });
      }
    } catch (e) {
      // Invalid origin URL format
      return res.status(403).json({ error: 'Invalid origin header.' });
    }
  }

  next();
}
