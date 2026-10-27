import { describe, it, expect, beforeAll } from 'vitest';
import { Duplex } from 'node:stream';
import http from 'node:http';
import { resetTestDb } from '../server/db/index.js';
import { createApp } from '../server/app.js';
import { computePaystackSignature } from '../server/services/payments.js';

process.env.NODE_ENV = 'test';
process.env.TEST_DB_MEMORY = '1';

/**
 * In-memory Express HTTP request dispatcher (executes full Express middleware & route stack
 * without requiring OS TCP loopback port binding).
 */
interface TestResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
  text: string;
}

class MemorySocket extends Duplex {
  public chunks: Buffer[] = [];
  public remoteAddress = '127.0.0.1';
  _read() {}
  _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    callback();
  }
}

function invokeApp(
  app: ReturnType<typeof createApp>,
  method: string,
  url: string,
  options?: {
    headers?: Record<string, string>;
    body?: unknown;
  }
): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const socket = new MemorySocket();
    const req = new http.IncomingMessage(socket as unknown as import('node:net').Socket);
    req.method = method.toUpperCase();
    req.url = url;

    const rawHeaders: Record<string, string> = {};
    if (options?.headers) {
      for (const [k, v] of Object.entries(options.headers)) {
        rawHeaders[k.toLowerCase()] = v;
      }
    }

    let bodyBuffer: Buffer | null = null;
    if (options?.body !== undefined) {
      if (typeof options.body === 'string') {
        bodyBuffer = Buffer.from(options.body, 'utf-8');
        if (!rawHeaders['content-type']) {
          rawHeaders['content-type'] = 'application/json';
        }
      } else {
        bodyBuffer = Buffer.from(JSON.stringify(options.body), 'utf-8');
        rawHeaders['content-type'] = 'application/json';
      }
      rawHeaders['content-length'] = String(bodyBuffer.byteLength);
    }

    req.headers = rawHeaders;

    const res = new http.ServerResponse(req);
    res.assignSocket(socket as unknown as import('node:net').Socket);

    const resBodyChunks: Buffer[] = [];
    const origWrite = res.write.bind(res);
    const origEnd = res.end.bind(res);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    res.write = ((chunk: any, encoding?: any, cb?: any) => {
      if (chunk) {
        resBodyChunks.push(
          Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), encoding)
        );
      }
      return origWrite(chunk, encoding, cb);
    }) as typeof res.write;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    res.end = ((chunk?: any, encoding?: any, cb?: any) => {
      if (chunk && typeof chunk !== 'function') {
        resBodyChunks.push(
          Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), encoding)
        );
      }
      const result = origEnd(chunk, encoding, cb);
      const text = Buffer.concat(resBodyChunks).toString('utf-8');
      let parsedBody: unknown = text;
      try {
        parsedBody = text ? JSON.parse(text) : {};
      } catch {
        // leave as text
      }
      resolve({
        status: res.statusCode,
        headers: res.getHeaders() as Record<string, string | string[] | undefined>,
        body: parsedBody,
        text,
      });
      return result;
    }) as typeof res.end;

    try {
      app(req, res);
      if (bodyBuffer) {
        req.push(bodyBuffer);
      }
      req.push(null);
    } catch (err) {
      reject(err);
    }
  });
}

