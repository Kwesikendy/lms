import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { getDb, newId, nowIso, writeAuditLog } from '../db/index.js';
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
} from '../middleware/auth.js';
import { authRateLimiter } from '../middleware/security.js';

export const authRouter = Router();

const signupSchema = z.object({
  email: z.string().email('Please enter a valid email address.'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long.')
    .max(128),
  full_name: z.string().min(2, 'Full name must be at least 2 characters.').max(120),
  title: z.string().max(120).optional(),
});

const signinSchema = z.object({
  email: z.string().email('Please enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});

const forgotSchema = z.object({
  email: z.string().email('Please enter a valid email address.'),
});

const resetSchema = z.object({
  token: z.string().min(10, 'Reset token is required.'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters.'),
});

const profileUpdateSchema = z.object({
  full_name: z.string().min(2).max(120).optional(),
  title: z.string().max(120).optional().nullable(),
  bio: z.string().max(1000).optional().nullable(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).optional(),
  notification_prefs: z
    .object({
      email_classes: z.boolean(),
      email_receipts: z.boolean(),
      in_app: z.boolean(),
    })
    .optional(),
});

authRouter.post('/signup', authRateLimiter, (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid registration data.',
      issues: parsed.error.issues,
    });
    return;
  }

  const db = getDb();
  const allowReg = db
    .prepare(`SELECT value FROM platform_settings WHERE key = 'allow_registration'`)
    .get() as { value: string } | undefined;

  if (allowReg && allowReg.value === 'false') {
    res.status(403).json({ error: 'Public registration is currently disabled by the administrator.' });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();
  const existing = db
    .prepare(`SELECT id FROM users WHERE LOWER(email) = ?`)
    .get(email);
  if (existing) {
    res.status(409).json({ error: 'An account with this email address already exists.' });
    return;
  }

  const userId = newId('usr');
  const now = nowIso();
  const passwordHash = hashPassword(parsed.data.password);

  db.prepare(
    `INSERT INTO users (id, email, password_hash, full_name, role, title, status, email_verified, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'student', ?, 'active', 1, ?, ?)`
  ).run(userId, email, passwordHash, parsed.data.full_name.trim(), parsed.data.title ?? null, now, now);

  writeAuditLog({
    actorId: userId,
    actorRole: 'student',
    action: 'user.signup',
    targetType: 'user',
    targetId: userId,
    ipAddress: req.ip,
  });

  const token = createSessionToken(userId, 'student');
  setSessionCookie(res, token);

  res.status(201).json({
    token,
    user: {
      id: userId,
      email,
      full_name: parsed.data.full_name.trim(),
      role: 'student',
      title: parsed.data.title ?? null,
      status: 'active',
      email_verified: true,
      notification_prefs: { email_classes: true, email_receipts: true, in_app: true },
      created_at: now,
    },
  });
});

authRouter.post('/signin', authRateLimiter, (req, res) => {
  const parsed = signinSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid credentials.' });
    return;
  }

  const db = getDb();
  const email = parsed.data.email.trim().toLowerCase();
  const row = db
    .prepare(
      `SELECT id, email, password_hash, full_name, role, title, bio, avatar_url, status, email_verified, notification_prefs, created_at
       FROM users WHERE LOWER(email) = ?`
    )
    .get(email) as Record<string, unknown> | undefined;

  if (!row || !verifyPassword(parsed.data.password, String(row.password_hash))) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  if (row.status === 'suspended') {
    res.status(403).json({
      error: 'Your account has been suspended. Please contact platform administration.',
    });
    return;
  }

  const userId = String(row.id);
  const role = row.role as 'student' | 'instructor' | 'admin';
  const token = createSessionToken(userId, role);
  setSessionCookie(res, token);

  writeAuditLog({
    actorId: userId,
    actorRole: role,
    action: 'user.signin',
    targetType: 'user',
    targetId: userId,
    ipAddress: req.ip,
  });

  let prefs = { email_classes: true, email_receipts: true, in_app: true };
  try {
    if (typeof row.notification_prefs === 'string') {
      prefs = JSON.parse(row.notification_prefs);
    }
  } catch {
    // default
  }

  res.json({
    token,
    user: {
      id: userId,
      email: String(row.email),
      full_name: String(row.full_name),
      role,
      title: row.title ? String(row.title) : null,
      bio: row.bio ? String(row.bio) : null,
      avatar_url: row.avatar_url ? String(row.avatar_url) : null,
      status: row.status,
      email_verified: Boolean(row.email_verified),
      notification_prefs: prefs,
      created_at: String(row.created_at),
    },
  });
});

authRouter.post('/signout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req, res) => {
  const db = getDb();
  const user = req.user!;
  const entitlements = db
    .prepare(
      `SELECT id, target_type, target_id, source, order_id, status, granted_at, expires_at
       FROM entitlements WHERE user_id = ? AND status = 'active'`
    )
    .all(user.id);

  const notifications = db
    .prepare(
      `SELECT id, title, message, link, is_read, created_at
       FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`
    )
    .all(user.id);

  res.json({
    user,
    entitlements,
    notifications,
  });
});

authRouter.post('/forgot-password', authRateLimiter, (req, res) => {
  const parsed = forgotSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Please provide a valid email address.' });
    return;
  }

  const db = getDb();
  const email = parsed.data.email.trim().toLowerCase();
  const user = db
    .prepare(`SELECT id, email FROM users WHERE LOWER(email) = ?`)
    .get(email) as { id: string; email: string } | undefined;

  if (!user) {
    // Return uniform response to prevent user enumeration
    res.json({
      message: 'If an account matches that email, a password reset token has been generated.',
    });
    return;
  }

  const rawToken = crypto.randomBytes(24).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  db.prepare(
    `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(newId('rst'), user.id, tokenHash, expiresAt, nowIso());

  writeAuditLog({
    actorId: user.id,
    action: 'user.password_reset_requested',
    targetType: 'user',
    targetId: user.id,
  });

  // In non-production or when SMTP is not configured, return devResetToken for verification/testing
  res.json({
    message: 'If an account matches that email, a password reset token has been generated.',
    ...(process.env.NODE_ENV !== 'production' ? { resetToken: rawToken } : {}),
  });
});

authRouter.post('/reset-password', authRateLimiter, (req, res) => {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid reset request.',
    });
    return;
  }

  const db = getDb();
  const tokenHash = crypto
    .createHash('sha256')
    .update(parsed.data.token.trim())
    .digest('hex');

  const record = db
    .prepare(
      `SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = ?`
    )
    .get(tokenHash) as
    | { id: string; user_id: string; expires_at: string; used_at: string | null }
    | undefined;

  if (!record || record.used_at || new Date(record.expires_at).getTime() < Date.now()) {
    res.status(400).json({ error: 'Invalid or expired password reset token.' });
    return;
  }

  const now = nowIso();
  const newHash = hashPassword(parsed.data.newPassword);
  db.prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`).run(
    newHash,
    now,
    record.user_id
  );
  db.prepare(`UPDATE password_reset_tokens SET used_at = ? WHERE id = ?`).run(
    now,
    record.id
  );

  writeAuditLog({
    actorId: record.user_id,
    action: 'user.password_reset_completed',
    targetType: 'user',
    targetId: record.user_id,
  });

  res.json({ ok: true, message: 'Your password has been updated. You may now sign in.' });
});

