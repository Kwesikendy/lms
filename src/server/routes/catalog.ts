import { Router } from 'express';
import { getDb } from '../db/index.js';
import { optionalAuth } from '../middleware/auth.js';
import { canUserAccessCourse, canUserAccessResource } from '../services/entitlements.js';
import { config } from '../config.js';

export const catalogRouter = Router();

catalogRouter.get('/settings', (_req, res) => {
  const db = getDb();
  const rows = db
    .prepare(`SELECT key, value FROM platform_settings`)
    .all() as Array<{ key: string; value: string }>;
  const map: Record<string, string> = {};
  for (const r of rows) {
    map[r.key] = r.value;
  }

  res.json({
    settings: {
      org_name: map.org_name || 'Aether Academy',
      org_tagline:
        map.org_tagline ||
        'Executive Technology, FinTech & Product Engineering Institute',
      support_email: map.support_email || 'admissions@aetheracademy.edu.gh',
      primary_currency: map.primary_currency || 'GHS',
      accent_color: map.accent_color || '#22D3EE',
      paystack_enabled: map.paystack_enabled !== 'false',
      hubtel_enabled: map.hubtel_enabled !== 'false',
      livekit_enabled: map.livekit_enabled !== 'false',
      allow_registration: map.allow_registration !== 'false',
    },
    integrations: {
      livekitConfigured: config.livekit.isConfigured,
      livekitEgressEnabled: config.livekit.egressEnabled,
      paystackConfigured: config.paystack.isConfigured,
      hubtelConfigured: config.hubtel.isConfigured,
      s3Configured: config.storage.isS3Configured,
    },
  });
});

catalogRouter.get('/categories', (_req, res) => {
  const db = getDb();
  const categories = db
    .prepare(
      `SELECT id, name, slug, description, sort_order FROM course_categories ORDER BY sort_order ASC`
    )
    .all();
  res.json({ categories });
});

catalogRouter.get('/courses', optionalAuth, (req, res) => {
  const db = getDb();
  const search = String(req.query.q || '').trim().toLowerCase();
  const category = String(req.query.category || '').trim();
  const priceFilter = String(req.query.price || 'all').trim(); // all | free | paid
  const sort = String(req.query.sort || 'featured').trim();

  let sql = `
    SELECT c.*,
           cat.name as category_name,
           cat.slug as category_slug,
           u.full_name as instructor_name,
           u.title as instructor_title,
           u.bio as instructor_bio,
           p.id as product_id,
           (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) as lesson_count,
           (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id AND e.status != 'revoked') as enrollment_count
    FROM courses c
    LEFT JOIN course_categories cat ON cat.id = c.category_id
    LEFT JOIN users u ON u.id = c.instructor_id
    LEFT JOIN products p ON p.target_course_id = c.id AND p.product_type = 'course'
    WHERE c.status = 'published'
  `;
  const params: Array<string | number> = [];

  if (search) {
    sql += ` AND (LOWER(c.title) LIKE ? OR LOWER(c.subtitle) LIKE ? OR LOWER(c.description) LIKE ?)`;
    const pat = `%${search}%`;
    params.push(pat, pat, pat);
  }
  if (category && category !== 'all') {
    sql += ` AND (c.category_id = ? OR cat.slug = ?)`;
    params.push(category, category);
  }
  if (priceFilter === 'free') {
    sql += ` AND c.is_free = 1`;
  } else if (priceFilter === 'paid') {
    sql += ` AND c.is_free = 0`;
  }

  if (sort === 'price_asc') {
    sql += ` ORDER BY c.price_ghs ASC, c.created_at DESC`;
  } else if (sort === 'price_desc') {
    sql += ` ORDER BY c.price_ghs DESC, c.created_at DESC`;
  } else if (sort === 'newest') {
    sql += ` ORDER BY c.created_at DESC`;
  } else {
    sql += ` ORDER BY c.featured DESC, c.created_at DESC`;
  }

  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  const courses = rows.map((r) => ({
    ...r,
    is_free: Boolean(r.is_free),
    featured: Boolean(r.featured),
    learning_outcomes: safeJsonParse(r.learning_outcomes, []),
    requirements: safeJsonParse(r.requirements, []),
    has_access: req.user
      ? canUserAccessCourse(req.user.id, req.user.role, String(r.id), db)
      : false,
  }));

  res.json({ courses });
});

