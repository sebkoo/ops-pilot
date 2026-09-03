import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { requestId } from 'hono/request-id';
import { onError, onNotFound } from './errors.js';
import { issueRoutes } from './modules/issues/issue.routes.js';

export const app = new Hono();

app.use('*', requestId());
app.use('*', logger());

app.get('/health', (c) =>
  c.json({ ok: true, service: 'opspilot-api', time: new Date().toISOString() }),
);
app.route('/issues', issueRoutes);

app.onError(onError);
app.notFound(onNotFound);
