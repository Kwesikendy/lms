import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import {
  createOrderAndInitiatePayment,
  processVerifiedPaymentWebhook,
  verifyPaystackSignature,
  verifyHubtelSignature,
  computePaystackSignature,
  computeHubtelSignature,
} from '../services/payments.js';

export const paymentsRouter = Router();

const checkoutSchema = z.object({
  productIds: z.array(z.string().min(1)).min(1, 'Select at least one product.'),
  provider: z.enum(['paystack', 'hubtel']).default('paystack'),
  paymentMethod: z
    .enum(['mtn_momo', 'telecel_cash', 'airteltigo_money', 'card', 'bank_transfer'])
    .default('mtn_momo'),
  customerPhone: z.string().max(32).optional(),
});

paymentsRouter.post('/checkout', requireAuth, async (req, res) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid checkout request.',
    });
    return;
  }

  try {
    const result = await createOrderAndInitiatePayment({
      userId: req.user!.id,
      userEmail: req.user!.email,
      productIds: parsed.data.productIds,
      provider: parsed.data.provider,
      paymentMethod: parsed.data.paymentMethod,
      customerPhone: parsed.data.customerPhone,
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Unable to initiate order.',
    });
  }
});

paymentsRouter.get('/orders', requireAuth, (req, res) => {
  const db = getDb();
  const orders = db
    .prepare(
      `SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC`
    )
    .all(req.user!.id) as Array<Record<string, unknown>>;

  const enriched = orders.map((o) => {
    const items = db
      .prepare(`SELECT * FROM order_items WHERE order_id = ?`)
      .all(String(o.id));
    const attempts = db
      .prepare(
        `SELECT id, provider, reference, amount, currency, channel, status, verified_at, created_at
         FROM payment_attempts WHERE order_id = ? ORDER BY created_at DESC`
      )
      .all(String(o.id));
    return {
      ...o,
      items,
      attempts,
    };
  });

  res.json({ orders: enriched });
});

// Server-side order status lookup (never trusts browser query parameter status)
paymentsRouter.get('/orders/:orderId', requireAuth, (req, res) => {
  const db = getDb();
  const orderIdParam = String(req.params.orderId);
  const order = db
    .prepare(`SELECT * FROM orders WHERE id = ? OR order_number = ?`)
    .get(orderIdParam, orderIdParam) as Record<string, unknown> | undefined;

  if (!order) {
    res.status(404).json({ error: 'Order not found.' });
    return;
  }

  if (req.user!.role !== 'admin' && order.user_id !== req.user!.id) {
    res.status(403).json({ error: 'Not authorized to view this order.' });
    return;
  }

  const items = db
    .prepare(`SELECT * FROM order_items WHERE order_id = ?`)
    .all(String(order.id));
  const attempts = db
    .prepare(
      `SELECT id, provider, reference, amount, currency, channel, status, verified_at, created_at
       FROM payment_attempts WHERE order_id = ? ORDER BY created_at DESC`
    )
    .all(String(order.id));
  const entitlements = db
    .prepare(
      `SELECT id, target_type, target_id, source, status, granted_at
       FROM entitlements WHERE order_id = ?`
    )
    .all(String(order.id));

  res.json({
    order: {
      ...order,
      items,
      attempts,
      entitlements,
    },
  });
});

// Paystack Webhook Endpoint (Verifies HMAC-SHA512 signature on raw body)
paymentsRouter.post('/webhook/paystack', (req, res) => {
  const signature = req.headers['x-paystack-signature'] as string | undefined;
  const rawBody =
    typeof (req as unknown as { rawBody?: string }).rawBody === 'string'
      ? (req as unknown as { rawBody: string }).rawBody
      : JSON.stringify(req.body);

  const signatureValid = verifyPaystackSignature(rawBody, signature);
  if (!signatureValid) {
    res.status(401).json({ error: 'Invalid Paystack webhook signature.' });
    return;
  }

  const body = req.body as {
    id?: string | number;
    event?: string;
    data?: {
      id?: string | number;
      reference?: string;
      amount?: number;
      currency?: string;
      channel?: string;
    };
  };

  const eventType = String(body.event || 'unknown');
  const reference = String(body.data?.reference || '');
  const eventId = String(body.id || body.data?.id || `${eventType}:${reference}`);
  // Paystack sends amount in minor units (pesewas)
  const amountGhs = Number(body.data?.amount || 0) / 100;
  const currency = String(body.data?.currency || 'GHS');

  const result = processVerifiedPaymentWebhook({
    provider: 'paystack',
    eventId,
    eventType,
    reference,
    amountGhs,
    currency,
    channel: body.data?.channel,
    rawPayload: rawBody,
    signatureValid: true,
  });

  if (result.status === 'rejected') {
    res.status(400).json(result);
    return;
  }

  res.status(200).json(result);
});

