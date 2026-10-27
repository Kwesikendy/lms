import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';
import { getDb } from '../db/index.js';
import type { User, UserRole } from '../../shared/types.js';

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derivedKey}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const parts = storedHash.split(':');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
    const [, salt, keyHex] = parts;
    const keyBuffer = Buffer.from(keyHex, 'hex');
    const derivedBuffer = crypto.scryptSync(password, salt, 64);
    if (keyBuffer.length !== derivedBuffer.length) return false;
    return crypto.timingSafeEqual(keyBuffer, derivedBuffer);
  } catch {
    return false;
  }
}

interface SessionPayload {
  sub: string;
  role: UserRole;
  iat: number;
  exp: number;
}

export function createSessionToken(
  userId: string,
  role: UserRole,
  ttlSeconds = 60 * 60 * 24 * 7
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: userId,
    role,
    iat: now,
    exp: now + ttlSeconds,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', config.sessionSecret)
    .update(payloadB64)
    .digest('base64url');
  return `${payloadB64}.${sig}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payloadB64, sig] = parts;
    const expectedSig = crypto
      .createHmac('sha256', config.sessionSecret)
      .update(payloadB64)
      .digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf-8')
    ) as SessionPayload;
    const now = Math.floor(Date.now() / 1000);
    if (!payload.sub || payload.exp < now) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const out: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      out[k] = decodeURIComponent(v);
    }
  }
  return out;
}

export function extractUserFromRequest(req: Request): User | null {
  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else {
    const cookies = parseCookies(req.headers.cookie);
    token = cookies['aether_session'];
  }
  if (!token) return null;
  const payload = verifySessionToken(token);
  if (!payload) return null;

  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, email, full_name, role, title, bio, avatar_url, status, email_verified, notification_prefs, created_at
       FROM users WHERE id = ?`
    )
    .get(payload.sub) as Record<string, unknown> | undefined;

  if (!row || row.status !== 'active') return null;

  let prefs = { email_classes: true, email_receipts: true, in_app: true };
  try {
    if (typeof row.notification_prefs === 'string') {
      prefs = JSON.parse(row.notification_prefs);
    }
  } catch {
    // keep default
  }

  return {
    id: String(row.id),
    email: String(row.email),
    full_name: String(row.full_name),
    role: row.role as UserRole,
    title: row.title ? String(row.title) : null,
    bio: row.bio ? String(row.bio) : null,
    avatar_url: row.avatar_url ? String(row.avatar_url) : null,
    status: row.status as 'active' | 'suspended',
    email_verified: Boolean(row.email_verified),
    notification_prefs: prefs,
    created_at: String(row.created_at),
  };
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const user = extractUserFromRequest(req);
  if (user) {
    req.user = user;
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const user = extractUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required. Please sign in to continue.' });
    return;
  }
  req.user = user;
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user ?? extractUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!roles.includes(user.role)) {
      res.status(403).json({
        error: `Access denied. Required role: ${roles.join(' or ')}.`,
      });
      return;
    }
    req.user = user;
    next();
  };
}

export function setSessionCookie(res: Response, token: string): void {
  const isProd = config.nodeEnv === 'production';
  res.cookie('aether_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: 1000 * 60 * 60 * 24 * 7,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie('aether_session', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
}
