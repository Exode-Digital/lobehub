import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { computeSignature, verifySignature, WhatsAppApiClient } from './api';

const fetchSpy = vi.spyOn(globalThis, 'fetch');

afterEach(() => {
  fetchSpy.mockReset();
});

describe('computeSignature / verifySignature', () => {
  it('round-trips on matching body + secret', () => {
    const body = '{"hello":"world"}';
    const secret = 'shh';
    const sig = computeSignature(body, secret);
    expect(sig.startsWith('sha256=')).toBe(true);
    expect(verifySignature(body, sig, secret)).toBe(true);
  });

  it('rejects mismatched body / mutated secret / missing header', () => {
    const body = '{"hello":"world"}';
    const sig = computeSignature(body, 'shh');
    expect(verifySignature('tampered', sig, 'shh')).toBe(false);
    expect(verifySignature(body, sig, 'other-secret')).toBe(false);
    expect(verifySignature(body, null, 'shh')).toBe(false);
    expect(verifySignature(body, sig, '')).toBe(false);
  });
});

describe('WhatsAppApiClient', () => {
  beforeEach(() => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: 'wamid.OUT' }] }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    );
  });

  it('sendText posts to /{phoneNumberId}/messages with text envelope', async () => {
    const api = new WhatsAppApiClient({
      accessToken: 't',
      phoneNumberId: '999',
    });
    const out = await api.sendText('15551234567', 'hi', false);

    expect(out.messages?.[0]?.id).toBe('wamid.OUT');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v21.0/999/messages');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer t');
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      text: { body: 'hi', preview_url: false },
      to: '15551234567',
      type: 'text',
    });
  });

  it('verifyCredentials throws with the cloud API error message', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'Invalid OAuth access token.' } }), {
        status: 401,
      }),
    );
    const api = new WhatsAppApiClient({ accessToken: 'bad', phoneNumberId: '999' });
    await expect(api.verifyCredentials()).rejects.toThrow('Invalid OAuth access token.');
  });

  it('downloadMedia chains getMediaUrl + binary fetch with bearer header', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ url: 'https://lookaside.fbsbx.com/wam/blob' }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));

    const api = new WhatsAppApiClient({ accessToken: 't', phoneNumberId: '999' });
    const buf = await api.downloadMedia('media-1');

    expect(buf).toEqual(Buffer.from([1, 2, 3]));
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const meta = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(meta[0]).toBe('https://graph.facebook.com/v21.0/media-1');
    const blob = fetchSpy.mock.calls[1] as [string, RequestInit];
    expect(blob[0]).toBe('https://lookaside.fbsbx.com/wam/blob');
    expect((blob[1].headers as Record<string, string>).Authorization).toBe('Bearer t');
  });
});
