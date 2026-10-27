import { Router } from 'express';
import { z } from 'zod';
import { getDb, nowIso } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import {
  authorizeAndMintLiveKitToken,
  transitionSessionState,
  toggleSessionRecording,
  verifyAndProcessLiveKitWebhook,
} from '../services/livekit.js';

export const livekitRouter = Router();

livekitRouter.get('/sessions/:sessionId', requireAuth, (req, res) => {
  const db = getDb();
  const sessionId = String(req.params.sessionId);
  const session = db
    .prepare(
      `SELECT s.*, c.title as course_title, c.slug as course_slug,
              u.full_name as instructor_name, u.title as instructor_title
       FROM live_sessions s
       LEFT JOIN courses c ON c.id = s.course_id
       LEFT JOIN users u ON u.id = s.instructor_id
       WHERE s.id = ?`
    )
    .get(sessionId) as Record<string, unknown> | undefined;

  if (!session) {
    res.status(404).json({ error: 'Live session not found.' });
    return;
  }

  const attendance = db
    .prepare(
      `SELECT a.id, a.user_id, a.role, a.joined_at, a.left_at, u.full_name
       FROM session_attendance a
       JOIN users u ON u.id = a.user_id
       WHERE a.session_id = ?
       ORDER BY a.joined_at DESC LIMIT 50`
    )
    .all(String(session.id));

  res.json({
    session: {
      ...session,
      is_public: Boolean(session.is_public),
      recording_enabled: Boolean(session.recording_enabled),
    },
    attendance,
  });
});

livekitRouter.post('/sessions/:sessionId/join', requireAuth, async (req, res) => {
  try {
    const joinData = await authorizeAndMintLiveKitToken({
      sessionId: String(req.params.sessionId),
      user: req.user!,
    });
    res.json(joinData);
  } catch (err) {
    const status = (err as { statusCode?: number })?.statusCode || 400;
    res.status(status).json({
      error: err instanceof Error ? err.message : 'Unable to join live classroom.',
    });
  }
});

// Leave classroom (only updates the current participant's attendance record; does not end the room)
livekitRouter.post('/sessions/:sessionId/leave', requireAuth, (req, res) => {
  const db = getDb();
  const now = nowIso();
  db.prepare(
    `UPDATE session_attendance
     SET left_at = ?
     WHERE session_id = ? AND user_id = ? AND left_at IS NULL`
  ).run(now, String(req.params.sessionId), req.user!.id);

  res.json({ ok: true, leftAt: now });
});

// Change session lifecycle state (Instructor who owns the session or Admin only)
livekitRouter.post('/sessions/:sessionId/state', requireAuth, async (req, res) => {
  const schema = z.object({
    status: z.enum(['live', 'ended', 'canceled']),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid target status (live, ended, canceled) is required.' });
    return;
  }

  try {
    await transitionSessionState({
      sessionId: String(req.params.sessionId),
      actor: req.user!,
      targetStatus: parsed.data.status,
    });
    res.json({ ok: true, status: parsed.data.status });
  } catch (err) {
    const status = (err as { statusCode?: number })?.statusCode || 400;
    res.status(status).json({
      error: err instanceof Error ? err.message : 'Failed to update session state.',
    });
  }
});

livekitRouter.post('/sessions/:sessionId/recording', requireAuth, async (req, res) => {
  const schema = z.object({
    action: z.enum(['start', 'stop']),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Action must be start or stop.' });
    return;
  }

  try {
    const result = await toggleSessionRecording({
      sessionId: String(req.params.sessionId),
      actor: req.user!,
      action: parsed.data.action,
    });
    res.json(result);
  } catch (err) {
    const status = (err as { statusCode?: number })?.statusCode || 400;
    res.status(status).json({
      error: err instanceof Error ? err.message : 'Recording operation failed.',
    });
  }
});

livekitRouter.post('/webhook', async (req, res) => {
  const authHeader = req.headers.authorization;
  const rawBody =
    typeof (req as unknown as { rawBody?: string }).rawBody === 'string'
      ? (req as unknown as { rawBody: string }).rawBody
      : JSON.stringify(req.body);

  try {
    const result = await verifyAndProcessLiveKitWebhook(rawBody, authHeader);
    res.json(result);
  } catch (err) {
    res.status(401).json({
      error: err instanceof Error ? err.message : 'Invalid LiveKit webhook signature.',
    });
  }
});
