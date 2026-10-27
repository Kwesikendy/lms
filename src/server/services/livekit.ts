import { AccessToken, WebhookReceiver, RoomServiceClient, EgressClient } from 'livekit-server-sdk';
import { config } from '../config.js';
import { getDb, newId, nowIso, writeAuditLog } from '../db/index.js';
import { canUserAccessCourse } from './entitlements.js';
import type { User } from '../../shared/types.js';

export interface ClassroomJoinResult {
  token: string;
  wsUrl: string;
  roomName: string;
  sessionId: string;
  sessionTitle: string;
  sessionStatus: 'scheduled' | 'live' | 'ended' | 'canceled';
  participantRole: 'instructor' | 'moderator' | 'student';
  livekitConfigured: boolean;
  recordingEnabled: boolean;
  recordingStatus: string;
  permissions: {
    canPublish: boolean;
    canSubscribe: boolean;
    canPublishData: boolean;
    roomAdmin: boolean;
  };
}

export async function authorizeAndMintLiveKitToken(params: {
  sessionId: string;
  user: User;
}): Promise<ClassroomJoinResult> {
  const db = getDb();
  const session = db
    .prepare(
      `SELECT id, course_id, instructor_id, title, room_name, scheduled_start_at, scheduled_end_at,
              status, is_public, recording_enabled, recording_status, max_participants
       FROM live_sessions WHERE id = ?`
    )
    .get(params.sessionId) as
    | {
        id: string;
        course_id: string;
        instructor_id: string;
        title: string;
        room_name: string;
        scheduled_start_at: string;
        scheduled_end_at: string;
        status: 'scheduled' | 'live' | 'ended' | 'canceled';
        is_public: number;
        recording_enabled: number;
        recording_status: string;
        max_participants: number;
      }
    | undefined;

  if (!session) {
    throw Object.assign(new Error('Live classroom session not found.'), { statusCode: 404 });
  }

  if (session.status === 'canceled') {
    throw Object.assign(new Error('This live session has been canceled.'), { statusCode: 403 });
  }

  if (session.status === 'ended') {
    throw Object.assign(new Error('This live session has already ended.'), { statusCode: 403 });
  }

  const isSessionInstructor =
    params.user.role === 'instructor' && session.instructor_id === params.user.id;
  const isAdmin = params.user.role === 'admin';

  // Check student enrollment / course access unless the session is explicitly public or user is the instructor/admin
  if (!isSessionInstructor && !isAdmin && !Boolean(session.is_public)) {
    const allowed = canUserAccessCourse(
      params.user.id,
      params.user.role,
      session.course_id,
      db
    );
    if (!allowed) {
      throw Object.assign(
        new Error('Access denied. You must be enrolled in this course to join the live classroom.'),
        { statusCode: 403 }
      );
    }
  }

  // Determine participant role and strict LiveKit permissions
  const participantRole: 'instructor' | 'moderator' | 'student' = isSessionInstructor
    ? 'instructor'
    : isAdmin
    ? 'moderator'
    : 'student';

  const roomAdmin = isSessionInstructor || isAdmin;
  const canPublish = true; // Students can turn on mic/camera when permitted in interactive classes
  const canSubscribe = true;
  const canPublishData = true;

  // Use configured keys or development signing keys so token structure is always a valid LiveKit JWT
  const apiKey = config.livekit.isConfigured
    ? config.livekit.apiKey
    : 'APIKeyDevAetherLMSLocal';
  const apiSecret = config.livekit.isConfigured
    ? config.livekit.apiSecret
    : 'SecretKeyDevAetherLMSLocalMustBeAtLeast32BytesLong!';

  const at = new AccessToken(apiKey, apiSecret, {
    identity: `${params.user.role}:${params.user.id}`,
    name: params.user.full_name,
    ttl: '2h',
    metadata: JSON.stringify({
      userId: params.user.id,
      role: participantRole,
      email: params.user.email,
      sessionId: session.id,
    }),
  });

  at.addGrant({
    roomJoin: true,
    room: session.room_name,
    canPublish,
    canSubscribe,
    canPublishData,
    roomAdmin,
    roomRecord: roomAdmin && Boolean(session.recording_enabled),
  });

  const token = await at.toJwt();

  // If the instructor joins a scheduled session, automatically transition it to 'live'
  const now = nowIso();
  let currentStatus = session.status;
  if (isSessionInstructor && session.status === 'scheduled') {
    db.prepare(
      `UPDATE live_sessions SET status = 'live', actual_started_at = COALESCE(actual_started_at, ?), updated_at = ? WHERE id = ?`
    ).run(now, now, session.id);
    currentStatus = 'live';
  }

  // Record attendance entry
  db.prepare(
    `INSERT INTO session_attendance (id, session_id, user_id, role, joined_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(newId('attd'), session.id, params.user.id, participantRole, now);

  return {
    token,
    wsUrl: config.livekit.isConfigured ? config.livekit.url : '',
    roomName: session.room_name,
    sessionId: session.id,
    sessionTitle: session.title,
    sessionStatus: currentStatus,
    participantRole,
    livekitConfigured: config.livekit.isConfigured,
    recordingEnabled: Boolean(session.recording_enabled),
    recordingStatus: session.recording_status,
    permissions: {
      canPublish,
      canSubscribe,
      canPublishData,
      roomAdmin,
    },
  };
}

export async function transitionSessionState(params: {
  sessionId: string;
  actor: User;
  targetStatus: 'live' | 'ended' | 'canceled';
}): Promise<void> {
  const db = getDb();
  const session = db
    .prepare(`SELECT id, instructor_id, room_name, status FROM live_sessions WHERE id = ?`)
    .get(params.sessionId) as
    | { id: string; instructor_id: string; room_name: string; status: string }
    | undefined;

  if (!session) {
    throw Object.assign(new Error('Live session not found.'), { statusCode: 404 });
  }

  const isAuthorized =
    params.actor.role === 'admin' ||
    (params.actor.role === 'instructor' && session.instructor_id === params.actor.id);

  if (!isAuthorized) {
    throw Object.assign(
      new Error('Only the assigned instructor or an administrator can change the session state.'),
      { statusCode: 403 }
    );
  }

  const now = nowIso();
  if (params.targetStatus === 'live') {
    db.prepare(
      `UPDATE live_sessions SET status = 'live', actual_started_at = COALESCE(actual_started_at, ?), updated_at = ? WHERE id = ?`
    ).run(now, now, session.id);
  } else if (params.targetStatus === 'ended') {
    db.prepare(
      `UPDATE live_sessions
       SET status = 'ended',
           actual_ended_at = ?,
           recording_status = CASE WHEN recording_status = 'recording' THEN 'completed' ELSE recording_status END,
           updated_at = ?
       WHERE id = ?`
    ).run(now, now, session.id);

    // Close open attendance records
    db.prepare(
      `UPDATE session_attendance
       SET left_at = ?
       WHERE session_id = ? AND left_at IS NULL`
    ).run(now, session.id);

    // If LiveKit server is configured, close the room on LiveKit server
    if (config.livekit.isConfigured) {
      try {
        const httpUrl = config.livekit.url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
        const roomService = new RoomServiceClient(
          httpUrl,
          config.livekit.apiKey,
          config.livekit.apiSecret
        );
        await roomService.deleteRoom(session.room_name);
      } catch {
        // Non-fatal if room wasn't active on LiveKit server
      }
    }
  } else if (params.targetStatus === 'canceled') {
    db.prepare(
      `UPDATE live_sessions SET status = 'canceled', updated_at = ? WHERE id = ?`
    ).run(now, session.id);
  }

  writeAuditLog({
    actorId: params.actor.id,
    actorRole: params.actor.role,
    action: `live_session.${params.targetStatus}`,
    targetType: 'live_session',
    targetId: session.id,
  });
}

export async function toggleSessionRecording(params: {
  sessionId: string;
  actor: User;
  action: 'start' | 'stop';
}): Promise<{ recordingStatus: string; notice?: string }> {
  const db = getDb();
  const session = db
    .prepare(
      `SELECT id, instructor_id, room_name, recording_enabled, recording_status, egress_id
       FROM live_sessions WHERE id = ?`
    )
    .get(params.sessionId) as
    | {
        id: string;
        instructor_id: string;
        room_name: string;
        recording_enabled: number;
        recording_status: string;
        egress_id: string | null;
      }
    | undefined;

  if (!session) {
    throw Object.assign(new Error('Live session not found.'), { statusCode: 404 });
  }

  const isAuthorized =
    params.actor.role === 'admin' ||
    (params.actor.role === 'instructor' && session.instructor_id === params.actor.id);

  if (!isAuthorized) {
    throw Object.assign(
      new Error('Only the instructor or administrator can control classroom recording.'),
      { statusCode: 403 }
    );
  }

  if (!config.livekit.isConfigured || !config.livekit.egressEnabled) {
    throw Object.assign(
      new Error(
        'Server-side recording requires LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and LIVEKIT_EGRESS_ENABLED=true with a configured LiveKit Egress service.'
      ),
      { statusCode: 400 }
    );
  }

  const httpUrl = config.livekit.url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
  const egressClient = new EgressClient(
    httpUrl,
    config.livekit.apiKey,
    config.livekit.apiSecret
  );

  const now = nowIso();
  if (params.action === 'start') {
    const info = await egressClient.startRoomCompositeEgress(session.room_name, {
      file: {
        filepath: `recordings/${session.room_name}-${Date.now()}.mp4`,
      } as never,
    });
    db.prepare(
      `UPDATE live_sessions SET recording_status = 'recording', egress_id = ?, updated_at = ? WHERE id = ?`
    ).run(info.egressId, now, session.id);
    return { recordingStatus: 'recording' };
  } else {
    if (session.egress_id) {
      await egressClient.stopEgress(session.egress_id);
    }
    db.prepare(
      `UPDATE live_sessions SET recording_status = 'completed', updated_at = ? WHERE id = ?`
    ).run(now, session.id);
    return { recordingStatus: 'completed' };
  }
}

export async function verifyAndProcessLiveKitWebhook(
  rawBody: string,
  authHeader: string | undefined
): Promise<{ handled: boolean; event?: string }> {
  const apiKey = config.livekit.isConfigured
    ? config.livekit.apiKey
    : 'APIKeyDevAetherLMSLocal';
  const apiSecret = config.livekit.isConfigured
    ? config.livekit.apiSecret
    : 'SecretKeyDevAetherLMSLocalMustBeAtLeast32BytesLong!';

  const receiver = new WebhookReceiver(apiKey, apiSecret);
  const event = await receiver.receive(rawBody, authHeader);
  const db = getDb();
  const now = nowIso();

  // Deduplicate webhook by event.id
  if (event.id) {
    const exists = db
      .prepare(`SELECT id FROM payment_events WHERE provider = 'livekit' AND event_id = ?`)
      .get(event.id);
    if (exists) {
      return { handled: true, event: event.event };
    }
    db.prepare(
      `INSERT INTO payment_events (id, provider, event_id, reference, event_type, signature_valid, payload, processed_at)
       VALUES (?, 'livekit', ?, ?, ?, 1, ?, ?)`
    ).run(
      newId('lkev'),
      event.id,
      event.room?.name ?? null,
      event.event || 'unknown',
      rawBody,
      now
    );
  }

  if (event.event === 'room_finished' && event.room?.name) {
    db.prepare(
      `UPDATE live_sessions SET status = 'ended', actual_ended_at = COALESCE(actual_ended_at, ?), updated_at = ?
       WHERE room_name = ? AND status = 'live'`
    ).run(now, now, event.room.name);
  }

  return { handled: true, event: event.event };
}
