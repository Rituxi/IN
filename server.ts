import express from 'express';
import path from 'path';
import { apiRouter, checkRedisConnection } from './server/api.js';
import 'dotenv/config';

declare const __dirname: string;

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  console.log('Checking Redis connection...');
  const redisOk = await checkRedisConnection();
  if (!redisOk) {
    console.error('Redis connection failed. Server will continue but may not work properly.');
  }

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  app.get('/healthz', (req, res) => {
    res.type('text/plain').send('ok');
  });

  app.get('/api/health', async (req, res) => {
    const redisConnected = await checkRedisConnection().catch(() => false);
    res.json({ 
      status: redisConnected ? 'ok' : 'degraded', 
      redis: redisConnected ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString() 
    });
  });

  app.use('/api', apiRouter);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = __dirname;
    console.log('Serving static files from:', distPath);
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
