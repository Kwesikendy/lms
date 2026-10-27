import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from '../src/server/app.js';

let appInstance: ReturnType<typeof createApp> | null = null;

function getApp() {
  if (!appInstance) {
    appInstance = createApp();
  }
  return appInstance;
}

export default function handler(req: IncomingMessage, res: ServerResponse) {
  const app = getApp();
  return app(req, res);
}
