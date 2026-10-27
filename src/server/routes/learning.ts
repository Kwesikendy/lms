import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { getDb, newId, nowIso, writeAuditLog } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import {
  canUserAccessCourse,
  canUserAccessResource,
  grantEntitlement,
} from '../services/entitlements.js';
import {
  createSignedMediaUrl,
  verifySignedMediaParams,
} from '../services/storage.js';
import { config } from '../config.js';

export const learningRouter = Router();

learningRouter.get('/dashboard', requireAuth, (req, res) => {
  const db = getDb();
  const user = req.user!;

  // Enrolled courses with real progress calculation
  const enrollments = db
    .prepare(
      `SELECT e.id as enrollment_id, e.course_id, e.status as enrollment_status,
              e.enrolled_at, e.completed_at, e.last_accessed_lesson_id, e.last_accessed_at,
              c.slug, c.title, c.subtitle, c.level, c.duration_hours, c.artwork_url,
              u.full_name as instructor_name,
              (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) as total_lessons,
              (SELECT COUNT(*) FROM lesson_progress lp WHERE lp.course_id = c.id AND lp.user_id = ? AND lp.completed = 1) as completed_lessons
       FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       LEFT JOIN users u ON u.id = c.instructor_id
       WHERE e.user_id = ? AND e.status != 'revoked'
       ORDER BY COALESCE(e.last_accessed_at, e.enrolled_at) DESC`
    )
    .all(user.id, user.id) as Array<Record<string, unknown>>;

  const enrolledCourses = enrollments.map((e) => {
    const total = Number(e.total_lessons || 0);
    const completed = Number(e.completed_lessons || 0);
    const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return {
      ...e,
      total_lessons: total,
      completed_lessons: completed,
      progress_percent: progressPercent,
    };
  });

  // Accessible library resources (either free or entitled directly or via course)
  const allResources = db
    .prepare(
      `SELECT r.*, u.full_name as author_name, c.title as course_title,
              e.source as entitlement_source, e.granted_at, e.expires_at
       FROM learning_resources r
       LEFT JOIN users u ON u.id = r.author_id
       LEFT JOIN courses c ON c.id = r.course_id
       LEFT JOIN entitlements e ON e.user_id = ? AND e.target_type = 'resource' AND e.target_id = r.id AND e.status = 'active'
       WHERE r.status = 'published'
       ORDER BY r.created_at DESC`
    )
    .all(user.id) as Array<Record<string, unknown>>;

  const myResources = allResources
    .filter((r) => canUserAccessResource(user.id, user.role, String(r.id), db))
    .map((r) => ({
      ...r,
      is_free: Boolean(r.is_free),
      allow_download: Boolean(r.allow_download),
      has_access: true,
    }));

  // Upcoming and live sessions relevant to student
  const liveSessions = db
    .prepare(
      `SELECT s.*, c.title as course_title, u.full_name as instructor_name
       FROM live_sessions s
       JOIN courses c ON c.id = s.course_id
       LEFT JOIN users u ON u.id = s.instructor_id
       WHERE s.status IN ('live', 'scheduled', 'ended')
       ORDER BY CASE WHEN s.status = 'live' THEN 0 WHEN s.status = 'scheduled' THEN 1 ELSE 2 END,
                s.scheduled_start_at ASC`
    )
    .all() as Array<Record<string, unknown>>;

  const enrichedSessions = liveSessions.map((s) => ({
    ...s,
    is_public: Boolean(s.is_public),
    recording_enabled: Boolean(s.recording_enabled),
    can_join:
      Boolean(s.is_public) ||
      canUserAccessCourse(user.id, user.role, String(s.course_id), db),
  }));

  // Announcements for enrolled courses or all users
  const announcements = db
    .prepare(
      `SELECT a.*, c.title as course_title, u.full_name as author_name
       FROM announcements a
       LEFT JOIN courses c ON c.id = a.course_id
       LEFT JOIN users u ON u.id = a.author_id
       WHERE a.audience = 'all'
          OR a.course_id IN (SELECT course_id FROM enrollments WHERE user_id = ? AND status != 'revoked')
       ORDER BY a.created_at DESC LIMIT 10`
    )
    .all(user.id);

  res.json({
    enrolledCourses,
    myResources,
    liveSessions: enrichedSessions,
    announcements,
  });
});

