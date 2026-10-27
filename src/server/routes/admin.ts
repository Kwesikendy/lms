import { Router } from 'express';
import { z } from 'zod';
import { getDb, newId, nowIso, writeAuditLog } from '../db/index.js';
import { requireRole } from '../middleware/auth.js';
import { grantEntitlement } from '../services/entitlements.js';
import { refundOrderByAdmin } from '../services/payments.js';

export const adminRouter = Router();

adminRouter.use(requireRole('admin'));

adminRouter.get('/overview', (_req, res) => {
  const db = getDb();

  // Real financial metrics derived strictly from persisted transactions
  const financialSummary = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END), 0) as total_revenue_ghs,
         COALESCE(SUM(CASE WHEN status IN ('refunded', 'partially_refunded') THEN total_amount ELSE 0 END), 0) as refunded_amount_ghs,
         COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_orders_count,
         COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders_count,
         COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_orders_count,
         COUNT(CASE WHEN status IN ('refunded', 'partially_refunded') THEN 1 END) as refunded_orders_count
       FROM orders`
    )
    .get() as Record<string, number>;

  const counts = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE role = 'student') as students_count,
         (SELECT COUNT(*) FROM users WHERE role = 'instructor') as instructors_count,
         (SELECT COUNT(*) FROM courses WHERE status = 'published') as published_courses_count,
         (SELECT COUNT(*) FROM learning_resources WHERE status = 'published') as published_resources_count,
         (SELECT COUNT(*) FROM enrollments WHERE status = 'active') as active_enrollments_count,
         (SELECT COUNT(*) FROM live_sessions WHERE status = 'live') as live_rooms_count`
    )
    .get() as Record<string, number>;

  const users = db
    .prepare(
      `SELECT id, email, full_name, role, title, status, email_verified, created_at
       FROM users ORDER BY created_at DESC`
    )
    .all();

  const orders = db
    .prepare(
      `SELECT o.*, u.full_name as user_name, u.email as user_email
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       ORDER BY o.created_at DESC LIMIT 100`
    )
    .all() as Array<Record<string, unknown>>;

  const enrichedOrders: Array<Record<string, unknown>> = orders.map((o) => {
    const items = db
      .prepare(`SELECT * FROM order_items WHERE order_id = ?`)
      .all(String(o.id));
    const attempts = db
      .prepare(`SELECT * FROM payment_attempts WHERE order_id = ?`)
      .all(String(o.id));
    return { ...o, items, attempts };
  });

  // Reconciliation report: compares order totals against verified payment attempts
  const reconciliation = enrichedOrders.map((o) => {
    const attempts = (o.attempts || []) as Array<{
      status: string;
      amount: number;
      reference: string;
      provider: string;
    }>;
    const successfulAttempt = attempts.find((a) => a.status === 'successful');
    const matched =
      o.status === 'paid'
        ? Boolean(
            successfulAttempt &&
              Math.abs(Number(successfulAttempt.amount) - Number(o.total_amount)) < 0.01
          )
        : true;
    return {
      orderId: o.id,
      orderNumber: o.order_number,
      orderStatus: o.status,
      orderTotal: o.total_amount,
      provider: o.payment_provider,
      attemptReference: successfulAttempt?.reference ?? attempts[0]?.reference ?? null,
      attemptAmount: successfulAttempt?.amount ?? attempts[0]?.amount ?? 0,
      reconciled: matched,
    };
  });

  const auditLogs = db
    .prepare(
      `SELECT a.*, u.full_name as actor_name, u.email as actor_email
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_id
       ORDER BY a.created_at DESC LIMIT 60`
    )
    .all();

  const entitlements = db
    .prepare(
      `SELECT e.*, u.full_name as user_name, u.email as user_email,
              COALESCE(c.title, r.title) as target_title
       FROM entitlements e
       JOIN users u ON u.id = e.user_id
       LEFT JOIN courses c ON e.target_type = 'course' AND c.id = e.target_id
       LEFT JOIN learning_resources r ON e.target_type = 'resource' AND r.id = e.target_id
       ORDER BY e.granted_at DESC LIMIT 80`
    )
    .all();

  res.json({
    financialSummary,
    counts,
    users,
    orders: enrichedOrders,
    reconciliation,
    auditLogs,
    entitlements,
  });
});

