import { Router } from 'express';
import { z } from 'zod';
import { getDb, newId, nowIso, withTransaction, writeAuditLog } from '../db/index.js';
import { requireRole } from '../middleware/auth.js';
import { validateUploadMetadata, storePrivateObject } from '../services/storage.js';
import type { DatabaseSync } from 'node:sqlite';

export const instructorRouter = Router();

instructorRouter.use(requireRole('instructor', 'admin'));

function assertCourseOwnership(
  db: DatabaseSync,
  courseId: string,
  userId: string,
  userRole: string
): { id: string; instructor_id: string; title: string } {
  const course = db
    .prepare(`SELECT id, instructor_id, title FROM courses WHERE id = ?`)
    .get(courseId) as { id: string; instructor_id: string; title: string } | undefined;

  if (!course) {
    throw Object.assign(new Error('Course not found.'), { statusCode: 404 });
  }
  if (userRole !== 'admin' && course.instructor_id !== userId) {
    throw Object.assign(
      new Error('You are only authorized to manage courses assigned to you.'),
      { statusCode: 403 }
    );
  }
  return course;
}

instructorRouter.get('/overview', (req, res) => {
  const db = getDb();
  const user = req.user!;
  const isAdmin = user.role === 'admin';

  const courses = db
    .prepare(
      `SELECT c.*, cat.name as category_name,
              (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) as lesson_count,
              (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id AND e.status != 'revoked') as enrollment_count
       FROM courses c
       LEFT JOIN course_categories cat ON cat.id = c.category_id
       ${isAdmin ? '' : 'WHERE c.instructor_id = ?'}
       ORDER BY c.updated_at DESC`
    )
    .all(...(isAdmin ? [] : [user.id])) as Array<Record<string, unknown>>;

  const resources = db
    .prepare(
      `SELECT r.*, c.title as course_title
       FROM learning_resources r
       LEFT JOIN courses c ON c.id = r.course_id
       ${isAdmin ? '' : 'WHERE r.author_id = ?'}
       ORDER BY r.created_at DESC`
    )
    .all(...(isAdmin ? [] : [user.id]));

  const liveSessions = db
    .prepare(
      `SELECT s.*, c.title as course_title,
              (SELECT COUNT(*) FROM session_attendance a WHERE a.session_id = s.id) as attendance_count
       FROM live_sessions s
       JOIN courses c ON c.id = s.course_id
       ${isAdmin ? '' : 'WHERE s.instructor_id = ?'}
       ORDER BY s.scheduled_start_at DESC`
    )
    .all(...(isAdmin ? [] : [user.id]));

  const enrolledStudents = db
    .prepare(
      `SELECT e.id as enrollment_id, e.course_id, e.status, e.enrolled_at, e.last_accessed_at,
              c.title as course_title, u.id as student_id, u.full_name as student_name, u.email as student_email,
              (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) as total_lessons,
              (SELECT COUNT(*) FROM lesson_progress lp WHERE lp.course_id = c.id AND lp.user_id = u.id AND lp.completed = 1) as completed_lessons
       FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       JOIN users u ON u.id = e.user_id
       WHERE e.status != 'revoked' ${isAdmin ? '' : 'AND c.instructor_id = ?'}
       ORDER BY e.enrolled_at DESC`
    )
    .all(...(isAdmin ? [] : [user.id]));

  const submissions = db
    .prepare(
      `SELECT s.*, a.title as assignment_title, a.max_score, c.title as course_title,
              u.full_name as student_name, u.email as student_email
       FROM assignment_submissions s
       JOIN assignments a ON a.id = s.assignment_id
       JOIN courses c ON c.id = a.course_id
       JOIN users u ON u.id = s.user_id
       ${isAdmin ? '' : 'WHERE c.instructor_id = ?'}
       ORDER BY s.submitted_at DESC`
    )
    .all(...(isAdmin ? [] : [user.id]));

  res.json({
    courses: courses.map((c) => ({
      ...c,
      is_free: Boolean(c.is_free),
      featured: Boolean(c.featured),
    })),
    resources,
    liveSessions,
    enrolledStudents,
    submissions,
  });
});