describe('Aether LMS — End-to-End Security, Payments, Entitlements & LiveKit Suite', () => {
  let app: ReturnType<typeof createApp>;
  let studentToken = '';
  let studentId = '';
  let instructorToken = '';
  let adminToken = '';

  beforeAll(() => {
    resetTestDb();
    app = createApp();
  });

  describe('1. Authentication & Role-Based Access Control', () => {
    it('registers a new student account and returns a signed session token', async () => {
      const res = await invokeApp(app, 'POST', '/api/auth/signup', {
        body: {
          email: 'ama.mensah@test.edu.gh',
          password: 'StrongPassword123!',
          full_name: 'Ama Mensah',
          title: 'Backend Developer',
        },
      });

      expect(res.status).toBe(201);
      expect(res.body.token).toBeTruthy();
      expect(res.body.user.role).toBe('student');
      studentToken = res.body.token;
      studentId = res.body.user.id;
    });

    it('rejects sign-in with invalid password', async () => {
      const res = await invokeApp(app, 'POST', '/api/auth/signin', {
        body: {
          email: 'ama.mensah@test.edu.gh',
          password: 'WrongPassword!',
        },
      });
      expect(res.status).toBe(401);
    });

    it('completes password recovery and allows sign-in with the new password', async () => {
      const forgotRes = await invokeApp(app, 'POST', '/api/auth/forgot-password', {
        body: {
          email: 'ama.mensah@test.edu.gh',
        },
      });
      expect(forgotRes.status).toBe(200);
      expect(forgotRes.body.resetToken).toBeTruthy();

      const resetRes = await invokeApp(app, 'POST', '/api/auth/reset-password', {
        body: {
          token: forgotRes.body.resetToken,
          newPassword: 'UpdatedPassword456!',
        },
      });
      expect(resetRes.status).toBe(200);

      const loginRes = await invokeApp(app, 'POST', '/api/auth/signin', {
        body: {
          email: 'ama.mensah@test.edu.gh',
          password: 'UpdatedPassword456!',
        },
      });
      expect(loginRes.status).toBe(200);
      studentToken = loginRes.body.token;
    });

    it('authenticates seeded instructor and administrator accounts', async () => {
      const instRes = await invokeApp(app, 'POST', '/api/auth/signin', {
        body: {
          email: 'kwame.asante@aetheracademy.edu.gh',
          password: 'Password123!',
        },
      });
      expect(instRes.status).toBe(200);
      expect(instRes.body.user.role).toBe('instructor');
      instructorToken = instRes.body.token;

      const admRes = await invokeApp(app, 'POST', '/api/auth/signin', {
        body: {
          email: 'admin@aetheracademy.edu.gh',
          password: 'Password123!',
        },
      });
      expect(admRes.status).toBe(200);
      expect(admRes.body.user.role).toBe('admin');
      adminToken = admRes.body.token;
    });

    it('enforces role boundaries: blocks students from instructor and admin endpoints', async () => {
      const unauthRes = await invokeApp(app, 'GET', '/api/learning/dashboard');
      expect(unauthRes.status).toBe(401);

      const instBlock = await invokeApp(app, 'GET', '/api/instructor/overview', {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      expect(instBlock.status).toBe(403);

      const adminBlock = await invokeApp(app, 'GET', '/api/admin/overview', {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      expect(adminBlock.status).toBe(403);
    });
  });

  describe('2. Content Management, Free Enrollment & Protected Lessons', () => {
    it('allows an instructor to create a course, modules, lessons, reorder lessons, and upload resources', async () => {
      const courseRes = await invokeApp(app, 'POST', '/api/instructor/courses', {
        headers: { Authorization: `Bearer ${instructorToken}` },
        body: {
          title: 'Zero-Trust API Security in FinTech',
          subtitle: 'Cryptographic tokens, mTLS, and rate limiting',
          description:
            'Deep practical course on securing high-value financial APIs in production.',
          category_id: 'cat_fintech',
          level: 'Advanced',
          is_free: false,
          price_ghs: 500,
          status: 'published',
        },
      });
      expect(courseRes.status).toBe(201);
      const createdCourseId = courseRes.body.courseId;

      const modRes = await invokeApp(
        app,
        'POST',
        `/api/instructor/courses/${createdCourseId}/modules`,
        {
          headers: { Authorization: `Bearer ${instructorToken}` },
          body: { title: 'Module 1: Token Binding' },
        }
      );
      expect(modRes.status).toBe(201);
      const moduleId = modRes.body.moduleId;

      const les1 = await invokeApp(
        app,
        'POST',
        `/api/instructor/courses/${createdCourseId}/lessons`,
        {
          headers: { Authorization: `Bearer ${instructorToken}` },
          body: {
            module_id: moduleId,
            title: 'Lesson A',
            content_type: 'video',
            duration_minutes: 15,
            is_preview: true,
          },
        }
      );
      const les2 = await invokeApp(
        app,
        'POST',
        `/api/instructor/courses/${createdCourseId}/lessons`,
        {
          headers: { Authorization: `Bearer ${instructorToken}` },
          body: {
            module_id: moduleId,
            title: 'Lesson B (Protected)',
            content_type: 'article',
            duration_minutes: 25,
            is_preview: false,
          },
        }
      );
      expect(les1.status).toBe(201);
      expect(les2.status).toBe(201);

      // Reorder lessons
      const reorderRes = await invokeApp(
        app,
        'POST',
        `/api/instructor/courses/${createdCourseId}/reorder`,
        {
          headers: { Authorization: `Bearer ${instructorToken}` },
          body: {
            lessonOrders: [
              { id: les2.body.lessonId, sort_order: 1 },
              { id: les1.body.lessonId, sort_order: 2 },
            ],
          },
        }
      );
      expect(reorderRes.status).toBe(200);

      // Reject unsupported executable file upload
      const badUpload = await invokeApp(app, 'POST', '/api/instructor/resources', {
        headers: { Authorization: `Bearer ${instructorToken}` },
        body: {
          title: 'Malicious Binary',
          description: 'Should be rejected by MIME validator',
          resource_type: 'pdf',
          file_name: 'exploit.exe',
          file_size_bytes: 1024,
          mime_type: 'application/x-msdownload',
          is_free: false,
          price_ghs: 50,
        },
      });
      expect(badUpload.status).toBe(400);

      // Valid PDF resource upload
      const goodUpload = await invokeApp(app, 'POST', '/api/instructor/resources', {
        headers: { Authorization: `Bearer ${instructorToken}` },
        body: {
          title: 'Zero-Trust Audit Checklist PDF',
          description: 'Complete security verification matrix for API gateways.',
          resource_type: 'pdf',
          course_id: createdCourseId,
          file_name: 'zero-trust-checklist.pdf',
          file_size_bytes: 204800,
          mime_type: 'application/pdf',
          is_free: false,
          price_ghs: 90,
        },
      });
      expect(goodUpload.status).toBe(201);
    });

    it('allows free enrollment on free courses and blocks free enrollment on paid courses', async () => {
      const paidAttempt = await invokeApp(app, 'POST', '/api/learning/enroll-free', {
        headers: { Authorization: `Bearer ${studentToken}` },
        body: { courseId: 'crs_fintech_arch' },
      });
      expect(paidAttempt.status).toBe(403);

      const freeEnroll = await invokeApp(app, 'POST', '/api/learning/enroll-free', {
        headers: { Authorization: `Bearer ${studentToken}` },
        body: { courseId: 'crs_webrtc_livekit' },
      });
      expect(freeEnroll.status).toBe(201);
    });

    it('blocks unenrolled students from protected lessons while allowing preview lessons', async () => {
      const previewRes = await invokeApp(
        app,
        'GET',
        '/api/learning/courses/crs_fintech_arch/lessons/les_fin_1_1',
        { headers: { Authorization: `Bearer ${studentToken}` } }
      );
      expect(previewRes.status).toBe(200);

      const lockedRes = await invokeApp(
        app,
        'GET',
        '/api/learning/courses/crs_fintech_arch/lessons/les_fin_1_2',
        { headers: { Authorization: `Bearer ${studentToken}` } }
      );
      expect(lockedRes.status).toBe(403);

      const lockedResource = await invokeApp(
        app,
        'GET',
        '/api/learning/resources/res_fintech_handbook/access',
        { headers: { Authorization: `Bearer ${studentToken}` } }
      );
      expect(lockedResource.status).toBe(403);
    });
  });

  describe('3. Payments, Webhook Verification, Idempotency & Entitlement Lifecycle', () => {
    let paymentReference = '';

    it('creates a pending order with server-calculated price and does NOT grant premature access', async () => {
      const checkoutRes = await invokeApp(app, 'POST', '/api/payments/checkout', {
        headers: { Authorization: `Bearer ${studentToken}` },
        body: {
          productIds: ['prd_bundle_fintech_mastery'],
          provider: 'paystack',
          paymentMethod: 'mtn_momo',
          customerPhone: '+233244999000',
        },
      });

      expect(checkoutRes.status).toBe(201);
      expect(checkoutRes.body.totalAmount).toBe(920);
      paymentReference = checkoutRes.body.reference;

      const stillLocked = await invokeApp(
        app,
        'GET',
        '/api/learning/courses/crs_fintech_arch/lessons/les_fin_1_2',
        { headers: { Authorization: `Bearer ${studentToken}` } }
      );
      expect(stillLocked.status).toBe(403);
    });

    it('rejects webhook events with invalid cryptographic signatures', async () => {
      const payload = JSON.stringify({
        id: 'evt_forged_01',
        event: 'charge.success',
        data: {
          id: 'evt_forged_01',
          reference: paymentReference,
          amount: 92000,
          currency: 'GHS',
        },
      });

      const res = await invokeApp(app, 'POST', '/api/payments/webhook/paystack', {
        headers: {
          'Content-Type': 'application/json',
          'x-paystack-signature': 'deadbeef_invalid_signature',
        },
        body: payload,
      });

      expect(res.status).toBe(401);
    });

    it('rejects valid-signature webhooks when transaction amount does not match order total', async () => {
      const mismatchedPayload = JSON.stringify({
        id: 'evt_underpaid_01',
        event: 'charge.success',
        data: {
          id: 'evt_underpaid_01',
          reference: paymentReference,
          amount: 1000, // Only GHS 10.00 instead of GHS 920.00
          currency: 'GHS',
        },
      });
      const validSig = computePaystackSignature(mismatchedPayload);

      const res = await invokeApp(app, 'POST', '/api/payments/webhook/paystack', {
        headers: {
          'Content-Type': 'application/json',
          'x-paystack-signature': validSig,
        },
        body: mismatchedPayload,
      });

      expect(res.status).toBe(400);
      expect(res.body.status).toBe('rejected');

      const lockedCheck = await invokeApp(
        app,
        'GET',
        '/api/learning/courses/crs_fintech_arch/lessons/les_fin_1_2',
        { headers: { Authorization: `Bearer ${studentToken}` } }
      );
      expect(lockedCheck.status).toBe(403);
    });

    it('processes a verified Paystack webhook, grants bundle entitlements, and handles duplicate webhooks idempotently', async () => {
      const checkout2 = await invokeApp(app, 'POST', '/api/payments/checkout', {
        headers: { Authorization: `Bearer ${studentToken}` },
        body: {
          productIds: ['prd_bundle_fintech_mastery'],
          provider: 'paystack',
          paymentMethod: 'mtn_momo',
        },
      });
      paymentReference = checkout2.body.reference;

      const validPayload = JSON.stringify({
        id: 'evt_verified_9901',
        event: 'charge.success',
        data: {
          id: 'evt_verified_9901',
          reference: paymentReference,
          amount: 92000, // 920.00 GHS in pesewas
          currency: 'GHS',
          channel: 'mobile_money',
        },
      });
      const validSig = computePaystackSignature(validPayload);

      const webhookRes = await invokeApp(app, 'POST', '/api/payments/webhook/paystack', {
        headers: {
          'Content-Type': 'application/json',
          'x-paystack-signature': validSig,
        },
        body: validPayload,
      });

      expect(webhookRes.status).toBe(200);
      expect(webhookRes.body.status).toBe('processed');
      expect(webhookRes.body.orderStatus).toBe('paid');

      // Replay exact same webhook event -> must return 'duplicate' idempotently
      const duplicateRes = await invokeApp(
        app,
        'POST',
        '/api/payments/webhook/paystack',
        {
          headers: {
            'Content-Type': 'application/json',
            'x-paystack-signature': validSig,
          },
          body: validPayload,
        }
      );

      expect(duplicateRes.status).toBe(200);
      expect(duplicateRes.body.status).toBe('duplicate');

      // Student can now access both the protected course lesson AND the bundled handbook resource
      const unlockedLesson = await invokeApp(
        app,
        'GET',
        '/api/learning/courses/crs_fintech_arch/lessons/les_fin_1_2',
        { headers: { Authorization: `Bearer ${studentToken}` } }
      );
      expect(unlockedLesson.status).toBe(200);

      const unlockedResource = await invokeApp(
        app,
        'GET',
        '/api/learning/resources/res_fintech_handbook/access',
        { headers: { Authorization: `Bearer ${studentToken}` } }
      );
      expect(unlockedResource.status).toBe(200);
      expect(unlockedResource.body.signedDownloadUrl).toContain('/api/media/stream/');

      // Persist lesson progress and verify it is saved
      const progRes = await invokeApp(
        app,
        'POST',
        '/api/learning/lessons/les_fin_1_2/progress',
        {
          headers: { Authorization: `Bearer ${studentToken}` },
          body: { completed: true, playback_position_sec: 480 },
        }
      );
      expect(progRes.status).toBe(200);
      expect(progRes.body.completed).toBe(true);
    });
  });

  describe('4. LiveKit Classroom Authorization & Session State Machine', () => {
    it('allows an enrolled student to join the course LiveKit classroom with student permissions', async () => {
      const joinRes = await invokeApp(
        app,
        'POST',
        '/api/livekit/sessions/ses_live_01/join',
        { headers: { Authorization: `Bearer ${studentToken}` } }
      );

      expect(joinRes.status).toBe(200);
      expect(joinRes.body.token).toBeTruthy();
      expect(joinRes.body.participantRole).toBe('student');
      expect(joinRes.body.permissions.roomAdmin).toBe(false);
    });

    it('rejects an unenrolled student from joining a restricted course classroom', async () => {
      const joinRestricted = await invokeApp(
        app,
        'POST',
        '/api/livekit/sessions/ses_sched_03/join',
        { headers: { Authorization: `Bearer ${studentToken}` } }
      );

      expect(joinRestricted.status).toBe(403);
    });

    it('grants instructor roomAdmin privileges and prevents students from ending a session', async () => {
      const instJoin = await invokeApp(
        app,
        'POST',
        '/api/livekit/sessions/ses_live_01/join',
        { headers: { Authorization: `Bearer ${instructorToken}` } }
      );

      expect(instJoin.status).toBe(200);
      expect(instJoin.body.participantRole).toBe('instructor');
      expect(instJoin.body.permissions.roomAdmin).toBe(true);

      const studentEndAttempt = await invokeApp(
        app,
        'POST',
        '/api/livekit/sessions/ses_live_01/state',
        {
          headers: { Authorization: `Bearer ${studentToken}` },
          body: { status: 'ended' },
        }
      );
      expect(studentEndAttempt.status).toBe(403);

      const studentLeave = await invokeApp(
        app,
        'POST',
        '/api/livekit/sessions/ses_live_01/leave',
        { headers: { Authorization: `Bearer ${studentToken}` } }
      );
      expect(studentLeave.status).toBe(200);
    });
  });

  describe('5. Administrative Refund & Entitlement Revocation', () => {
    it('revokes student entitlements when an order is refunded by an administrator', async () => {
      const ordersRes = await invokeApp(app, 'GET', '/api/payments/orders', {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      const paidOrder = ordersRes.body.orders.find(
        (o: { status: string }) => o.status === 'paid'
      );
      expect(paidOrder).toBeTruthy();

      const refundRes = await invokeApp(
        app,
        'POST',
        `/api/admin/orders/${paidOrder.id}/refund`,
        {
          headers: { Authorization: `Bearer ${adminToken}` },
          body: { reason: 'Customer requested full refund' },
        }
      );
      expect(refundRes.status).toBe(200);

      // Protected lesson is now locked again!
      const lockedAfterRefund = await invokeApp(
        app,
        'GET',
        '/api/learning/courses/crs_fintech_arch/lessons/les_fin_1_2',
        { headers: { Authorization: `Bearer ${studentToken}` } }
      );
      expect(lockedAfterRefund.status).toBe(403);

      // Admin grants explicit administrative entitlement
      const grantRes = await invokeApp(app, 'POST', '/api/admin/entitlements/grant', {
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          userId: studentId,
          targetType: 'course',
          targetId: 'crs_fintech_arch',
        },
      });
      expect(grantRes.status).toBe(201);

      const unlockedAgain = await invokeApp(
        app,
        'GET',
        '/api/learning/courses/crs_fintech_arch/lessons/les_fin_1_2',
        { headers: { Authorization: `Bearer ${studentToken}` } }
      );
      expect(unlockedAgain.status).toBe(200);
    });
  });
});