// Hubtel Webhook Endpoint (Verifies HMAC-SHA256 signature)
paymentsRouter.post('/webhook/hubtel', (req, res) => {
  const signature = req.headers['x-hubtel-signature'] as string | undefined;
  const rawBody =
    typeof (req as unknown as { rawBody?: string }).rawBody === 'string'
      ? (req as unknown as { rawBody: string }).rawBody
      : JSON.stringify(req.body);

  const signatureValid = verifyHubtelSignature(rawBody, signature);
  if (!signatureValid) {
    res.status(401).json({ error: 'Invalid Hubtel webhook signature.' });
    return;
  }

  const body = req.body as {
    EventId?: string;
    ResponseCode?: string;
    Status?: string;
    Data?: {
      CheckoutId?: string;
      ClientReference?: string;
      Amount?: number;
      PaymentType?: string;
    };
  };

  const reference = String(body.Data?.ClientReference || '');
  const eventId = String(
    body.EventId || body.Data?.CheckoutId || `hubtel:${reference}`
  );
  const eventType =
    body.ResponseCode === '0000' || body.Status === 'Success'
      ? 'payment.success'
      : 'payment.failed';
  const amountGhs = Number(body.Data?.Amount || 0);

  const result = processVerifiedPaymentWebhook({
    provider: 'hubtel',
    eventId,
    eventType,
    reference,
    amountGhs,
    currency: 'GHS',
    channel: body.Data?.PaymentType || 'mobile_money',
    rawPayload: rawBody,
    signatureValid: true,
  });

  if (result.status === 'rejected') {
    res.status(400).json(result);
    return;
  }

  res.status(200).json(result);
});

// Sandbox Webhook Dispatcher for testing verified webhook flows when external provider credentials are not configured
paymentsRouter.post('/sandbox/dispatch-signed-webhook', requireAuth, (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    res.status(403).json({
      error: 'Sandbox webhook dispatcher is disabled in production.',
    });
    return;
  }

  const schema = z.object({
    orderId: z.string().min(1),
    outcome: z.enum(['success', 'failed']).default('success'),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid orderId is required.' });
    return;
  }

  const db = getDb();
  const order = db
    .prepare(`SELECT * FROM orders WHERE id = ?`)
    .get(parsed.data.orderId) as
    | { id: string; user_id: string; total_amount: number; currency: string; payment_provider: 'paystack' | 'hubtel' }
    | undefined;

  if (!order) {
    res.status(404).json({ error: 'Order not found.' });
    return;
  }

  if (req.user!.role !== 'admin' && order.user_id !== req.user!.id) {
    res.status(403).json({ error: 'Not authorized for this order.' });
    return;
  }

  const attempt = db
    .prepare(
      `SELECT reference, provider, channel FROM payment_attempts WHERE order_id = ? ORDER BY created_at DESC LIMIT 1`
    )
    .get(order.id) as { reference: string; provider: 'paystack' | 'hubtel'; channel: string } | undefined;

  if (!attempt) {
    res.status(400).json({ error: 'No payment attempt found for this order.' });
    return;
  }

  const eventId = `evt_sandbox_${attempt.reference}_${parsed.data.outcome}`;
  const payloadObj =
    attempt.provider === 'paystack'
      ? {
          id: eventId,
          event: parsed.data.outcome === 'success' ? 'charge.success' : 'charge.failed',
          data: {
            id: eventId,
            reference: attempt.reference,
            amount: Math.round(order.total_amount * 100),
            currency: order.currency,
            channel: attempt.channel || 'mobile_money',
          },
        }
      : {
          EventId: eventId,
          ResponseCode: parsed.data.outcome === 'success' ? '0000' : '2001',
          Status: parsed.data.outcome === 'success' ? 'Success' : 'Failed',
          Data: {
            CheckoutId: eventId,
            ClientReference: attempt.reference,
            Amount: order.total_amount,
            PaymentType: attempt.channel || 'mobile_money',
          },
        };

  const rawPayload = JSON.stringify(payloadObj);
  const signature =
    attempt.provider === 'paystack'
      ? computePaystackSignature(rawPayload)
      : computeHubtelSignature(rawPayload);

  const signatureValid =
    attempt.provider === 'paystack'
      ? verifyPaystackSignature(rawPayload, signature)
      : verifyHubtelSignature(rawPayload, signature);

  const result = processVerifiedPaymentWebhook({
    provider: attempt.provider,
    eventId,
    eventType: parsed.data.outcome === 'success' ? 'charge.success' : 'charge.failed',
    reference: attempt.reference,
    amountGhs: order.total_amount,
    currency: order.currency,
    channel: attempt.channel || 'mobile_money',
    rawPayload,
    signatureValid,
  });

  res.json(result);
});
