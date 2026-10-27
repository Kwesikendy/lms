import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { createApp } from './app.js';
import { config } from './config.js';

async function startServer() {
  const app = createApp();
  const isProd = config.nodeEnv === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const clientDist = path.resolve(process.cwd(), 'dist', 'client');
    if (fs.existsSync(clientDist)) {
      app.use(express.static(clientDist));
      app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api/')) {
          next();
          return;
        }
        res.sendFile(path.join(clientDist, 'index.html'));
      });
    }
  }

  app.listen(config.port, () => {
    console.log(
      `[Aether LMS] Server listening at http://localhost:${config.port} (${config.nodeEnv})`
    );
  });
}

startServer().catch((err) => {
  console.error('Failed to start Aether LMS server:', err);
  process.exit(1);
});
