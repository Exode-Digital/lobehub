import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ImessageClientFactory, imessageTestInternals } from './client';

const fetchSpy = vi.spyOn(globalThis, 'fetch');

const APPLICATION_ID = 'home-mac-mini';
const credentials = {
  password: 'server-password',
  serverUrl: 'https://bluebubbles.example.com',
  webhookSecret: 'shared-secret',
};

const createClient = (settings: Record<string, unknown> = {}) =>
  new ImessageClientFactory().createClient(
    {
      applicationId: APPLICATION_ID,
      credentials,
      platform: 'imessage',
      settings,
    },
    { appUrl: 'https://lobehub.example.com' },
  );

beforeEach(() => {
  vi.mock('@/server/services/gateway/runtimeStatus', () => ({
    BOT_RUNTIME_STATUSES: {
      connected: 'connected',
      disconnected: 'disconnected',
      failed: 'failed',
      starting: 'starting',
    },
    getRuntimeStatusErrorMessage: (e: unknown) => (e instanceof Error ? e.message : 'unknown'),
    updateBotRuntimeStatus: vi.fn().mockResolvedValue(undefined),
  }));
});

afterEach(() => {
  fetchSpy.mockReset();
});

describe('ImessageWebhookClient', () => {
  it('builds a webhook URL with the shared secret', () => {
    expect(
      imessageTestInternals.buildWebhookUrl(
        'https://lobehub.example.com',
        APPLICATION_ID,
        'shared-secret',
      ),
    ).toBe(
      'https://lobehub.example.com/api/agent/webhooks/imessage/home-mac-mini?secret=shared-secret',
    );
  });

  it('extractChatId strips the iMessage thread prefix without changing the chat guid', () => {
    const client = createClient();
    expect(client.extractChatId('imessage:iMessage;-;abc:def')).toBe('iMessage;-;abc:def');
  });

  it('createAdapter wires credentials into the SDK adapter', () => {
    const client = createClient({ userId: 'operator@example.com' });
    const adapter = client.createAdapter();
    expect(adapter.imessage).toBeDefined();
    expect((adapter.imessage as any).botUserId).toBe('operator@example.com');
  });

  it('messenger.createMessage sends text through BlueBubbles', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ data: { guid: 'sent-1', text: 'hello' } }), { status: 200 }),
    );

    const client = createClient();
    const messenger = client.getMessenger('imessage:iMessage;-;chat-1');
    await messenger.createMessage('hello');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://bluebubbles.example.com/api/v1/message/text?password=server-password',
    );
    const body = JSON.parse(init.body as string);
    expect(body.chatGuid).toBe('iMessage;-;chat-1');
    expect(body.message).toBe('hello');
  });

  it('extractFiles downloads BlueBubbles attachments from merged message attachments', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(Buffer.from('image-bytes'), {
        headers: { 'Content-Type': 'image/png' },
        status: 200,
      }),
    );

    const client = createClient();
    const sources = await (client as any).extractFiles({
      attachments: [
        {
          mimeType: 'image/png',
          name: 'photo.png',
          raw: {
            guid: 'att-1',
            mimeType: 'image/png',
            transferName: 'photo.png',
          },
          type: 'image',
          url: '',
        },
      ],
      id: 'merged',
    });

    expect(sources).toHaveLength(1);
    expect(sources[0].name).toBe('photo.png');
    expect(sources[0].mimeType).toBe('image/png');
    expect(sources[0].buffer.toString()).toBe('image-bytes');
    expect(fetchSpy.mock.calls[0][0]).toBe(
      'https://bluebubbles.example.com/api/v1/attachment/att-1/download?password=server-password&original=true',
    );
  });

  it('formatMarkdown strips Markdown and formatReply appends usage only when enabled', () => {
    const off = createClient();
    const on = createClient({ showUsageStats: true });

    expect(off.formatMarkdown!('**hi**')).toBe('hi');
    expect(off.formatReply!('body', { totalCost: 0.01, totalTokens: 42 })).toBe('body');
    expect(
      on.formatReply!('body', { elapsedMs: 1234, totalCost: 0.01, totalTokens: 42 }).startsWith(
        'body\n\n',
      ),
    ).toBe(true);
  });

  it('start verifies BlueBubbles and registers the new-message webhook', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: {} }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              events: ['new-message'],
              id: 1,
              url: 'https://lobehub.example.com/api/agent/webhooks/imessage/home-mac-mini?secret=shared-secret',
            },
          }),
          { status: 200 },
        ),
      );

    const client = createClient();
    await client.start();

    expect(fetchSpy.mock.calls[0][0]).toBe(
      'https://bluebubbles.example.com/api/v1/ping?password=server-password',
    );
    expect(fetchSpy.mock.calls[1][0]).toBe(
      'https://bluebubbles.example.com/api/v1/webhook?password=server-password',
    );
    const webhookInit = fetchSpy.mock.calls[1]?.[1] as RequestInit;
    const body = JSON.parse(webhookInit.body as string);
    expect(body.events).toEqual(['new-message']);
    expect(body.url).toBe(
      'https://lobehub.example.com/api/agent/webhooks/imessage/home-mac-mini?secret=shared-secret',
    );
  });
});

describe('ImessageClientFactory.validateCredentials', () => {
  it('reports missing fields without hitting the network', async () => {
    const factory = new ImessageClientFactory();
    const result = await factory.validateCredentials({});
    expect(result.valid).toBe(false);
    const fields = (result.errors ?? []).map((e) => e.field).sort();
    expect(fields).toEqual(['applicationId', 'password', 'serverUrl', 'webhookSecret']);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns valid=true when BlueBubbles ping succeeds', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ data: {} }), { status: 200 }));
    const factory = new ImessageClientFactory();
    const result = await factory.validateCredentials(credentials, undefined, APPLICATION_ID);
    expect(result.valid).toBe(true);
  });

  it('surfaces BlueBubbles API errors', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 }),
    );
    const factory = new ImessageClientFactory();
    const result = await factory.validateCredentials(credentials, undefined, APPLICATION_ID);
    expect(result.valid).toBe(false);
    expect(result.errors?.[0]?.message).toContain('Unauthorized');
  });
});
