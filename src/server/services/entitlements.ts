import type { DatabaseSync } from 'node:sqlite';
import { getDb, newId, nowIso } from '../db/index.js';

export function hasActiveEntitlement(
  userId: string,
  targetType: 'course' | 'resource',
  targetId: string,
  db: DatabaseSync = getDb()
): boolean {
  const row = db
    .prepare(
      `SELECT id, expires_at FROM entitlements
       WHERE user_id = ? AND target_type = ? AND target_id = ? AND status = 'active'`
    )
    .get(userId, targetType, targetId) as { id: string; expires_at: string | null } | undefined;

  if (!row) return false;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare(`UPDATE entitlements SET status = 'expired' WHERE id = ?`).run(row.id);
    return false;
  }
  return true;
}

export function canUserAccessCourse(
  userId: string | undefined,
  userRole: string | undefined,
  courseId: string,
  db: DatabaseSync = getDb()
): boolean {
  if (!userId) return false;
  if (userRole === 'admin') return true;

  const course = db
    .prepare(`SELECT instructor_id FROM courses WHERE id = ?`)
    .get(courseId) as { instructor_id: string } | undefined;
  if (!course) return false;
  if (userRole === 'instructor' && course.instructor_id === userId) return true;

  return hasActiveEntitlement(userId, 'course', courseId, db);
}

export function canUserAccessResource(
  userId: string | undefined,
  userRole: string | undefined,
  resourceId: string,
  db: DatabaseSync = getDb()
): boolean {
  if (!userId) return false;
  if (userRole === 'admin') return true;

  const resource = db
    .prepare(`SELECT author_id, course_id, is_free FROM learning_resources WHERE id = ?`)
    .get(resourceId) as
    | { author_id: string; course_id: string | null; is_free: number }
    | undefined;
  if (!resource) return false;
  if (Boolean(resource.is_free)) return true;
  if (userRole === 'instructor' && resource.author_id === userId) return true;

  if (hasActiveEntitlement(userId, 'resource', resourceId, db)) {
    return true;
  }
  if (resource.course_id && hasActiveEntitlement(userId, 'course', resource.course_id, db)) {
    return true;
  }
  return false;
}

export function grantEntitlement(params: {
  db?: DatabaseSync;
  userId: string;
  targetType: 'course' | 'resource';
  targetId: string;
  source: 'purchase' | 'free_enrollment' | 'admin_grant' | 'bundle';
  orderId?: string | null;
  expiresAt?: string | null;
}): string {
  const db = params.db ?? getDb();
  const now = nowIso();

  const existing = db
    .prepare(
      `SELECT id FROM entitlements WHERE user_id = ? AND target_type = ? AND target_id = ?`
    )
    .get(params.userId, params.targetType, params.targetId) as { id: string } | undefined;

  let entitlementId: string;
  if (existing) {
    entitlementId = existing.id;
    db.prepare(
      `UPDATE entitlements
       SET status = 'active', source = ?, order_id = COALESCE(?, order_id),
           granted_at = ?, expires_at = ?, revoked_at = NULL
       WHERE id = ?`
    ).run(
      params.source,
      params.orderId ?? null,
      now,
      params.expiresAt ?? null,
      entitlementId
    );
  } else {
    entitlementId = newId('ent');
    db.prepare(
      `INSERT INTO entitlements (id, user_id, target_type, target_id, source, order_id, status, granted_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`
    ).run(
      entitlementId,
      params.userId,
      params.targetType,
      params.targetId,
      params.source,
      params.orderId ?? null,
      now,
      params.expiresAt ?? null
    );
  }

  // If granting course entitlement, ensure an active enrollment record exists
  if (params.targetType === 'course') {
    const existingEnroll = db
      .prepare(`SELECT id FROM enrollments WHERE user_id = ? AND course_id = ?`)
      .get(params.userId, params.targetId) as { id: string } | undefined;

    if (existingEnroll) {
      db.prepare(
        `UPDATE enrollments SET status = 'active', entitlement_id = ? WHERE id = ?`
      ).run(entitlementId, existingEnroll.id);
    } else {
      db.prepare(
        `INSERT INTO enrollments (id, user_id, course_id, entitlement_id, status, enrolled_at)
         VALUES (?, ?, ?, ?, 'active', ?)`
      ).run(newId('enr'), params.userId, params.targetId, entitlementId, now);
    }
  }

  return entitlementId;
}

export function grantProductEntitlements(params: {
  db: DatabaseSync;
  userId: string;
  productId: string;
  orderId: string;
}): string[] {
  const { db, userId, productId, orderId } = params;
  const product = db
    .prepare(
      `SELECT id, product_type, target_course_id, target_resource_id FROM products WHERE id = ?`
    )
    .get(productId) as
    | {
        id: string;
        product_type: 'course' | 'resource' | 'bundle';
        target_course_id: string | null;
        target_resource_id: string | null;
      }
    | undefined;

  if (!product) {
    throw new Error(`Product ${productId} not found`);
  }

  const grantedIds: string[] = [];

  if (product.product_type === 'course' && product.target_course_id) {
    grantedIds.push(
      grantEntitlement({
        db,
        userId,
        targetType: 'course',
        targetId: product.target_course_id,
        source: 'purchase',
        orderId,
      })
    );
  } else if (product.product_type === 'resource' && product.target_resource_id) {
    grantedIds.push(
      grantEntitlement({
        db,
        userId,
        targetType: 'resource',
        targetId: product.target_resource_id,
        source: 'purchase',
        orderId,
      })
    );
  } else if (product.product_type === 'bundle') {
    const bundleItems = db
      .prepare(
        `SELECT item_type, course_id, resource_id FROM bundle_items WHERE bundle_product_id = ?`
      )
      .all(product.id) as Array<{
      item_type: 'course' | 'resource';
      course_id: string | null;
      resource_id: string | null;
    }>;

    for (const item of bundleItems) {
      if (item.item_type === 'course' && item.course_id) {
        grantedIds.push(
          grantEntitlement({
            db,
            userId,
            targetType: 'course',
            targetId: item.course_id,
            source: 'bundle',
            orderId,
          })
        );
      } else if (item.item_type === 'resource' && item.resource_id) {
        grantedIds.push(
          grantEntitlement({
            db,
            userId,
            targetType: 'resource',
            targetId: item.resource_id,
            source: 'bundle',
            orderId,
          })
        );
      }
    }
  }

  return grantedIds;
}

export function revokeOrderEntitlements(db: DatabaseSync, orderId: string): void {
  const now = nowIso();
  const entitlements = db
    .prepare(`SELECT id, user_id, target_type, target_id FROM entitlements WHERE order_id = ?`)
    .all(orderId) as Array<{
    id: string;
    user_id: string;
    target_type: 'course' | 'resource';
    target_id: string;
  }>;

  for (const ent of entitlements) {
    db.prepare(`UPDATE entitlements SET status = 'revoked', revoked_at = ? WHERE id = ?`).run(
      now,
      ent.id
    );
    if (ent.target_type === 'course') {
      db.prepare(
        `UPDATE enrollments SET status = 'revoked' WHERE user_id = ? AND course_id = ? AND entitlement_id = ?`
      ).run(ent.user_id, ent.target_id, ent.id);
    }
  }
}