catalogRouter.get('/courses/:slugOrId', optionalAuth, (req, res) => {
  const db = getDb();
  const key = String(req.params.slugOrId);
  const row = db
    .prepare(
      `SELECT c.*,
              cat.name as category_name,
              u.full_name as instructor_name,
              u.title as instructor_title,
              u.bio as instructor_bio,
              p.id as product_id
       FROM courses c
       LEFT JOIN course_categories cat ON cat.id = c.category_id
       LEFT JOIN users u ON u.id = c.instructor_id
       LEFT JOIN products p ON p.target_course_id = c.id AND p.product_type = 'course'
       WHERE c.slug = ? OR c.id = ?`
    )
    .get(key, key) as Record<string, unknown> | undefined;

  if (!row) {
    res.status(404).json({ error: 'Course not found.' });
    return;
  }

  const courseId = String(row.id);
  const hasAccess = req.user
    ? canUserAccessCourse(req.user.id, req.user.role, courseId, db)
    : false;

  const modules = db
    .prepare(
      `SELECT id, course_id, title, description, sort_order
       FROM course_modules WHERE course_id = ? ORDER BY sort_order ASC`
    )
    .all(courseId) as Array<Record<string, unknown>>;

  const lessons = db
    .prepare(
      `SELECT id, module_id, course_id, title, description, content_type,
              duration_minutes, is_preview, allow_download, sort_order
       FROM lessons WHERE course_id = ? ORDER BY sort_order ASC`
    )
    .all(courseId) as Array<Record<string, unknown>>;

  const progressMap = new Map<string, { completed: boolean; playback_position_sec: number }>();
  if (req.user) {
    const progRows = db
      .prepare(
        `SELECT lesson_id, completed, playback_position_sec FROM lesson_progress WHERE user_id = ? AND course_id = ?`
      )
      .all(req.user.id, courseId) as Array<{
      lesson_id: string;
      completed: number;
      playback_position_sec: number;
    }>;
    for (const p of progRows) {
      progressMap.set(p.lesson_id, {
        completed: Boolean(p.completed),
        playback_position_sec: p.playback_position_sec,
      });
    }
  }

  const structuredModules = modules.map((m) => ({
    ...m,
    lessons: lessons
      .filter((l) => l.module_id === m.id)
      .map((l) => {
        const isPreview = Boolean(l.is_preview);
        const prog = progressMap.get(String(l.id));
        return {
          ...l,
          is_preview: isPreview,
          allow_download: Boolean(l.allow_download),
          locked: !hasAccess && !isPreview,
          completed: prog?.completed ?? false,
          playback_position_sec: prog?.playback_position_sec ?? 0,
        };
      }),
  }));

  const liveSessions = db
    .prepare(
      `SELECT s.*, u.full_name as instructor_name
       FROM live_sessions s
       LEFT JOIN users u ON u.id = s.instructor_id
       WHERE s.course_id = ? AND s.status IN ('scheduled', 'live')
       ORDER BY s.scheduled_start_at ASC`
    )
    .all(courseId);

  const relatedResources = db
    .prepare(
      `SELECT r.*, p.id as product_id
       FROM learning_resources r
       LEFT JOIN products p ON p.target_resource_id = r.id AND p.product_type = 'resource'
       WHERE r.course_id = ? AND r.status = 'published'`
    )
    .all(courseId);

  const quizzes = db
    .prepare(`SELECT id, title, description, passing_score FROM quizzes WHERE course_id = ?`)
    .all(courseId);

  const assignments = db
    .prepare(`SELECT id, title, instructions, due_days, max_score FROM assignments WHERE course_id = ?`)
    .all(courseId);

  res.json({
    course: {
      ...row,
      is_free: Boolean(row.is_free),
      featured: Boolean(row.featured),
      learning_outcomes: safeJsonParse(row.learning_outcomes, []),
      requirements: safeJsonParse(row.requirements, []),
      has_access: hasAccess,
    },
    modules: structuredModules,
    liveSessions,
    relatedResources,
    quizzes,
    assignments,
  });
});