learningRouter.post('/enroll-free', requireAuth, (req, res) => {
  const schema = z.object({
    courseId: z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid courseId is required.' });
    return;
  }

  const db = getDb();
  const course = db
    .prepare(`SELECT id, title, is_free, price_ghs, status FROM courses WHERE id = ?`)
    .get(parsed.data.courseId) as
    | { id: string; title: string; is_free: number; price_ghs: number; status: string }
    | undefined;

  if (!course || course.status !== 'published') {
    res.status(404).json({ error: 'Course not found or not available for enrollment.' });
    return;
  }

  if (!Boolean(course.is_free) && Number(course.price_ghs) > 0) {
    res.status(403).json({
      error: 'This is a paid course. Please complete purchase at checkout to unlock access.',
    });
    return;
  }

  const entitlementId = grantEntitlement({
    db,
    userId: req.user!.id,
    targetType: 'course',
    targetId: course.id,
    source: 'free_enrollment',
  });

  writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'course.free_enroll',
    targetType: 'course',
    targetId: course.id,
  });

  res.status(201).json({
    ok: true,
    entitlementId,
    courseId: course.id,
    message: `Successfully enrolled in ${course.title}.`,
  });
});

learningRouter.get('/courses/:courseId/lessons/:lessonId', requireAuth, (req, res) => {
  const db = getDb();
  const courseId = String(req.params.courseId);
  const lessonId = String(req.params.lessonId);
  const user = req.user!;

  const lesson = db
    .prepare(`SELECT * FROM lessons WHERE id = ? AND course_id = ?`)
    .get(lessonId, courseId) as Record<string, unknown> | undefined;

  if (!lesson) {
    res.status(404).json({ error: 'Lesson not found.' });
    return;
  }

  const isPreview = Boolean(lesson.is_preview);
  const hasCourseAccess = canUserAccessCourse(user.id, user.role, courseId, db);

  if (!hasCourseAccess && !isPreview) {
    res.status(403).json({
      error: 'Access denied. You need an active course entitlement to view this protected lesson.',
      code: 'ENTITLEMENT_REQUIRED',
    });
    return;
  }

  const progress = db
    .prepare(
      `SELECT completed, playback_position_sec, completed_at FROM lesson_progress WHERE user_id = ? AND lesson_id = ?`
    )
    .get(user.id, lessonId) as
    | { completed: number; playback_position_sec: number; completed_at: string | null }
    | undefined;

  // Update last accessed lesson on enrollment if enrolled
  db.prepare(
    `UPDATE enrollments SET last_accessed_lesson_id = ?, last_accessed_at = ? WHERE user_id = ? AND course_id = ?`
  ).run(lessonId, nowIso(), user.id, courseId);

  const signedStream = createSignedMediaUrl({
    targetType: 'lesson',
    targetId: lessonId,
    userId: user.id,
    disposition: 'inline',
  });

  const signedDownload = Boolean(lesson.allow_download)
    ? createSignedMediaUrl({
        targetType: 'lesson',
        targetId: lessonId,
        userId: user.id,
        disposition: 'attachment',
      })
    : null;

  res.json({
    lesson: {
      ...lesson,
      is_preview: isPreview,
      allow_download: Boolean(lesson.allow_download),
      completed: Boolean(progress?.completed),
      playback_position_sec: progress?.playback_position_sec ?? 0,
      signed_stream_url: signedStream.url,
      signed_download_url: signedDownload?.url ?? null,
    },
  });
});