authRouter.patch('/profile', requireAuth, (req, res) => {
  const parsed = profileUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid profile update payload.',
    });
    return;
  }

  const db = getDb();
  const user = req.user!;
  const now = nowIso();

  if (parsed.data.newPassword) {
    if (!parsed.data.currentPassword) {
      res.status(400).json({ error: 'Current password is required to set a new password.' });
      return;
    }
    const row = db
      .prepare(`SELECT password_hash FROM users WHERE id = ?`)
      .get(user.id) as { password_hash: string } | undefined;
    if (!row || !verifyPassword(parsed.data.currentPassword, row.password_hash)) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }
    const newHash = hashPassword(parsed.data.newPassword);
    db.prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`).run(
      newHash,
      now,
      user.id
    );
  }

  const nextName = parsed.data.full_name?.trim() || user.full_name;
  const nextTitle =
    parsed.data.title !== undefined ? parsed.data.title : user.title ?? null;
  const nextBio = parsed.data.bio !== undefined ? parsed.data.bio : user.bio ?? null;
  const nextPrefs = parsed.data.notification_prefs || user.notification_prefs;

  db.prepare(
    `UPDATE users
     SET full_name = ?, title = ?, bio = ?, notification_prefs = ?, updated_at = ?
     WHERE id = ?`
  ).run(nextName, nextTitle, nextBio, JSON.stringify(nextPrefs), now, user.id);

  res.json({
    ok: true,
    user: {
      ...user,
      full_name: nextName,
      title: nextTitle,
      bio: nextBio,
      notification_prefs: nextPrefs,
    },
  });
});

authRouter.post('/notifications/:id/read', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare(
    `UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`
  ).run(String(req.params.id), req.user!.id);
  res.json({ ok: true });
});
