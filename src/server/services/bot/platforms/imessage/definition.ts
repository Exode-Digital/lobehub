import type { PlatformDefinition } from '../types';
import { ImessageClientFactory } from './client';
import { schema } from './schema';

export const imessage: PlatformDefinition = {
  id: 'imessage',
  name: 'iMessage',
  connectionMode: 'webhook',
  description: 'Connect iMessage through a self-hosted BlueBubbles server.',
  documentation: {
    portalUrl: 'https://bluebubbles.app/',
    setupGuideUrl: 'https://lobehub.com/docs/usage/channels/imessage',
  },
  schema,
  showWebhookUrl: true,
  supportsMarkdown: false,
  supportsMessageEdit: false,
  clientFactory: new ImessageClientFactory(),
};
