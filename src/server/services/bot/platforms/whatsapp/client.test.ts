import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WhatsAppClientFactory } from './client';

const fetchSpy = vi.spyOn(globalThis, 'fetch');

const createClient = () =>
  new WhatsAppClientFactory().createClient(
    {
      applicationId: '111222',
      credentials: {
        accessToken: 'token-test',
        appSecret: 'app-secret',
        verifyToken: 'verify-token',
      },
      platform: 'whatsapp',
      settings: {},
    },
    {},
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

describe('WhatsAppWebhookClient', () => {
  it('formatMarkdown converts CommonMark bold to WhatsApp single-asterisk', () => {
    const client = createClient();
    expect(client.formatMarkdown!('**hi**')).toBe('*hi*');
  });

  it('extractChatId pulls the wa_id from the composite threadId', () => {
    const client = createClient();
    expect(client.extractChatId('whatsapp:single:15551234567')).toBe('15551234567');
  });

  it('parseMessageId returns the composite id verbatim (wamid pass-through)', () => {
    const client = createClient();
    expect(client.parseMessageId('wamid.HBgM12345')).toBe('wamid.HBgM12345');
  });

  it('createAdapter wires accessToken / appSecret / verifyToken into the SDK adapter', () => {
    const client = createClient();
    const adapter = client.createAdapter();
    expect(adapter.whatsapp).toBeDefined();
    expect((adapter.whatsapp as any).botUserId).toBe('111222');
  });

  it('messenger.createMessage POSTs to Cloud API messages endpoint', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: 'wamid.OUT' }] }), { status: 200 }),
    );
    const client = createClient();
    const messenger = client.getMessenger('whatsapp:single:15551234567');
    await messenger.createMessage('hi back');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v21.0/111222/messages');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-test');
    const body = JSON.parse(init.body as string);
    expect(body.to).toBe('15551234567');
    expect(body.text.body).toBe('hi back');
  });

  it('formatReply appends usage stats only when showUsageStats=true', () => {
    const factory = new WhatsAppClientFactory();
    const baseConfig = {
      applicationId: '111222',
      credentials: { accessToken: 't', verifyToken: 'v' },
      platform: 'whatsapp',
    };
    const off = factory.createClient({ ...baseConfig, settings: {} }, {});
    const on = factory.createClient({ ...baseConfig, settings: { showUsageStats: true } }, {});

    const stats = { elapsedMs: 1234, totalCost: 0.01, totalTokens: 42 };
    expect(off.formatReply!('body', stats)).toBe('body');
    const out = on.formatReply!('body', stats);
    expect(out.startsWith('body\n\n')).toBe(true);
  });
});

describe('WhatsAppClientFactory.validateCredentials', () => {
  it('reports missing accessToken / verifyToken / applicationId before hitting the network', async () => {
    const factory = new WhatsAppClientFactory();
    const result = await factory.validateCredentials({});
    expect(result.valid).toBe(false);
    const fields = (result.errors ?? []).map((e) => e.field).sort();
    expect(fields).toEqual(['accessToken', 'applicationId', 'verifyToken']);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns valid=true when Cloud API verifyCredentials succeeds', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ display_phone_number: '+1 555 1234' }), { status: 200 }),
    );
    const factory = new WhatsAppClientFactory();
    const result = await factory.validateCredentials(
      { accessToken: 'good', verifyToken: 'v' },
      undefined,
      'phone-1',
    );
    expect(result.valid).toBe(true);
  });

  it('surfaces Cloud API error message when token is rejected', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'Invalid OAuth access token.' } }), {
        status: 401,
      }),
    );
    const factory = new WhatsAppClientFactory();
    const result = await factory.validateCredentials(
      { accessToken: 'bad', verifyToken: 'v' },
      undefined,
      'phone-1',
    );
    expect(result.valid).toBe(false);
    expect(result.errors?.[0]?.message).toContain('Invalid OAuth access token.');
  });
});