adminRouter.patch('/users/:userId', (req, res) => {
  const schema = z.object({
    role: z.enum(['student', 'instructor', 'admin']).optional(),
    status: z.enum(['active', 'suspended']).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid user update parameters.' });
    return;
  }

  const db = getDb();
  const target = db
    .prepare(`SELECT id, role, status FROM users WHERE id = ?`)
    .get(String(req.params.userId)) as { id: string; role: string; status: string } | undefined;

  if (!target) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  const nextRole = parsed.data.role ?? target.role;
  const nextStatus = parsed.data.status ?? target.status;

  db.prepare(`UPDATE users SET role = ?, status = ?, updated_at = ? WHERE id = ?`).run(
    nextRole,
    nextStatus,
    nowIso(),
    target.id
  );

  writeAuditLog({
    actorId: req.user!.id,
    actorRole: 'admin',
    action: 'user.admin_update',
    targetType: 'user',
    targetId: target.id,
    metadata: { role: nextRole, status: nextStatus },
  });

  res.json({ ok: true, role: nextRole, status: nextStatus });
});

adminRouter.post('/entitlements/grant', (req, res) => {
  const schema = z.object({
    userId: z.string().min(1),
    targetType: z.enum(['course', 'resource']),
    targetId: z.string().min(1),
    expiresAt: z.string().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid userId, targetType, and targetId are required.' });
    return;
  }

  const entitlementId = grantEntitlement({
    userId: parsed.data.userId,
    targetType: parsed.data.targetType,
    targetId: parsed.data.targetId,
    source: 'admin_grant',
    expiresAt: parsed.data.expiresAt ?? null,
  });

  writeAuditLog({
    actorId: req.user!.id,
    actorRole: 'admin',
    action: 'entitlement.admin_grant',
    targetType: parsed.data.targetType,
    targetId: parsed.data.targetId,
    metadata: { beneficiaryUserId: parsed.data.userId, entitlementId },
  });

  res.status(201).json({ ok: true, entitlementId });
});

adminRouter.post('/entitlements/:entitlementId/revoke', (req, res) => {
  const db = getDb();
  const now = nowIso();
  const ent = db
    .prepare(`SELECT id, user_id, target_type, target_id FROM entitlements WHERE id = ?`)
    .get(String(req.params.entitlementId)) as
    | { id: string; user_id: string; target_type: string; target_id: string }
    | undefined;

  if (!ent) {
    res.status(404).json({ error: 'Entitlement not found.' });
    return;
  }

  db.prepare(`UPDATE entitlements SET status = 'revoked', revoked_at = ? WHERE id = ?`).run(
    now,
    ent.id
  );
  if (ent.target_type === 'course') {
    db.prepare(
      `UPDATE enrollments SET status = 'revoked' WHERE user_id = ? AND course_id = ?`
    ).run(ent.user_id, ent.target_id);
  }

  writeAuditLog({
    actorId: req.user!.id,
    actorRole: 'admin',
    action: 'entitlement.revoke',
    targetType: ent.target_type,
    targetId: ent.target_id,
    metadata: { entitlementId: ent.id, userId: ent.user_id },
  });

  res.json({ ok: true });
});

adminRouter.post('/orders/:orderId/refund', (req, res) => {
  const schema = z.object({
    reason: z.string().min(3, 'Refund reason is required.'),
    partialAmount: z.number().positive().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid refund data.' });
    return;
  }

  try {
    refundOrderByAdmin({
      orderId: String(req.params.orderId),
      adminId: req.user!.id,
      reason: parsed.data.reason,
      partialAmount: parsed.data.partialAmount,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

adminRouter.patch('/settings', (req, res) => {
  const schema = z.object({
    org_name: z.string().min(2).max(120).optional(),
    org_tagline: z.string().max(250).optional(),
    support_email: z.string().email().optional(),
    primary_currency: z.enum(['GHS', 'USD', 'EUR', 'GBP']).optional(),
    accent_color: z.string().max(32).optional(),
    paystack_enabled: z.boolean().optional(),
    hubtel_enabled: z.boolean().optional(),
    livekit_enabled: z.boolean().optional(),
    allow_registration: z.boolean().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid settings configuration.' });
    return;
  }

  const db = getDb();
  const now = nowIso();
  const stmt = db.prepare(
    `INSERT INTO platform_settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  );

  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined) {
      stmt.run(k, String(v), now);
    }
  }

  writeAuditLog({
    actorId: req.user!.id,
    actorRole: 'admin',
    action: 'platform_settings.update',
    targetType: 'settings',
    metadata: parsed.data as Record<string, unknown>,
  });

  res.json({ ok: true });
});

adminRouter.post('/announcements', (req, res) => {
  const schema = z.object({
    title: z.string().min(3).max(200),
    body: z.string().min(5).max(3000),
    audience: z.enum(['all', 'instructors']).default('all'),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Title and body are required.' });
    return;
  }

  const db = getDb();
  const id = newId('ann');
  db.prepare(
    `INSERT INTO announcements (id, course_id, author_id, title, body, audience, created_at)
     VALUES (?, NULL, ?, ?, ?, ?, ?)`
  ).run(id, req.user!.id, parsed.data.title.trim(), parsed.data.body.trim(), parsed.data.audience, nowIso());

  res.status(201).json({ ok: true, id });
});
