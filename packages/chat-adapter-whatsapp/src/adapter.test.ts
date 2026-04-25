import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createWhatsAppAdapter,
  extractMediaMetadata,
  resolveMediaIdFromRaw,
  WhatsAppAdapter,
} from './adapter';
import { computeSignature } from './api';
import type { WhatsAppMessage, WhatsAppWebhookPayload } from './types';

const baseConfig = {
  accessToken: 'token-test',
  appSecret: 'app-secret',
  phoneNumberId: '1111',
  verifyToken: 'verify-token',
};

function makeAdapter(overrides: Partial<typeof baseConfig> = {}) {
  const adapter = createWhatsAppAdapter({ ...baseConfig, ...overrides });
  const processMessage = vi.fn(
    async (_adapter: unknown, _threadId: string, factory: () => Promise<unknown> | unknown) =>
      factory(),
  );
  const chat = {
    getLogger: () => ({
      child: () => ({}),
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    }),
    getUserName: () => 'whatsapp-bot',
    processMessage,
  } as any;
  return { adapter, chat, processMessage };
}

function buildPayload(message: Partial<WhatsAppMessage>): WhatsAppWebhookPayload {
  const msg: WhatsAppMessage = {
    from: '15551234567',
    id: 'wamid.AAAA',
    timestamp: '1700000000',
    type: 'text',
    ...message,
  } as WhatsAppMessage;
  return {
    entry: [
      {
        changes: [
          {
            field: 'messages',
            value: {
              contacts: [{ profile: { name: 'Jane' }, wa_id: msg.from }],
              messages: [msg],
              messaging_product: 'whatsapp',
              metadata: { phone_number_id: baseConfig.phoneNumberId },
            },
          },
        ],
        id: 'WABA-id',
      },
    ],
    object: 'whatsapp_business_account',
  };
}

function makeRequest(method: string, body: string, headers: Record<string, string> = {}): Request {
  return new Request('https://example.com/api/agent/webhooks/whatsapp/1111', {
    body: method === 'GET' ? undefined : body,
    headers,
    method,
  });
}

