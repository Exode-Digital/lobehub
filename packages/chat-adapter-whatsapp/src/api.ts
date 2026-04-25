import { createHmac, timingSafeEqual } from 'node:crypto';

import type {
  WhatsAppMediaUrlResponse,
  WhatsAppSendResponse,
  WhatsAppSendTextRequest,
} from './types';

export const DEFAULT_GRAPH_API_BASE_URL = 'https://graph.facebook.com';
export const DEFAULT_GRAPH_API_VERSION = 'v21.0';

/**
 * Cloud API REST client. Stateless — instances are cheap to create and reuse.
 *
 * All methods throw on HTTP failure with the Cloud API `error.message` so
 * callers can surface meaningful diagnostics back to the operator.
 */
export class WhatsAppApiClient {
  readonly accessToken: string;
  readonly phoneNumberId: string;
  readonly baseUrl: string;
  readonly version: string;

  constructor(options: {
    accessToken: string;
    baseUrl?: string;
    phoneNumberId: string;
    version?: string;
  }) {
    this.accessToken = options.accessToken;
    this.phoneNumberId = options.phoneNumberId;
    this.baseUrl = stripTrailingSlashes(options.baseUrl || DEFAULT_GRAPH_API_BASE_URL);
    this.version = options.version || DEFAULT_GRAPH_API_VERSION;
  }

  private get root(): string {
    return `${this.baseUrl}/${this.version}`;
  }

  private get authHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  /** Send a plain text message to a recipient. */
  async sendText(to: string, body: string, previewUrl = false): Promise<WhatsAppSendResponse> {
    const payload: WhatsAppSendTextRequest = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      text: { body, preview_url: previewUrl },
      to,
      type: 'text',
    };
    return this.postMessages(payload as unknown as Record<string, unknown>);
  }

  /**
   * Mark an inbound user message as read. WhatsApp Cloud API combines this
   * with the typing indicator: when called with `typingIndicator=true`, the
   * client UI shows the bot is "typing…" until the next outbound message
   * (max ~25s). This is the only typing primitive Cloud API exposes.
   * @see https://developers.facebook.com/docs/whatsapp/cloud-api/guides/mark-message-as-read
   */
  async markRead(messageId: string, typingIndicator = false): Promise<void> {
    const payload: Record<string, unknown> = {
      message_id: messageId,
      messaging_product: 'whatsapp',
      status: 'read',
    };
    if (typingIndicator) payload.typing_indicator = { type: 'text' };
    await this.postMessages(payload);
  }

  /**
   * Resolve a media id into a short-lived signed URL plus metadata. The url
   * must be downloaded with the same `Authorization` bearer header.
   */
  async getMediaUrl(mediaId: string): Promise<WhatsAppMediaUrlResponse> {
    const res = await fetch(`${this.root}/${encodeURIComponent(mediaId)}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
      method: 'GET',
    });
    return parseResponse<WhatsAppMediaUrlResponse>(res, 'getMediaUrl');
  }

  /**
   * Download media bytes by media id. Combines `getMediaUrl` + a second GET
   * with the bearer header (the URL refuses anonymous access).
   */
  async downloadMedia(mediaId: string): Promise<Buffer> {
    const meta = await this.getMediaUrl(mediaId);
    if (!meta.url) {
      throw new Error(`WhatsApp media ${mediaId} has no resolvable url`);
    }
    const res = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`downloadMedia ${mediaId} failed with HTTP ${res.status}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  /**
   * Verify that the phone number id + access token combo is usable. Issues a
   * cheap GET against the phone number node and surfaces the human-readable
   * Cloud API error string when the request fails.
   */
  async verifyCredentials(): Promise<{ display_phone_number?: string; verified_name?: string }> {
    const res = await fetch(`${this.root}/${encodeURIComponent(this.phoneNumberId)}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
      method: 'GET',
    });
    return parseResponse(res, 'verifyCredentials');
  }

  private async postMessages(payload: Record<string, unknown>): Promise<WhatsAppSendResponse> {
    const res = await fetch(`${this.root}/${encodeURIComponent(this.phoneNumberId)}/messages`, {
      body: JSON.stringify(payload),
      headers: this.authHeaders,
      method: 'POST',
    });
    return parseResponse<WhatsAppSendResponse>(res, 'sendMessage');
  }
}

/**
 * Compute the expected HMAC-SHA256 signature for an inbound webhook body.
 * WhatsApp signs the raw bytes with the App Secret.
 *
 * @returns The hex digest, prefixed with `sha256=` (matches the header value).
 */
export function computeSignature(body: string, appSecret: string): string {
  const hmac = createHmac('sha256', appSecret);
  hmac.update(body, 'utf8');
  return `sha256=${hmac.digest('hex')}`;
}

/**
 * Validate an `X-Hub-Signature-256` header against the request body using
 * timing-safe comparison. Returns `false` whenever the signature is missing,
 * malformed, or doesn't match — never throws.
 */
export function verifySignature(
  body: string,
  signatureHeader: string | null | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader || !appSecret) return false;
  const expected = computeSignature(body, appSecret);
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signatureHeader);
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

function stripTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === '/') end--;
  return url.slice(0, end);
}

async function parseResponse<T>(response: Response, label: string): Promise<T> {
  const text = await response.text();
  let payload: T | undefined;
  try {
    payload = text ? (JSON.parse(text) as T) : undefined;
  } catch {
    payload = undefined;
  }

  if (!response.ok) {
    const errMsg =
      (payload as { error?: { message?: string } } | undefined)?.error?.message ??
      `${label} failed with HTTP ${response.status}`;
    throw new Error(errMsg);
  }

  return (payload ?? ({} as T)) as T;
}
