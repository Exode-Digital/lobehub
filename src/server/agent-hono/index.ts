import { Hono } from 'hono';

import { finalizeAbandoned } from './handlers/finalizeAbandoned';
import { serviceTokenAuth } from './middlewares/serviceTokenAuth';

/**
 * Hono app for `/api/agent/*` endpoints. Mounted via the Next.js catch-all
 * at `src/app/(backend)/api/agent/[...route]/route.ts`.
 *
 * Routing precedence: existing static `route.ts` files (e.g. `run/route.ts`,
 * `tool-result/route.ts`) win over the catch-all, so individual paths can
 * be migrated to Hono one at a time — delete the static `route.ts` and add
 * the corresponding handler here.
 */
const app = new Hono().basePath('/api/agent');

app.post('/finalize-abandoned', serviceTokenAuth(), finalizeAbandoned);

app.get('/finalize-abandoned', (c) =>
  c.json({
    healthy: true,
    message: 'Agent finalize-abandoned endpoint is running',
    timestamp: new Date().toISOString(),
  }),
);

export default app;