describe('WhatsAppAdapter (verification)', () => {
  it('echoes hub.challenge on a valid GET handshake', async () => {
    const { adapter, chat } = makeAdapter();
    await adapter.initialize(chat);

    const url =
      'https://example.com/api/agent/webhooks/whatsapp/1111?hub.mode=subscribe' +
      `&hub.verify_token=${encodeURIComponent(baseConfig.verifyToken)}&hub.challenge=42`;
    const res = await adapter.handleWebhook(new Request(url, { method: 'GET' }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('42');
  });

  it('rejects GET handshake with wrong verify token', async () => {
    const { adapter, chat } = makeAdapter();
    await adapter.initialize(chat);

    const url =
      'https://example.com/api/agent/webhooks/whatsapp/1111?hub.mode=subscribe' +
      '&hub.verify_token=wrong&hub.challenge=42';
    const res = await adapter.handleWebhook(new Request(url, { method: 'GET' }));
    expect(res.status).toBe(403);
  });
});

describe('WhatsAppAdapter (signature verification)', () => {
  it('rejects POST with missing signature when appSecret is configured', async () => {
    const { adapter, chat } = makeAdapter();
    await adapter.initialize(chat);

    const body = JSON.stringify(buildPayload({ text: { body: 'hi' } }));
    const res = await adapter.handleWebhook(makeRequest('POST', body));
    expect(res.status).toBe(401);
  });

  it('rejects POST with mismatched signature', async () => {
    const { adapter, chat } = makeAdapter();
    await adapter.initialize(chat);

    const body = JSON.stringify(buildPayload({ text: { body: 'hi' } }));
    const res = await adapter.handleWebhook(
      makeRequest('POST', body, { 'x-hub-signature-256': 'sha256=wrong' }),
    );
    expect(res.status).toBe(401);
  });

  it('accepts POST with valid signature and dispatches message', async () => {
    const { adapter, chat, processMessage } = makeAdapter();
    await adapter.initialize(chat);

    const body = JSON.stringify(buildPayload({ text: { body: 'hi' } }));
    const sig = computeSignature(body, baseConfig.appSecret);
    const res = await adapter.handleWebhook(
      makeRequest('POST', body, { 'x-hub-signature-256': sig }),
    );

    expect(res.status).toBe(200);
    expect(processMessage).toHaveBeenCalledTimes(1);
    const [, threadId] = processMessage.mock.calls[0];
    expect(threadId).toBe('whatsapp:single:15551234567');
  });

  it('skips signature check when appSecret is omitted', async () => {
    const { adapter, chat, processMessage } = makeAdapter({ appSecret: undefined });
    await adapter.initialize(chat);

    const body = JSON.stringify(buildPayload({ text: { body: 'hi' } }));
    const res = await adapter.handleWebhook(makeRequest('POST', body));
    expect(res.status).toBe(200);
    expect(processMessage).toHaveBeenCalledTimes(1);
  });
});

describe('WhatsAppAdapter (parsing)', () => {
  it('parses a text message with sender name and timestamp', async () => {
    const { adapter, chat, processMessage } = makeAdapter({ appSecret: undefined });
    await adapter.initialize(chat);

    const body = JSON.stringify(
      buildPayload({ text: { body: 'Hello bot' }, timestamp: '1700001234' }),
    );
    await adapter.handleWebhook(makeRequest('POST', body));

    const factory = processMessage.mock.calls[0][2] as () => Promise<any>;
    const message = await factory();
    expect(message.text).toBe('Hello bot');
    expect(message.author.fullName).toBe('Jane');
    expect(message.metadata.dateSent.getTime()).toBe(1700001234 * 1000);
    expect(adapter.getLastInboundMessageId('whatsapp:single:15551234567')).toBe('wamid.AAAA');
  });

  it('extracts metadata-only attachments for image messages', () => {
    const msg: WhatsAppMessage = {
      from: '15551234567',
      id: 'wamid.IMG',
      image: { caption: 'cute', id: 'media-1', mime_type: 'image/png' },
      timestamp: '1700001234',
      type: 'image',
    };
    const attachments = extractMediaMetadata(msg);
    expect(attachments).toHaveLength(1);
    expect(attachments[0].type).toBe('image');
    expect(attachments[0].mimeType).toBe('image/png');
    expect((attachments[0] as any).raw.id).toBe('media-1');
  });

  it('exposes media id via resolveMediaIdFromRaw for download path', () => {
    const msg: WhatsAppMessage = {
      from: '15551234567',
      id: 'wamid.DOC',
      document: { filename: 'spec.pdf', id: 'media-2', mime_type: 'application/pdf' },
      timestamp: '1700001234',
      type: 'document',
    };
    expect(resolveMediaIdFromRaw(msg)).toEqual({
      filename: 'spec.pdf',
      id: 'media-2',
      mime_type: 'application/pdf',
    });
  });
});

describe('WhatsAppAdapter (outbound)', () => {
  // Vitest's `MockInstance<typeof fetch>` is awkward to spell across versions —
  // a plain `any` keeps the spec readable and the assertions still type-check.
  let fetchSpy: any;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(JSON.stringify({ messages: [{ id: 'wamid.OUT' }] }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        }),
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('postMessage hits Cloud API with messaging_product/text payload', async () => {
    const adapter = new WhatsAppAdapter(baseConfig);
    // `AdapterPostableMessage` accepts a plain string for raw text replies.
    const result = await adapter.postMessage('whatsapp:single:15551234567', 'hi back' as any);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v21.0/1111/messages');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-test');
    const body = JSON.parse(init.body as string);
    expect(body.to).toBe('15551234567');
    expect(body.text.body).toBe('hi back');
    expect(result.id).toBe('wamid.OUT');
  });

  it('startTyping reads back via markRead with typing_indicator', async () => {
    const adapter = new WhatsAppAdapter(baseConfig);
    await adapter.initialize({
      getLogger: () => ({
        child: () => ({}),
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
      }),
      getUserName: () => 'whatsapp-bot',
      processMessage: vi.fn(),
    } as any);
    adapter.setLastInboundMessageId('whatsapp:single:15551234567', 'wamid.IN');

    await adapter.startTyping('whatsapp:single:15551234567');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.message_id).toBe('wamid.IN');
    expect(body.status).toBe('read');
    expect(body.typing_indicator).toEqual({ type: 'text' });
  });
});