const createCourseSchema = z.object({
  title: z.string().min(4, 'Course title must be at least 4 characters.').max(200),
  subtitle: z.string().max(300).optional(),
  description: z.string().min(15, 'Description must be at least 15 characters.'),
  category_id: z.string().optional(),
  level: z.enum(['Beginner', 'Intermediate', 'Advanced', 'All Levels']).default('Intermediate'),
  duration_hours: z.number().min(0.5).max(500).default(10),
  artwork_url: z.string().optional(),
  is_free: z.boolean().default(false),
  price_ghs: z.number().min(0).default(0),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  learning_outcomes: z.array(z.string()).default([]),
  requirements: z.array(z.string()).default([]),
});

instructorRouter.post('/courses', (req, res) => {
  const parsed = createCourseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid course data.',
    });
    return;
  }

  const user = req.user!;
  const data = parsed.data;
  const priceGhs = data.is_free ? 0 : data.price_ghs;
  const slugBase = data.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  const slug = `${slugBase}-${Math.random().toString(36).slice(2, 6)}`;
  const courseId = newId('crs');
  const prodId = `prd_${courseId}`;
  const now = nowIso();

  withTransaction((db) => {
    db.prepare(
      `INSERT INTO courses (
         id, slug, title, subtitle, description, category_id, instructor_id,
         level, duration_hours, artwork_url, learning_outcomes, requirements,
         is_free, price_ghs, currency, status, featured, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'GHS', ?, 0, ?, ?)`
    ).run(
      courseId,
      slug,
      data.title.trim(),
      data.subtitle ?? '',
      data.description.trim(),
      data.category_id || 'cat_cloud',
      user.id,
      data.level,
      data.duration_hours,
      data.artwork_url || 'gradient:indigo-cyan',
      JSON.stringify(data.learning_outcomes),
      JSON.stringify(data.requirements),
      data.is_free ? 1 : 0,
      priceGhs,
      data.status,
      now,
      now
    );

    db.prepare(
      `INSERT INTO products (id, sku, title, description, product_type, target_course_id, price_ghs, currency, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'course', ?, ?, 'GHS', 1, ?, ?)`
    ).run(
      prodId,
      `SKU-${courseId.toUpperCase()}`,
      data.title.trim(),
      data.subtitle ?? data.description.slice(0, 140),
      courseId,
      priceGhs,
      now,
      now
    );

    db.prepare(
      `INSERT INTO product_prices (id, product_id, amount, currency, effective_from)
       VALUES (?, ?, ?, 'GHS', ?)`
    ).run(newId('prc'), prodId, priceGhs, now);
  });

  writeAuditLog({
    actorId: user.id,
    actorRole: user.role,
    action: 'course.create',
    targetType: 'course',
    targetId: courseId,
    metadata: { title: data.title, status: data.status, priceGhs },
  });

  res.status(201).json({
    ok: true,
    courseId,
    slug,
    productId: prodId,
  });
});

