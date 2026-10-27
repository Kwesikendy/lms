import crypto from 'node:crypto';
import { config } from '../config.js';
import { getDb, newId, nowIso, withTransaction, writeAuditLog } from '../db/index.js';
import { grantProductEntitlements, revokeOrderEntitlements } from './entitlements.js';

export function computePaystackSignature(rawBody: string, secret = config.paystack.webhookSecret): string {
  return crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
}

export function verifyPaystackSignature(rawBody: string, signatureHeader: string | undefined): boolean {
  if (!signatureHeader) return false;
  try {
    const expected = computePaystackSignature(rawBody);
    const sigBuf = Buffer.from(signatureHeader.trim());
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

export function computeHubtelSignature(rawBody: string, secret = config.hubtel.webhookSecret): string {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

export function verifyHubtelSignature(rawBody: string, signatureHeader: string | undefined): boolean {
  if (!signatureHeader) return false;
  try {
    const expected = computeHubtelSignature(rawBody);
    const sigBuf = Buffer.from(signatureHeader.trim());
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

export interface InitiateOrderInput {
  userId: string;
  userEmail: string;
  productIds: string[];
  provider: 'paystack' | 'hubtel';
  paymentMethod?: string;
  customerPhone?: string;
}

export async function createOrderAndInitiatePayment(input: InitiateOrderInput) {
  if (!input.productIds.length) {
    throw new Error('At least one product is required to create an order.');
  }

  const orderData = withTransaction((db) => {
    const uniqueIds = Array.from(new Set(input.productIds));
    const products: Array<{
      id: string;
      sku: string;
      title: string;
      product_type: string;
      price_ghs: number;
      currency: string;
      active: number;
    }> = [];

    for (const pid of uniqueIds) {
      const p = db
        .prepare(
          `SELECT id, sku, title, product_type, price_ghs, currency, active FROM products WHERE id = ?`
        )
        .get(pid) as (typeof products)[number] | undefined;
      if (!p || !p.active) {
        throw new Error(`Selected product (${pid}) is unavailable.`);
      }
      products.push(p);
    }

    const totalAmount = Number(
      products.reduce((sum, item) => sum + Number(item.price_ghs), 0).toFixed(2)
    );
    if (totalAmount <= 0) {
      throw new Error('Free products should be enrolled directly without payment initiation.');
    }

    const now = nowIso();
    const orderId = newId('ord');
    const orderNumber = `AET-${Date.now().toString(36).toUpperCase()}-${crypto
      .randomBytes(2)
      .toString('hex')
      .toUpperCase()}`;
    const reference = `REF_${input.provider.toUpperCase()}_${crypto
      .randomUUID()
      .replace(/-/g, '')
      .slice(0, 18)}`;

    db.prepare(
      `INSERT INTO orders (
         id, order_number, user_id, subtotal_amount, total_amount, currency,
         status, payment_provider, payment_method, customer_phone, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, 'GHS', 'pending', ?, ?, ?, ?, ?)`
    ).run(
      orderId,
      orderNumber,
      input.userId,
      totalAmount,
      totalAmount,
      input.provider,
      input.paymentMethod ?? 'mobile_money',
      input.customerPhone ?? null,
      now,
      now
    );

    for (const p of products) {
      db.prepare(
        `INSERT INTO order_items (id, order_id, product_id, title_snapshot, unit_price, currency)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(newId('item'), orderId, p.id, p.title, p.price_ghs, p.currency || 'GHS');
    }

    const attemptId = newId('att');
    const callbackUrl = `${config.appBaseUrl}/checkout/result?orderId=${encodeURIComponent(orderId)}&reference=${encodeURIComponent(reference)}`;

    db.prepare(
      `INSERT INTO payment_attempts (
         id, order_id, provider, reference, amount, currency, channel,
         status, authorization_url, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, 'GHS', ?, 'pending', ?, ?, ?)`
    ).run(
      attemptId,
      orderId,
      input.provider,
      reference,
      totalAmount,
      input.paymentMethod ?? 'mobile_money',
      callbackUrl,
      now,
      now
    );

    return {
      orderId,
      orderNumber,
      attemptId,
      reference,
      totalAmount,
      currency: 'GHS',
      provider: input.provider,
      callbackUrl,
      products,
    };
  });

  // If external provider credentials are configured, call the live provider API
  if (input.provider === 'paystack' && config.paystack.isConfigured) {
    try {
      const response = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.paystack.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: input.userEmail,
          amount: Math.round(orderData.totalAmount * 100), // Pesewas
          currency: 'GHS',
          reference: orderData.reference,
          callback_url: orderData.callbackUrl,
          channels: ['mobile_money', 'card', 'bank_transfer'],
          metadata: {
            order_id: orderData.orderId,
            order_number: orderData.orderNumber,
            user_id: input.userId,
          },
        }),
      });
      const json = (await response.json()) as {
        status?: boolean;
        data?: { authorization_url?: string };
      };
      if (json.status && json.data?.authorization_url) {
        const db = getDb();
        db.prepare(
          `UPDATE payment_attempts SET authorization_url = ?, provider_response = ?, updated_at = ? WHERE id = ?`
        ).run(
          json.data.authorization_url,
          JSON.stringify(json),
          nowIso(),
          orderData.attemptId
        );
        return {
          ...orderData,
          authorizationUrl: json.data.authorization_url,
          providerLive: true,
        };
      }
    } catch (err) {
      // Preserve pending order and report provider network failure
      throw new Error(
        `Paystack initialization error: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  }

  if (input.provider === 'hubtel' && config.hubtel.isConfigured) {
    try {
      const basicAuth = Buffer.from(
        `${config.hubtel.clientId}:${config.hubtel.clientSecret}`
      ).toString('base64');
      const response = await fetch('https://payproxyapi.hubtel.com/items/initiate', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          totalAmount: orderData.totalAmount,
          description: `Aether LMS Order ${orderData.orderNumber}`,
          callbackUrl: `${config.appBaseUrl}/api/payments/webhook/hubtel`,
          returnUrl: orderData.callbackUrl,
          merchantAccountNumber: config.hubtel.merchantAccount,
          cancellationUrl: orderData.callbackUrl,
          clientReference: orderData.reference,
        }),
      });
      const json = (await response.json()) as {
        responseCode?: string;
        data?: { checkoutUrl?: string };
      };
      if (json.data?.checkoutUrl) {
        const db = getDb();
        db.prepare(
          `UPDATE payment_attempts SET authorization_url = ?, provider_response = ?, updated_at = ? WHERE id = ?`
        ).run(json.data.checkoutUrl, JSON.stringify(json), nowIso(), orderData.attemptId);
        return {
          ...orderData,
          authorizationUrl: json.data.checkoutUrl,
          providerLive: true,
        };
      }
    } catch (err) {
      throw new Error(
        `Hubtel initialization error: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  }

  return {
    ...orderData,
    authorizationUrl: orderData.callbackUrl,
    providerLive: false,
    credentialNotice:
      input.provider === 'paystack'
        ? 'PAYSTACK_SECRET_KEY is not configured in .env. Order is persisted in PENDING state awaiting a verified webhook event.'
        : 'HUBTEL credentials are not configured in .env. Order is persisted in PENDING state awaiting a verified webhook event.',
  };
}

export interface ProcessWebhookInput {
  provider: 'paystack' | 'hubtel';
  eventId: string;
  eventType: string;
  reference: string;
  amountGhs: number;
  currency: string;
  channel?: string;
  rawPayload: string;
  signatureValid: boolean;
}

export function processVerifiedPaymentWebhook(input: ProcessWebhookInput): {
  status: 'processed' | 'duplicate' | 'rejected';
  reason?: string;
  orderId?: string;
  orderStatus?: string;
} {
  if (!input.signatureValid) {
    return { status: 'rejected', reason: 'Invalid webhook cryptographic signature.' };
  }

  return withTransaction((db) => {
    // 1. Idempotency check: has this provider + event_id already been processed?
    const existingEvent = db
      .prepare(`SELECT id FROM payment_events WHERE provider = ? AND event_id = ?`)
      .get(input.provider, input.eventId) as { id: string } | undefined;

    if (existingEvent) {
      return {
        status: 'duplicate',
        reason: `Webhook event ${input.eventId} already processed.`,
      };
    }

    const now = nowIso();
    db.prepare(
      `INSERT INTO payment_events (id, provider, event_id, reference, event_type, signature_valid, payload, processed_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
    ).run(
      newId('pev'),
      input.provider,
      input.eventId,
      input.reference,
      input.eventType,
      input.rawPayload,
      now
    );

    // 2. Locate payment attempt & order
    const attempt = db
      .prepare(
        `SELECT id, order_id, amount, currency, status FROM payment_attempts WHERE reference = ?`
      )
      .get(input.reference) as
      | {
          id: string;
          order_id: string;
          amount: number;
          currency: string;
          status: string;
        }
      | undefined;

    if (!attempt) {
      return {
        status: 'rejected',
        reason: `Payment reference ${input.reference} does not match any recorded attempt.`,
      };
    }

    const order = db
      .prepare(
        `SELECT id, user_id, total_amount, currency, status FROM orders WHERE id = ?`
      )
      .get(attempt.order_id) as
      | {
          id: string;
          user_id: string;
          total_amount: number;
          currency: string;
          status: string;
        }
      | undefined;

    if (!order) {
      return { status: 'rejected', reason: 'Associated order record not found.' };
    }

    // 3. Validate currency and amount against the original order
    if (
      input.currency.toUpperCase() !== order.currency.toUpperCase() ||
      Math.abs(Number(input.amountGhs) - Number(order.total_amount)) > 0.01
    ) {
      db.prepare(
        `UPDATE payment_attempts SET status = 'failed', provider_response = ?, updated_at = ? WHERE id = ?`
      ).run(input.rawPayload, now, attempt.id);
      db.prepare(`UPDATE orders SET status = 'failed', updated_at = ? WHERE id = ?`).run(
        now,
        order.id
      );
      return {
        status: 'rejected',
        reason: `Transaction amount (${input.amountGhs} ${input.currency}) does not match order total (${order.total_amount} ${order.currency}).`,
      };
    }

    // 4. Transition states based on eventType
    const normalizedType = input.eventType.toLowerCase();
    if (
      normalizedType === 'charge.success' ||
      normalizedType === 'payment.success' ||
      normalizedType === 'success'
    ) {
      // Idempotent guard if order is already paid
      if (order.status === 'paid') {
        return {
          status: 'duplicate',
          orderId: order.id,
          orderStatus: 'paid',
          reason: 'Order already marked paid.',
        };
      }

      db.prepare(
        `UPDATE payment_attempts
         SET status = 'successful', channel = COALESCE(?, channel),
             provider_response = ?, verified_at = ?, updated_at = ?
         WHERE id = ?`
      ).run(input.channel ?? null, input.rawPayload, now, now, attempt.id);

      db.prepare(
        `UPDATE orders
         SET status = 'paid', payment_method = COALESCE(?, payment_method),
             paid_at = ?, updated_at = ?
         WHERE id = ?`
      ).run(input.channel ?? null, now, now, order.id);

      // Grant entitlements for every product in order_items
      const items = db
        .prepare(`SELECT product_id FROM order_items WHERE order_id = ?`)
        .all(order.id) as Array<{ product_id: string }>;

      for (const item of items) {
        grantProductEntitlements({
          db,
          userId: order.user_id,
          productId: item.product_id,
          orderId: order.id,
        });
      }

      db.prepare(
        `INSERT INTO notifications (id, user_id, title, message, link, is_read, created_at)
         VALUES (?, ?, ?, ?, ?, 0, ?)`
      ).run(
        newId('ntf'),
        order.user_id,
        'Payment Confirmed & Access Unlocked',
        `Your payment of ${order.currency} ${order.total_amount.toFixed(2)} has been verified. Your learning materials are now unlocked.`,
        '/student/learning',
        now
      );

      return { status: 'processed', orderId: order.id, orderStatus: 'paid' };
    }

    if (
      normalizedType === 'charge.failed' ||
      normalizedType === 'payment.failed' ||
      normalizedType === 'failed'
    ) {
      db.prepare(
        `UPDATE payment_attempts SET status = 'failed', provider_response = ?, updated_at = ? WHERE id = ?`
      ).run(input.rawPayload, now, attempt.id);
      if (order.status === 'pending') {
        db.prepare(`UPDATE orders SET status = 'failed', updated_at = ? WHERE id = ?`).run(
          now,
          order.id
        );
      }
      return { status: 'processed', orderId: order.id, orderStatus: 'failed' };
    }

    if (normalizedType === 'refund.processed' || normalizedType === 'refunded') {
      db.prepare(
        `UPDATE payment_attempts SET status = 'refunded', updated_at = ? WHERE id = ?`
      ).run(now, attempt.id);
      db.prepare(
        `UPDATE orders SET status = 'refunded', refunded_at = ?, updated_at = ? WHERE id = ?`
      ).run(now, now, order.id);
      revokeOrderEntitlements(db, order.id);
      return { status: 'processed', orderId: order.id, orderStatus: 'refunded' };
    }

    return { status: 'processed', orderId: order.id, orderStatus: order.status };
  });
}

export function refundOrderByAdmin(params: {
  orderId: string;
  adminId: string;
  reason: string;
  partialAmount?: number;
}): void {
  withTransaction((db) => {
    const order = db
      .prepare(`SELECT id, user_id, total_amount, status FROM orders WHERE id = ?`)
      .get(params.orderId) as
      | { id: string; user_id: string; total_amount: number; status: string }
      | undefined;

    if (!order) {
      throw new Error('Order not found.');
    }
    if (order.status !== 'paid' && order.status !== 'partially_refunded') {
      throw new Error(`Cannot refund an order in "${order.status}" state.`);
    }

    const now = nowIso();
    const isPartial =
      params.partialAmount !== undefined &&
      params.partialAmount > 0 &&
      params.partialAmount < order.total_amount;
    const nextStatus = isPartial ? 'partially_refunded' : 'refunded';

    db.prepare(
      `UPDATE orders
       SET status = ?, refunded_at = ?, refund_reason = ?, updated_at = ?
       WHERE id = ?`
    ).run(nextStatus, now, params.reason, now, order.id);

    db.prepare(
      `UPDATE payment_attempts SET status = 'refunded', updated_at = ? WHERE order_id = ?`
    ).run(now, order.id);

    // Revoke entitlements on full refund
    if (!isPartial) {
      revokeOrderEntitlements(db, order.id);
    }
  });

  writeAuditLog({
    actorId: params.adminId,
    actorRole: 'admin',
    action: 'order.refund',
    targetType: 'order',
    targetId: params.orderId,
    metadata: { reason: params.reason, partialAmount: params.partialAmount },
  });
}
