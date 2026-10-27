import path from 'node:path';

function isConfiguredSecret(val: string | undefined): boolean {
  if (!val) return false;
  const trimmed = val.trim();
  if (!trimmed) return false;
  if (trimmed.includes('placeholder') || trimmed.startsWith('replace_with_')) return false;
  return true;
}

export const config = {
  port: Number(process.env.PORT || 3001),
  nodeEnv: process.env.NODE_ENV || 'development',
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:3001',
  sessionSecret:
    process.env.SESSION_SECRET ||
    'aether_dev_session_secret_do_not_use_in_production_9f8e7d6c5b4a3210',
  mediaSigningSecret:
    process.env.MEDIA_SIGNING_SECRET ||
    'aether_dev_media_signing_secret_change_in_prod_1234567890abcdef',
  sqliteDbPath:
    process.env.SQLITE_DB_PATH || path.resolve(process.cwd(), 'data', 'lms.sqlite'),
  databaseUrl: process.env.DATABASE_URL || '',

  livekit: {
    url: process.env.LIVEKIT_URL || '',
    apiKey: process.env.LIVEKIT_API_KEY || '',
    apiSecret: process.env.LIVEKIT_API_SECRET || '',
    egressEnabled: process.env.LIVEKIT_EGRESS_ENABLED === 'true',
    get isConfigured(): boolean {
      return (
        isConfiguredSecret(this.url) &&
        isConfiguredSecret(this.apiKey) &&
        isConfiguredSecret(this.apiSecret) &&
        !this.url.includes('your-project.livekit.cloud')
      );
    },
  },

  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY || '',
    publicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
    webhookSecret:
      process.env.PAYSTACK_WEBHOOK_SECRET ||
      process.env.PAYSTACK_SECRET_KEY ||
      'paystack_test_webhook_secret_key',
    get isConfigured(): boolean {
      return isConfiguredSecret(this.secretKey);
    },
  },

  hubtel: {
    clientId: process.env.HUBTEL_CLIENT_ID || '',
    clientSecret: process.env.HUBTEL_CLIENT_SECRET || '',
    merchantAccount: process.env.HUBTEL_MERCHANT_ACCOUNT || '',
    webhookSecret:
      process.env.HUBTEL_WEBHOOK_SECRET || 'hubtel_test_webhook_secret_key',
    get isConfigured(): boolean {
      return (
        isConfiguredSecret(this.clientId) &&
        isConfiguredSecret(this.clientSecret) &&
        isConfiguredSecret(this.merchantAccount)
      );
    },
  },

  storage: {
    driver: (process.env.STORAGE_DRIVER || 'local') as 'local' | 's3',
    localDir:
      process.env.STORAGE_LOCAL_DIR || path.resolve(process.cwd(), 'uploads'),
    s3Bucket: process.env.S3_BUCKET || '',
    s3Region: process.env.S3_REGION || 'eu-west-1',
    s3Endpoint: process.env.S3_ENDPOINT || '',
    get isS3Configured(): boolean {
      return (
        this.driver === 's3' &&
        isConfiguredSecret(this.s3Bucket) &&
        isConfiguredSecret(process.env.S3_ACCESS_KEY_ID) &&
        isConfiguredSecret(process.env.S3_SECRET_ACCESS_KEY)
      );
    },
  },
};