learningRouter.post('/lessons/:lessonId/progress', requireAuth, (req, res) => {
  const schema = z.object({
    completed: z.boolean().optional(),
    playback_position_sec: z.number().min(0).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid progress payload.' });
    return;
  }

  const db = getDb();
  const user = req.user!;
  const lesson = db
    .prepare(`SELECT id, course_id, is_preview FROM lessons WHERE id = ?`)
    .get(String(req.params.lessonId)) as
    | { id: string; course_id: string; is_preview: number }
    | undefined;

  if (!lesson) {
    res.status(404).json({ error: 'Lesson not found.' });
    return;
  }

  if (
    !Boolean(lesson.is_preview) &&
    !canUserAccessCourse(user.id, user.role, lesson.course_id, db)
  ) {
    res.status(403).json({ error: 'You do not have access to record progress for this lesson.' });
    return;
  }

  const now = nowIso();
  const existing = db
    .prepare(
      `SELECT id, completed, playback_position_sec, completed_at FROM lesson_progress WHERE user_id = ? AND lesson_id = ?`
    )
    .get(user.id, lesson.id) as
    | {
        id: string;
        completed: number;
        playback_position_sec: number;
        completed_at: string | null;
      }
    | undefined;

  const nextCompleted =
    parsed.data.completed !== undefined
      ? parsed.data.completed
      : Boolean(existing?.completed);
  const nextPosition =
    parsed.data.playback_position_sec !== undefined
      ? Math.floor(parsed.data.playback_position_sec)
      : existing?.playback_position_sec ?? 0;

  if (existing) {
    db.prepare(
      `UPDATE lesson_progress
       SET completed = ?, playback_position_sec = ?,
           completed_at = CASE WHEN ? = 1 THEN COALESCE(completed_at, ?) ELSE NULL END,
           updated_at = ?
       WHERE id = ?`
    ).run(nextCompleted ? 1 : 0, nextPosition, nextCompleted ? 1 : 0, now, now, existing.id);
  } else {
    db.prepare(
      `INSERT INTO lesson_progress (id, user_id, course_id, lesson_id, completed, playback_position_sec, completed_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      newId('prog'),
      user.id,
      lesson.course_id,
      lesson.id,
      nextCompleted ? 1 : 0,
      nextPosition,
      nextCompleted ? now : null,
      now
    );
  }

  // Check if all lessons in the course are now completed
  const counts = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM lessons WHERE course_id = ?) as total,
         (SELECT COUNT(*) FROM lesson_progress WHERE course_id = ? AND user_id = ? AND completed = 1) as done`
    )
    .get(lesson.course_id, lesson.course_id, user.id) as { total: number; done: number };

  if (counts.total > 0 && counts.done >= counts.total) {
    db.prepare(
      `UPDATE enrollments SET status = 'completed', completed_at = COALESCE(completed_at, ?) WHERE user_id = ? AND course_id = ?`
    ).run(now, user.id, lesson.course_id);
  }

  res.json({
    ok: true,
    lessonId: lesson.id,
    completed: nextCompleted,
    playback_position_sec: nextPosition,
    courseProgressPercent:
      counts.total > 0 ? Math.round((counts.done / counts.total) * 100) : 0,
  });
});

learningRouter.get('/resources/:resourceId/access', requireAuth, (req, res) => {
  const db = getDb();
  const user = req.user!;
  const resource = db
    .prepare(`SELECT * FROM learning_resources WHERE id = ?`)
    .get(String(req.params.resourceId)) as Record<string, unknown> | undefined;

  if (!resource) {
    res.status(404).json({ error: 'Resource not found.' });
    return;
  }

  const allowed = canUserAccessResource(user.id, user.role, String(resource.id), db);
  if (!allowed) {
    res.status(403).json({
      error: 'Access denied. Purchase this resource or its associated bundle to unlock access.',
      code: 'ENTITLEMENT_REQUIRED',
    });
    return;
  }

  const viewUrl = createSignedMediaUrl({
    targetType: 'resource',
    targetId: String(resource.id),
    userId: user.id,
    disposition: 'inline',
  });

  const downloadUrl = Boolean(resource.allow_download)
    ? createSignedMediaUrl({
        targetType: 'resource',
        targetId: String(resource.id),
        userId: user.id,
        disposition: 'attachment',
      })
    : null;

  res.json({
    resource: {
      ...resource,
      is_free: Boolean(resource.is_free),
      allow_download: Boolean(resource.allow_download),
    },
    signedViewUrl: viewUrl.url,
    signedDownloadUrl: downloadUrl?.url ?? null,
    expiresAt: viewUrl.expiresAt,
  });
});

learningRouter.get('/assessments', requireAuth, (req, res) => {
  const db = getDb();
  const user = req.user!;

  const quizzes = db
    .prepare(
      `SELECT q.*, c.title as course_title
       FROM quizzes q
       JOIN courses c ON c.id = q.course_id
       ORDER BY q.created_at DESC`
    )
    .all() as Array<Record<string, unknown>>;

  const accessibleQuizzes = quizzes
    .filter((q) => canUserAccessCourse(user.id, user.role, String(q.course_id), db))
    .map((q) => {
      const questions = db
        .prepare(
          `SELECT id, prompt, options, sort_order FROM quiz_questions WHERE quiz_id = ? ORDER BY sort_order ASC`
        )
        .all(String(q.id)) as Array<Record<string, unknown>>;

      const latestAttempt = db
        .prepare(
          `SELECT id, score_percent, passed, submitted_at FROM quiz_attempts
           WHERE quiz_id = ? AND user_id = ? ORDER BY submitted_at DESC LIMIT 1`
        )
        .get(String(q.id), user.id) as Record<string, unknown> | undefined;

      return {
        ...q,
        questions: questions.map((qn) => ({
          ...qn,
          options: JSON.parse(String(qn.options || '[]')),
        })),
        latest_attempt: latestAttempt
          ? {
              ...latestAttempt,
              passed: Boolean(latestAttempt.passed),
            }
          : null,
      };
    });

  const assignments = db
    .prepare(
      `SELECT a.*, c.title as course_title
       FROM assignments a
       JOIN courses c ON c.id = a.course_id
       ORDER BY a.created_at DESC`
    )
    .all() as Array<Record<string, unknown>>;

  const accessibleAssignments = assignments
    .filter((a) => canUserAccessCourse(user.id, user.role, String(a.course_id), db))
    .map((a) => {
      const submission = db
        .prepare(
          `SELECT id, submission_text, attachment_url, status, score, feedback, submitted_at, graded_at
           FROM assignment_submissions WHERE assignment_id = ? AND user_id = ?`
        )
        .get(String(a.id), user.id);
      return {
        ...a,
        submission: submission ?? null,
      };
    });

  res.json({
    quizzes: accessibleQuizzes,
    assignments: accessibleAssignments,
  });
});

learningRouter.post('/quizzes/:quizId/submit', requireAuth, (req, res) => {
  const schema = z.object({
    answers: z.record(z.string(), z.number().int().min(0)),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Please provide valid quiz answers.' });
    return;
  }

  const db = getDb();
  const user = req.user!;
  const quiz = db
    .prepare(`SELECT id, course_id, title, passing_score FROM quizzes WHERE id = ?`)
    .get(String(req.params.quizId)) as
    | { id: string; course_id: string; title: string; passing_score: number }
    | undefined;

  if (!quiz) {
    res.status(404).json({ error: 'Quiz not found.' });
    return;
  }

  if (!canUserAccessCourse(user.id, user.role, quiz.course_id, db)) {
    res.status(403).json({ error: 'You must be enrolled in this course to submit the quiz.' });
    return;
  }

  const questions = db
    .prepare(
      `SELECT id, prompt, options, correct_option_index, explanation FROM quiz_questions WHERE quiz_id = ? ORDER BY sort_order ASC`
    )
    .all(quiz.id) as Array<{
    id: string;
    prompt: string;
    options: string;
    correct_option_index: number;
    explanation: string | null;
  }>;

  if (!questions.length) {
    res.status(400).json({ error: 'Quiz has no questions.' });
    return;
  }

  let correctCount = 0;
  const feedback = questions.map((q) => {
    const selected = parsed.data.answers[q.id];
    const isCorrect = selected === q.correct_option_index;
    if (isCorrect) correctCount++;
    return {
      questionId: q.id,
      selectedOption: selected ?? null,
      correctOption: q.correct_option_index,
      isCorrect,
      explanation: q.explanation,
    };
  });

  const scorePercent = Math.round((correctCount / questions.length) * 100);
  const passed = scorePercent >= quiz.passing_score;
  const attemptId = newId('qza');
  const now = nowIso();

  db.prepare(
    `INSERT INTO quiz_attempts (id, quiz_id, user_id, score_percent, passed, answers, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    attemptId,
    quiz.id,
    user.id,
    scorePercent,
    passed ? 1 : 0,
    JSON.stringify(parsed.data.answers),
    now
  );

  res.status(201).json({
    attemptId,
    scorePercent,
    passed,
    passingScore: quiz.passing_score,
    feedback,
    submittedAt: now,
  });
});

learningRouter.post('/assignments/:assignmentId/submit', requireAuth, (req, res) => {
  const schema = z.object({
    submission_text: z.string().min(10, 'Submission must be at least 10 characters.').max(15000),
    attachment_url: z.string().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid assignment submission.',
    });
    return;
  }

  const db = getDb();
  const user = req.user!;
  const assignment = db
    .prepare(`SELECT id, course_id, title FROM assignments WHERE id = ?`)
    .get(String(req.params.assignmentId)) as { id: string; course_id: string; title: string } | undefined;

  if (!assignment) {
    res.status(404).json({ error: 'Assignment not found.' });
    return;
  }

  if (!canUserAccessCourse(user.id, user.role, assignment.course_id, db)) {
    res.status(403).json({ error: 'You must be enrolled in this course to submit assignments.' });
    return;
  }

  const now = nowIso();
  const existing = db
    .prepare(`SELECT id FROM assignment_submissions WHERE assignment_id = ? AND user_id = ?`)
    .get(assignment.id, user.id) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE assignment_submissions
       SET submission_text = ?, attachment_url = ?, status = 'submitted', submitted_at = ?
       WHERE id = ?`
    ).run(
      parsed.data.submission_text.trim(),
      parsed.data.attachment_url ?? null,
      now,
      existing.id
    );
    res.json({ ok: true, submissionId: existing.id, status: 'submitted' });
    return;
  }

  const subId = newId('sub');
  db.prepare(
    `INSERT INTO assignment_submissions (id, assignment_id, user_id, submission_text, attachment_url, status, submitted_at)
     VALUES (?, ?, ?, ?, ?, 'submitted', ?)`
  ).run(
    subId,
    assignment.id,
    user.id,
    parsed.data.submission_text.trim(),
    parsed.data.attachment_url ?? null,
    now
  );

  res.status(201).json({ ok: true, submissionId: subId, status: 'submitted' });
});

// Signed media stream endpoint (validates short-lived HMAC signature AND current user entitlement)
export const mediaRouter = Router();

mediaRouter.get('/stream/:targetType/:targetId', (req, res) => {
  const targetType = String(req.params.targetType);
  const targetId = String(req.params.targetId);
  const userId = String(req.query.u || '');
  const disposition = String(req.query.d || 'inline');
  const exp = Number(req.query.exp || 0);
  const sig = String(req.query.sig || '');

  if (
    !verifySignedMediaParams({
      targetType,
      targetId,
      userId,
      disposition,
      exp,
      sig,
    })
  ) {
    res.status(403).json({ error: 'Invalid or expired signed media URL.' });
    return;
  }

  const db = getDb();
  const user = db
    .prepare(`SELECT id, role, status FROM users WHERE id = ?`)
    .get(userId) as { id: string; role: string; status: string } | undefined;

  if (!user || user.status !== 'active') {
    res.status(403).json({ error: 'User account is not authorized.' });
    return;
  }

  if (targetType === 'resource') {
    if (!canUserAccessResource(user.id, user.role, targetId, db)) {
      res.status(403).json({ error: 'Resource entitlement revoked or missing.' });
      return;
    }
    const resource = db
      .prepare(`SELECT title, file_key, file_name, mime_type FROM learning_resources WHERE id = ?`)
      .get(targetId) as
      | { title: string; file_key: string; file_name: string; mime_type: string }
      | undefined;

    if (!resource) {
      res.status(404).json({ error: 'Resource file not found.' });
      return;
    }

    const safeKey = resource.file_key
      .replace(/[^a-zA-Z0-9._/-]/g, '_')
      .replace(/\.\./g, '');
    const fullPath = path.resolve(config.storage.localDir, safeKey);

    res.setHeader('Content-Type', resource.mime_type || 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `${disposition === 'attachment' ? 'attachment' : 'inline'}; filename="${resource.file_name}"`
    );
    res.setHeader('Cache-Control', 'private, no-store');

    if (fs.existsSync(fullPath)) {
      fs.createReadStream(fullPath).pipe(res);
      return;
    }
    res.send(
      `%PDF-1.4\n% Aether LMS Protected Document Stream: ${resource.title}\n`
    );
    return;
  }

  if (targetType === 'lesson') {
    const lesson = db
      .prepare(`SELECT id, course_id, title, is_preview, article_body FROM lessons WHERE id = ?`)
      .get(targetId) as
      | {
          id: string;
          course_id: string;
          title: string;
          is_preview: number;
          article_body: string | null;
        }
      | undefined;

    if (!lesson) {
      res.status(404).json({ error: 'Lesson not found.' });
      return;
    }

    if (
      !Boolean(lesson.is_preview) &&
      !canUserAccessCourse(user.id, user.role, lesson.course_id, db)
    ) {
      res.status(403).json({ error: 'Course entitlement required.' });
      return;
    }

    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `${disposition === 'attachment' ? 'attachment' : 'inline'}; filename="${lesson.id}-notes.md"`
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(
      `# ${lesson.title}\n\n${lesson.article_body || 'Protected lesson study guide.'}\n`
    );
    return;
  }

  res.status(400).json({ error: 'Unsupported media target.' });
});
