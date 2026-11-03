import type { IncomingMessage, ServerResponse } from 'node:http';

let appInstance: any = null;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    if (!appInstance) {
      const { createApp } = await import('../src/server/app.js');
      appInstance = createApp();
    }
    return appInstance(req, res);
  } catch (err: any) {
    res.statusCode = 200; // Return 200 so Vercel does not intercept with FUNCTION_INVOCATION_FAILED
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        debug_diagnostic: true,
        message: err?.message,
        code: err?.code,
        stack: err?.stack,
      })
    );
  }
}
