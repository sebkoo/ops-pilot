import { serve } from '@hono/node-server';
import { app } from './app.js';
import { initConfig } from './config.js';

const config = initConfig();

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`OpsPilot API listening on http://localhost:${info.port}`);
});
