import debug from 'debug';

import { getBotMessageRouter } from '@/server/services/bot';

const log = debug('lobe-server:bot:webhook-route');

/**
 * Unified webhook endpoint for Chat SDK bot platforms.
 *
 * Handles both generic and bot-specific webhook URLs:
 *   - GET  /api/agent/webhooks/[platform]/[appId]   (e.g. WhatsApp `hub.challenge` handshake)
 *   - POST /api/agent/webhooks/[platform]
 *   - POST /api/agent/webhooks/[platform]/[appId]
 *
 * Using an optional catch-all `[[...appId]]` ensures both patterns are served
 * by a single serverless function, avoiding deployment issues with nested
 * dynamic segments on Vercel.
 *
 * Both verbs delegate to the same `BotMessageRouter` handler — adapters that
 * need to differentiate (WhatsApp does GET verification) inspect `request.method`.
 */
const dispatch = async (
  req: Request,
  { params }: { params: Promise<{ appId?: string[]; platform: string }> },
): Promise<Response> => {
  const { platform, appId: appIdSegments } = await params;
  const appId = appIdSegments?.[0];

  log(
    'Received webhook: method=%s, platform=%s, appId=%s, url=%s',
    req.method,
    platform,
    appId ?? '(none)',
    req.url,
  );

  const router = getBotMessageRouter();
  const handler = router.getWebhookHandler(platform, appId);
  return handler(req);
};

export const GET = dispatch;
export const POST = dispatch;
