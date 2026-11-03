import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from '../src/server/app.js';

let appInstance: ReturnType<typeof createApp> | null = null;
let initError: Error | null = null;

function getApp() {
  if (initError) {
    throw initError;
  }
  if (!appInstance) {
    try {
      appInstance = createApp();
    } catch (err) {
      initError = err instanceof Error ? err : new Error(String(err));
      console.error('[Vercel Serverless Init Error]:', initError);
      throw initError;
    }
  }
  return appInstance;
}

export default function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    // Enable CORS for API routes on Vercel
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    const app = getApp();
    return app(req, res);
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: 'Serverless execution failed: ' + error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      })
    );
  }
}