catalogRouter.get('/resources', optionalAuth, (req, res) => {
  const db = getDb();
  const search = String(req.query.q || '').trim().toLowerCase();
  const resourceType = String(req.query.type || 'all').trim();
  const priceFilter = String(req.query.price || 'all').trim();

  let sql = `
    SELECT r.*,
           u.full_name as author_name,
           c.title as course_title,
           cat.name as category_name,
           p.id as product_id
    FROM learning_resources r
    LEFT JOIN users u ON u.id = r.author_id
    LEFT JOIN courses c ON c.id = r.course_id
    LEFT JOIN course_categories cat ON cat.id = r.category_id
    LEFT JOIN products p ON p.target_resource_id = r.id AND p.product_type = 'resource'
    WHERE r.status = 'published'
  `;
  const params: Array<string | number> = [];

  if (search) {
    sql += ` AND (LOWER(r.title) LIKE ? OR LOWER(r.description) LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }
  if (resourceType && resourceType !== 'all') {
    sql += ` AND r.resource_type = ?`;
    params.push(resourceType);
  }
  if (priceFilter === 'free') {
    sql += ` AND r.is_free = 1`;
  } else if (priceFilter === 'paid') {
    sql += ` AND r.is_free = 0`;
  }

  sql += ` ORDER BY r.created_at DESC`;

  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  const resources = rows.map((r) => ({
    ...r,
    is_free: Boolean(r.is_free),
    allow_download: Boolean(r.allow_download),
    has_access: req.user
      ? canUserAccessResource(req.user.id, req.user.role, String(r.id), db)
      : Boolean(r.is_free),
  }));

  res.json({ resources });
});

catalogRouter.get('/bundles', optionalAuth, (_req, res) => {
  const db = getDb();
  const bundles = db
    .prepare(
      `SELECT id, sku, title, description, product_type, price_ghs, currency, active
       FROM products WHERE product_type = 'bundle' AND active = 1`
    )
    .all() as Array<Record<string, unknown>>;

  const enriched = bundles.map((b) => {
    const items = db
      .prepare(
        `SELECT bi.id, bi.item_type, bi.course_id, bi.resource_id,
                COALESCE(c.title, r.title) as title
         FROM bundle_items bi
         LEFT JOIN courses c ON c.id = bi.course_id
         LEFT JOIN learning_resources r ON r.id = bi.resource_id
         WHERE bi.bundle_product_id = ?`
      )
      .all(String(b.id));
    return {
      ...b,
      active: Boolean(b.active),
      bundle_items: items,
    };
  });

  res.json({ bundles: enriched });
});

catalogRouter.get('/products/:productId', (req, res) => {
  const db = getDb();
  const pid = String(req.params.productId);
  const product = db
    .prepare(`SELECT * FROM products WHERE id = ? OR target_course_id = ? OR target_resource_id = ?`)
    .get(pid, pid, pid) as
    | Record<string, unknown>
    | undefined;

  if (!product) {
    res.status(404).json({ error: 'Product not found.' });
    return;
  }

  let bundleItems: unknown[] = [];
  if (product.product_type === 'bundle') {
    bundleItems = db
      .prepare(
        `SELECT bi.id, bi.item_type, bi.course_id, bi.resource_id,
                COALESCE(c.title, r.title) as title
         FROM bundle_items bi
         LEFT JOIN courses c ON c.id = bi.course_id
         LEFT JOIN learning_resources r ON r.id = bi.resource_id
         WHERE bi.bundle_product_id = ?`
      )
      .all(String(product.id));
  }

  res.json({
    product: {
      ...product,
      active: Boolean(product.active),
      bundle_items: bundleItems,
    },
  });
});

catalogRouter.get('/live-sessions', optionalAuth, (_req, res) => {
  const db = getDb();
  const sessions = db
    .prepare(
      `SELECT s.*, c.title as course_title, c.slug as course_slug, u.full_name as instructor_name,
              (SELECT COUNT(*) FROM session_attendance a WHERE a.session_id = s.id) as attendance_count
       FROM live_sessions s
       LEFT JOIN courses c ON c.id = s.course_id
       LEFT JOIN users u ON u.id = s.instructor_id
       ORDER BY CASE WHEN s.status = 'live' THEN 0 WHEN s.status = 'scheduled' THEN 1 ELSE 2 END,
                s.scheduled_start_at ASC`
    )
    .all() as Array<Record<string, unknown>>;

  res.json({
    sessions: sessions.map((s) => ({
      ...s,
      is_public: Boolean(s.is_public),
      recording_enabled: Boolean(s.recording_enabled),
    })),
  });
});

function safeJsonParse<T>(val: unknown, fallback: T): T {
  if (typeof val !== 'string') return fallback;
  try {
    return JSON.parse(val) as T;
  } catch {
    return fallback;
  }
}
