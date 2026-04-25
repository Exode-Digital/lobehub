import type { PlatformDefinition } from '../types';
import { WhatsAppClientFactory } from './client';
import { schema } from './schema';

export const whatsapp: PlatformDefinition = {
  id: 'whatsapp',
  name: 'WhatsApp',
  connectionMode: 'webhook',
  description: 'Connect a WhatsApp Cloud API bot for direct messages.',
  documentation: {
    portalUrl: 'https://developers.facebook.com/apps',
    setupGuideUrl: 'https://lobehub.com/docs/usage/channels/whatsapp',
  },
  schema,
  showWebhookUrl: true,
  supportsMessageEdit: false,
  clientFactory: new WhatsAppClientFactory(),
};
