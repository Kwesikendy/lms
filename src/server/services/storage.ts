import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/epub+zip',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/mp4',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'text/plain',
  'text/markdown',
]);

const MAX_FILE_SIZE_BYTES = 250 * 1024 * 1024; // 250 MB

export function validateUploadMetadata(params: {
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
}): { valid: boolean; error?: string } {
  if (!params.fileName || params.fileName.trim().length < 2) {
    return { valid: false, error: 'File name is required.' };
  }
  if (params.fileName.includes('..') || /[<>:"|?*]/.test(params.fileName)) {
    return { valid: false, error: 'File name contains invalid path characters.' };
  }
  if (!ALLOWED_MIME_TYPES.has(params.mimeType)) {
    return {
      valid: false,
      error: `Unsupported file type "${params.mimeType}". Allowed: PDF, EPUB, MP4, WebM, MP3, PPTX, ZIP, Markdown.`,
    };
  }
  if (params.fileSizeBytes <= 0 || params.fileSizeBytes > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File size must be between 1 byte and 250 MB.`,
    };
  }
  return { valid: true };
}

export function createSignedMediaUrl(params: {
  targetType: 'resource' | 'lesson' | 'recording';
  targetId: string;
  userId: string;
  disposition?: 'inline' | 'attachment';
  ttlSeconds?: number;
}): { url: string; expiresAt: string } {
  const ttl = params.ttlSeconds ?? 900; // 15 minutes default
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const disposition = params.disposition ?? 'inline';
  const payload = `${params.targetType}:${params.targetId}:${params.userId}:${disposition}:${exp}`;
  const sig = crypto
    .createHmac('sha256', config.mediaSigningSecret)
    .update(payload)
    .digest('base64url');

  const query = new URLSearchParams({
    u: params.userId,
    d: disposition,
    exp: String(exp),
    sig,
  });

  return {
    url: `/api/media/stream/${params.targetType}/${params.targetId}?${query.toString()}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

export function verifySignedMediaParams(params: {
  targetType: string;
  targetId: string;
  userId: string;
  disposition: string;
  exp: number;
  sig: string;
}): boolean {
  try {
    const now = Math.floor(Date.now() / 1000);
    if (!params.exp || params.exp < now) return false;
    const payload = `${params.targetType}:${params.targetId}:${params.userId}:${params.disposition}:${params.exp}`;
    const expectedSig = crypto
      .createHmac('sha256', config.mediaSigningSecret)
      .update(payload)
      .digest('base64url');
    const sigBuf = Buffer.from(params.sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

export function storePrivateObject(
  fileKey: string,
  content: Buffer | string
): { storedPath: string; sizeBytes: number } {
  try {
    const safeKey = fileKey.replace(/[^a-zA-Z0-9._/-]/g, '_').replace(/\.\./g, '');
    const fullPath = path.resolve(config.storage.localDir, safeKey);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const buf = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
    fs.writeFileSync(fullPath, buf);
    return { storedPath: fullPath, sizeBytes: buf.byteLength };
  } catch (err) {
    console.warn('[storePrivateObject warning]:', err);
    return { storedPath: fileKey, sizeBytes: 0 };
  }
}