instructorRouter.patch('/courses/:courseId', (req, res) => {
  const db = getDb();
  const user = req.user!;
  const courseId = String(req.params.courseId);
  try {
    assertCourseOwnership(db, courseId, user.id, user.role);
  } catch (err) {
    const status = (err as { statusCode?: number })?.statusCode || 403;
    res.status(status).json({ error: (err as Error).message });
    return;
  }

  const updateSchema = createCourseSchema.partial();
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid course update fields.' });
    return;
  }

  const existing = db
    .prepare(`SELECT * FROM courses WHERE id = ?`)
    .get(courseId) as Record<string, unknown>;

  const d = parsed.data;
  const nextTitle = d.title?.trim() ?? String(existing.title);
  const nextSubtitle = d.subtitle !== undefined ? d.subtitle : String(existing.subtitle || '');
  const nextDesc = d.description?.trim() ?? String(existing.description);
  const nextCategory = d.category_id ?? (existing.category_id as string | null);
  const nextLevel = d.level ?? String(existing.level);
  const nextDuration = d.duration_hours ?? Number(existing.duration_hours);
  const nextIsFree = d.is_free !== undefined ? d.is_free : Boolean(existing.is_free);
  const nextPrice = nextIsFree ? 0 : d.price_ghs ?? Number(existing.price_ghs);
  const nextStatus = d.status ?? String(existing.status);
  const now = nowIso();

  withTransaction((tx) => {
    tx.prepare(
      `UPDATE courses
       SET title = ?, subtitle = ?, description = ?, category_id = ?,
           level = ?, duration_hours = ?, is_free = ?, price_ghs = ?,
           status = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      nextTitle,
      nextSubtitle,
      nextDesc,
      nextCategory,
      nextLevel,
      nextDuration,
      nextIsFree ? 1 : 0,
      nextPrice,
      nextStatus,
      now,
      courseId
    );

    tx.prepare(
      `UPDATE products SET title = ?, price_ghs = ?, updated_at = ?
       WHERE target_course_id = ? AND product_type = 'course'`
    ).run(nextTitle, nextPrice, now, courseId);
  });

  writeAuditLog({
    actorId: user.id,
    actorRole: user.role,
    action: 'course.update',
    targetType: 'course',
    targetId: courseId,
    metadata: { status: nextStatus, priceGhs: nextPrice },
  });

  res.json({ ok: true });
});

instructorRouter.post('/courses/:courseId/modules', (req, res) => {
  const schema = z.object({
    title: z.string().min(2).max(200),
    description: z.string().max(500).optional(),
    sort_order: z.number().int().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Module title is required.' });
    return;
  }

  const db = getDb();
  const user = req.user!;
  const courseId = String(req.params.courseId);
  try {
    assertCourseOwnership(db, courseId, user.id, user.role);
  } catch (err) {
    res.status((err as { statusCode?: number }).statusCode || 403).json({
      error: (err as Error).message,
    });
    return;
  }

  const maxOrder = (
    db
      .prepare(`SELECT COALESCE(MAX(sort_order), 0) as m FROM course_modules WHERE course_id = ?`)
      .get(courseId) as { m: number }
  ).m;

  const moduleId = newId('mod');
  db.prepare(
    `INSERT INTO course_modules (id, course_id, title, description, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    moduleId,
    courseId,
    parsed.data.title.trim(),
    parsed.data.description ?? null,
    parsed.data.sort_order ?? maxOrder + 1,
    nowIso()
  );

  res.status(201).json({ ok: true, moduleId });
});

instructorRouter.post('/courses/:courseId/lessons', (req, res) => {
  const schema = z.object({
    module_id: z.string().min(1),
    title: z.string().min(2).max(200),
    description: z.string().max(1000).optional(),
    content_type: z.enum(['video', 'document', 'article', 'quiz']).default('video'),
    article_body: z.string().optional(),
    duration_minutes: z.number().int().min(1).max(600).default(15),
    is_preview: z.boolean().default(false),
    allow_download: z.boolean().default(false),
    sort_order: z.number().int().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid lesson fields.',
    });
    return;
  }

  const db = getDb();
  const user = req.user!;
  const courseId = String(req.params.courseId);
  try {
    assertCourseOwnership(db, courseId, user.id, user.role);
  } catch (err) {
    res.status((err as { statusCode?: number }).statusCode || 403).json({
      error: (err as Error).message,
    });
    return;
  }

  const maxOrder = (
    db
      .prepare(`SELECT COALESCE(MAX(sort_order), 0) as m FROM lessons WHERE module_id = ?`)
      .get(parsed.data.module_id) as { m: number }
  ).m;

  const lessonId = newId('les');
  const d = parsed.data;
  db.prepare(
    `INSERT INTO lessons (
       id, module_id, course_id, title, description, content_type,
       video_url, document_url, article_body, duration_minutes,
       is_preview, allow_download, sort_order, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    lessonId,
    d.module_id,
    courseId,
    d.title.trim(),
    d.description ?? null,
    d.content_type,
    `/api/media/lesson/${lessonId}`,
    `/api/media/lesson/${lessonId}`,
    d.article_body ?? `### ${d.title}\n\nLesson notes and technical reference.`,
    d.duration_minutes,
    d.is_preview ? 1 : 0,
    d.allow_download ? 1 : 0,
    d.sort_order ?? maxOrder + 1,
    nowIso()
  );

  res.status(201).json({ ok: true, lessonId });
});

instructorRouter.post('/courses/:courseId/reorder', (req, res) => {
  const schema = z.object({
    lessonOrders: z.array(
      z.object({
        id: z.string().min(1),
        sort_order: z.number().int().min(0),
      })
    ),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid lesson ordering payload.' });
    return;
  }

  const db = getDb();
  const user = req.user!;
  const courseId = String(req.params.courseId);
  try {
    assertCourseOwnership(db, courseId, user.id, user.role);
  } catch (err) {
    res.status((err as { statusCode?: number }).statusCode || 403).json({
      error: (err as Error).message,
    });
    return;
  }

  withTransaction((tx) => {
    const stmt = tx.prepare(
      `UPDATE lessons SET sort_order = ? WHERE id = ? AND course_id = ?`
    );
    for (const item of parsed.data.lessonOrders) {
      stmt.run(item.sort_order, item.id, courseId);
    }
  });

  res.json({ ok: true });
});

instructorRouter.post('/resources', (req, res) => {
  const schema = z.object({
    title: z.string().min(3).max(200),
    description: z.string().min(10).max(2000),
    resource_type: z.enum(['book', 'pdf', 'video', 'template', 'audio', 'presentation']),
    course_id: z.string().optional().nullable(),
    category_id: z.string().optional().nullable(),
    file_name: z.string().min(2),
    file_size_bytes: z.number().int().min(1),
    mime_type: z.string().min(3),
    content_base64: z.string().optional(),
    page_count: z.number().int().min(1).optional().nullable(),
    is_free: z.boolean().default(false),
    price_ghs: z.number().min(0).default(0),
    allow_download: z.boolean().default(true),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid resource upload data.',
    });
    return;
  }

  const d = parsed.data;
  const validation = validateUploadMetadata({
    fileName: d.file_name,
    mimeType: d.mime_type,
    fileSizeBytes: d.file_size_bytes,
  });

  if (!validation.valid) {
    res.status(400).json({ error: validation.error });
    return;
  }

  const user = req.user!;
  const resId = newId('res');
  const prodId = `prd_${resId}`;
  const slug = `${d.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)}-${Math.random().toString(36).slice(2, 6)}`;
  const fileKey = `resources/${resId}-${d.file_name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const priceGhs = d.is_free ? 0 : d.price_ghs;
  const now = nowIso();

  const fileBuffer = d.content_base64
    ? Buffer.from(d.content_base64, 'base64')
    : Buffer.from(`%PDF-1.4\n% Aether LMS Uploaded Resource: ${d.title}\n`, 'utf-8');
  storePrivateObject(fileKey, fileBuffer);

  withTransaction((db) => {
    db.prepare(
      `INSERT INTO learning_resources (
         id, slug, title, description, resource_type, author_id, course_id, category_id,
         file_key, file_name, file_size_bytes, mime_type, page_count,
         is_free, price_ghs, currency, allow_download, status, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'GHS', ?, 'published', ?, ?)`
    ).run(
      resId,
      slug,
      d.title.trim(),
      d.description.trim(),
      d.resource_type,
      user.id,
      d.course_id || null,
      d.category_id || 'cat_cloud',
      fileKey,
      d.file_name,
      d.file_size_bytes,
      d.mime_type,
      d.page_count ?? null,
      d.is_free ? 1 : 0,
      priceGhs,
      d.allow_download ? 1 : 0,
      now,
      now
    );

    db.prepare(
      `INSERT INTO products (id, sku, title, description, product_type, target_resource_id, price_ghs, currency, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'resource', ?, ?, 'GHS', 1, ?, ?)`
    ).run(
      prodId,
      `SKU-${resId.toUpperCase()}`,
      d.title.trim(),
      d.description.slice(0, 140),
      resId,
      priceGhs,
      now,
      now
    );
  });

  writeAuditLog({
    actorId: user.id,
    actorRole: user.role,
    action: 'resource.upload',
    targetType: 'resource',
    targetId: resId,
    metadata: { fileName: d.file_name, priceGhs },
  });

  res.status(201).json({
    ok: true,
    resourceId: resId,
    productId: prodId,
    slug,
  });
});

instructorRouter.post('/live-sessions', (req, res) => {
  const schema = z.object({
    course_id: z.string().min(1),
    title: z.string().min(4).max(200),
    description: z.string().max(1000).optional(),
    scheduled_start_at: z.string().min(10),
    scheduled_end_at: z.string().min(10),
    is_public: z.boolean().default(false),
    recording_enabled: z.boolean().default(false),
    max_participants: z.number().int().min(2).max(1000).default(100),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid session schedule data.',
    });
    return;
  }

  const db = getDb();
  const user = req.user!;
  try {
    assertCourseOwnership(db, parsed.data.course_id, user.id, user.role);
  } catch (err) {
    res.status((err as { statusCode?: number }).statusCode || 403).json({
      error: (err as Error).message,
    });
    return;
  }

  const sessionId = newId('ses');
  const roomName = `aether-room-${sessionId}`;
  const now = nowIso();
  const d = parsed.data;

  db.prepare(
    `INSERT INTO live_sessions (
       id, course_id, instructor_id, title, description, room_name,
       scheduled_start_at, scheduled_end_at, status, is_public,
       recording_enabled, recording_status, max_participants, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, 'none', ?, ?, ?)`
  ).run(
    sessionId,
    d.course_id,
    user.id,
    d.title.trim(),
    d.description ?? '',
    roomName,
    d.scheduled_start_at,
    d.scheduled_end_at,
    d.is_public ? 1 : 0,
    d.recording_enabled ? 1 : 0,
    d.max_participants,
    now,
    now
  );

  writeAuditLog({
    actorId: user.id,
    actorRole: user.role,
    action: 'live_session.schedule',
    targetType: 'live_session',
    targetId: sessionId,
    metadata: { roomName, courseId: d.course_id },
  });

  res.status(201).json({
    ok: true,
    sessionId,
    roomName,
  });
});

instructorRouter.post('/announcements', (req, res) => {
  const schema = z.object({
    course_id: z.string().min(1),
    title: z.string().min(3).max(200),
    body: z.string().min(5).max(3000),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Announcement title and body are required.' });
    return;
  }

  const db = getDb();
  const user = req.user!;
  try {
    assertCourseOwnership(db, parsed.data.course_id, user.id, user.role);
  } catch (err) {
    res.status((err as { statusCode?: number }).statusCode || 403).json({
      error: (err as Error).message,
    });
    return;
  }

  const annId = newId('ann');
  db.prepare(
    `INSERT INTO announcements (id, course_id, author_id, title, body, audience, created_at)
     VALUES (?, ?, ?, ?, ?, 'course', ?)`
  ).run(
    annId,
    parsed.data.course_id,
    user.id,
    parsed.data.title.trim(),
    parsed.data.body.trim(),
    nowIso()
  );

  res.status(201).json({ ok: true, announcementId: annId });
});

instructorRouter.post('/submissions/:submissionId/grade', (req, res) => {
  const schema = z.object({
    score: z.number().int().min(0).max(100),
    feedback: z.string().min(2).max(2000),
    status: z.enum(['graded', 'revision_requested']).default('graded'),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid score and feedback are required.' });
    return;
  }

  const db = getDb();
  const user = req.user!;
  const sub = db
    .prepare(
      `SELECT s.id, a.course_id
       FROM assignment_submissions s
       JOIN assignments a ON a.id = s.assignment_id
       WHERE s.id = ?`
    )
    .get(String(req.params.submissionId)) as { id: string; course_id: string } | undefined;

  if (!sub) {
    res.status(404).json({ error: 'Submission not found.' });
    return;
  }

  try {
    assertCourseOwnership(db, sub.course_id, user.id, user.role);
  } catch (err) {
    res.status((err as { statusCode?: number }).statusCode || 403).json({
      error: (err as Error).message,
    });
    return;
  }

  db.prepare(
    `UPDATE assignment_submissions
     SET score = ?, feedback = ?, status = ?, graded_by = ?, graded_at = ?
     WHERE id = ?`
  ).run(
    parsed.data.score,
    parsed.data.feedback.trim(),
    parsed.data.status,
    user.id,
    nowIso(),
    sub.id
  );

  res.json({ ok: true });
});
