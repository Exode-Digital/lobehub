import type {
  Adapter,
  AdapterPostableMessage,
  Attachment,
  Author,
  ChatInstance,
  EmojiValue,
  FetchOptions,
  FetchResult,
  FormattedContent,
  Logger,
  RawMessage,
  ThreadInfo,
  WebhookOptions,
} from 'chat';
import { Message, parseMarkdown } from 'chat';

import { verifySignature, WhatsAppApiClient } from './api';
import { WhatsAppFormatConverter } from './format-converter';
import type {
  WhatsAppAdapterConfig,
  WhatsAppMediaAttachment,
  WhatsAppMessage,
  WhatsAppMessageType,
  WhatsAppThreadId,
  WhatsAppValueMessages,
  WhatsAppWebhookPayload,
} from './types';

/**
 * Pull the user-visible text out of an inbound message, including non-text
 * messages where we still want to surface a placeholder so the LLM has
 * something to react to. We deliberately keep the captions on media so the
 * model sees the user's intent instead of just an attachment count.
 */
function extractText(msg: WhatsAppMessage): string {
  switch (msg.type) {
    case 'text': {
      return msg.text?.body ?? '';
    }
    case 'image': {
      return msg.image?.caption ?? '';
    }
    case 'video': {
      return msg.video?.caption ?? '';
    }
    case 'document': {
      return msg.document?.caption ?? '';
    }
    case 'audio':
    case 'voice':
    case 'sticker': {
      return '';
    }
    default: {
      // For unsupported message types we surface a single-line placeholder
      // so the agent knows something arrived but can ignore it.
      return `[${msg.type} message]`;
    }
  }
}

/**
 * Map a WhatsApp media payload onto a Chat SDK `Attachment`. We only ship
 * metadata (id / mime / name) at parse time; the binary download path is the
 * server-side `extractFiles` because `Message.toJSON` strips buffers when
 * the message round-trips through Redis.
 */
function buildAttachment(
  type: 'audio' | 'document' | 'image' | 'sticker' | 'video',
  payload: WhatsAppMediaAttachment | undefined,
): Attachment | undefined {
  if (!payload) return undefined;
  const mimeType = payload.mime_type ?? defaultMimeType(type);
  return {
    mimeType,
    name: payload.filename ?? defaultName(type, mimeType),
    type: chatAttachmentType(type),
    url: '',
    // Stash the original payload (including the media id) on `raw` so the
    // server-side download path can find it after the chat-sdk Redis
    // round-trip strips function/buffer attachments.
    raw: { ...payload, mimeType },
  } as Attachment;
}

function chatAttachmentType(type: 'audio' | 'document' | 'image' | 'sticker' | 'video'): string {
  switch (type) {
    case 'image':
    case 'sticker': {
      return 'image';
    }
    case 'video': {
      return 'video';
    }
    case 'audio': {
      return 'audio';
    }
    default: {
      return 'file';
    }
  }
}

function defaultMimeType(type: WhatsAppMessageType | string): string {
  switch (type) {
    case 'image':
    case 'sticker': {
      return 'image/jpeg';
    }
    case 'video': {
      return 'video/mp4';
    }
    case 'audio':
    case 'voice': {
      return 'audio/ogg';
    }
    default: {
      return 'application/octet-stream';
    }
  }
}

function defaultName(type: string, mimeType: string): string {
  // Try to derive an extension from the mime type. Cheap, does not import `mime`
  // here because the parse path runs on every webhook delivery.
  const ext = mimeType.split('/')[1]?.split(';')[0]?.split('+')[0];
  switch (type) {
    case 'image':
    case 'sticker': {
      return `image.${ext || 'jpg'}`;
    }
    case 'video': {
      return `video.${ext || 'mp4'}`;
    }
    case 'audio':
    case 'voice': {
      return `audio.${ext || 'ogg'}`;
    }
    default: {
      return `file${ext ? `.${ext}` : ''}`;
    }
  }
}

/**
 * Walk a raw WhatsApp message and emit the metadata-only attachments that
 * downstream code needs. Mirrors the shape used by `chat-adapter-wechat`'s
 * `extractMediaMetadata`.
 */
export function extractMediaMetadata(msg: WhatsAppMessage): Attachment[] {
  const attachments: Attachment[] = [];

  const single = (att: Attachment | undefined) => {
    if (att) attachments.push(att);
  };

  switch (msg.type) {
    case 'image': {
      single(buildAttachment('image', msg.image));
      break;
    }
    case 'video': {
      single(buildAttachment('video', msg.video));
      break;
    }
    case 'audio':
    case 'voice': {
      single(buildAttachment('audio', msg.audio || msg.voice));
      break;
    }
    case 'document': {
      single(buildAttachment('document', msg.document));
      break;
    }
    case 'sticker': {
      single(buildAttachment('sticker', msg.sticker));
      break;
    }
    default: {
      // text / interactive / location / contacts / button / reaction — no
      // media payload to surface as an attachment.
      break;
    }
  }

  return attachments;
}

/**
 * Resolve the media id for a given `Message` from its `raw` payload. Used by
 * the platform client's `extractFiles` to request bytes from Cloud API after
 * a Redis round-trip has stripped any in-memory buffers.
 */
export function resolveMediaIdFromRaw(
  raw: WhatsAppMessage | undefined,
): WhatsAppMediaAttachment | undefined {
  if (!raw) return undefined;
  switch (raw.type) {
    case 'image': {
      return raw.image;
    }
    case 'video': {
      return raw.video;
    }
    case 'audio':
    case 'voice': {
      return raw.audio || raw.voice;
    }
    case 'document': {
      return raw.document;
    }
    case 'sticker': {
      return raw.sticker;
    }
    default: {
      return undefined;
    }
  }
}

/**
 * WhatsApp Cloud API adapter for Chat SDK.
 *
 * Owns:
 *   - GET hub.challenge handshake (Meta dashboard webhook setup)
 *   - POST signature verification (`X-Hub-Signature-256`)
 *   - Per-entry / per-change / per-message fan-out into the SDK
 *   - Outbound text via Cloud API REST
 *
 * Does NOT own:
 *   - Media binary download — handled by the server-side platform client
 *     because `Message.toJSON` strips buffers across the Redis queue.
 *   - Editing / deleting — Cloud API doesn't expose either; both fall back to
 *     posting a fresh message.
 */
export class WhatsAppAdapter implements Adapter<WhatsAppThreadId, WhatsAppMessage> {
  readonly name = 'whatsapp';

  private readonly api: WhatsAppApiClient;
  private readonly formatConverter: WhatsAppFormatConverter;
  private readonly verifyToken: string;
  private readonly appSecret?: string;

  private _userName: string;
  private chat!: ChatInstance;
  private logger!: Logger;

  /** Cache of the most recent inbound message id per thread, used for read receipts / typing. */
  private lastInboundMessageId = new Map<string, string>();

  get userName(): string {
    return this._userName;
  }

  get botUserId(): string {
    return this.api.phoneNumberId;
  }

  constructor(config: WhatsAppAdapterConfig & { userName?: string }) {
    if (!config.accessToken) throw new Error('WhatsApp adapter requires accessToken');
    if (!config.phoneNumberId) throw new Error('WhatsApp adapter requires phoneNumberId');
    if (!config.verifyToken) throw new Error('WhatsApp adapter requires verifyToken');

    this.api = new WhatsAppApiClient({
      accessToken: config.accessToken,
      baseUrl: config.graphApiBaseUrl,
      phoneNumberId: config.phoneNumberId,
      version: config.graphApiVersion,
    });
    this.formatConverter = new WhatsAppFormatConverter();
    this.verifyToken = config.verifyToken;
    this.appSecret = config.appSecret;
    this._userName = config.userName || 'whatsapp-bot';
  }

  async initialize(chat: ChatInstance): Promise<void> {
    this.chat = chat;
    this.logger = chat.getLogger(this.name);
    this._userName = chat.getUserName();
    this.logger.info('Initialized WhatsApp adapter (phoneNumberId=%s)', this.api.phoneNumberId);
  }

  // ------------------------------------------------------------------
  // Webhook handling
  // ------------------------------------------------------------------

  async handleWebhook(request: Request, options?: WebhookOptions): Promise<Response> {
    if (request.method === 'GET') {
      return this.handleVerificationChallenge(request);
    }

    const bodyText = await request.text();

    if (this.appSecret) {
      const signature = request.headers.get('x-hub-signature-256');
      if (!verifySignature(bodyText, signature, this.appSecret)) {
        this.logger.warn('Rejected webhook with invalid X-Hub-Signature-256');
        return new Response('Invalid signature', { status: 401 });
      }
    }

    let payload: WhatsAppWebhookPayload;
    try {
      payload = JSON.parse(bodyText);
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }

    if (payload?.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry)) {
      return Response.json({ ok: true });
    }

    for (const entry of payload.entry) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'messages') continue;
        await this.dispatchValue(change.value, options);
      }
    }

    return Response.json({ ok: true });
  }

  private handleVerificationChallenge(request: Request): Response {
    const url = new URL(request.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === this.verifyToken && challenge) {
      this.logger?.info?.('WhatsApp webhook verification succeeded');
      return new Response(challenge, {
        headers: { 'Content-Type': 'text/plain' },
        status: 200,
      });
    }
    this.logger?.warn?.('WhatsApp webhook verification failed: mode=%s', mode);
    return new Response('Forbidden', { status: 403 });
  }

  private async dispatchValue(
    value: WhatsAppValueMessages,
    options?: WebhookOptions,
  ): Promise<void> {
    const messages = value.messages ?? [];
    if (messages.length === 0) return;

    const contactsByWaId = new Map<string, string | undefined>();
    for (const c of value.contacts ?? []) {
      contactsByWaId.set(c.wa_id, c.profile?.name);
    }

    for (const msg of messages) {
      // Skip echo / status frames — Cloud API mostly delivers `messages` and
      // `statuses` in different changes; we already filtered by field above.
      if (!msg.from || !msg.id) continue;

      const threadId = this.encodeThreadId({ id: msg.from, type: 'single' });
      this.lastInboundMessageId.set(threadId, msg.id);

      const senderName = contactsByWaId.get(msg.from) ?? msg.from;
      const messageFactory = async () => this.parseInbound(msg, threadId, senderName);
      this.chat.processMessage(this, threadId, messageFactory, options);
    }
  }

  // ------------------------------------------------------------------
  // Message operations
  // ------------------------------------------------------------------

  async postMessage(
    threadId: string,
    message: AdapterPostableMessage,
  ): Promise<RawMessage<WhatsAppMessage>> {
    const { id: to } = this.decodeThreadId(threadId);
    const text = this.formatConverter.renderPostable(message);
    const response = await this.api.sendText(to, text);
    const messageId = response.messages?.[0]?.id ?? `local_${Date.now()}`;

    return {
      id: messageId,
      raw: {
        from: this.api.phoneNumberId,
        id: messageId,
        text: { body: text },
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: 'text',
      },
      threadId,
    };
  }

  async editMessage(
    threadId: string,
    _messageId: string,
    message: AdapterPostableMessage,
  ): Promise<RawMessage<WhatsAppMessage>> {
    // WhatsApp Cloud API does not support editing — fall back to a new send.
    return this.postMessage(threadId, message);
  }

  async deleteMessage(_threadId: string, _messageId: string): Promise<void> {
    this.logger.warn('Message deletion not supported for WhatsApp');
  }

  async fetchMessages(
    _threadId: string,
    _options?: FetchOptions,
  ): Promise<FetchResult<WhatsAppMessage>> {
    return { messages: [], nextCursor: undefined };
  }

  async fetchThread(threadId: string): Promise<ThreadInfo> {
    const { id, type } = this.decodeThreadId(threadId);
    return {
      channelId: threadId,
      id: threadId,
      isDM: type === 'single',
      metadata: { id, type },
    };
  }

  // ------------------------------------------------------------------
  // Reactions & typing
  // ------------------------------------------------------------------

  async addReaction(
    _threadId: string,
    _messageId: string,
    _emoji: EmojiValue | string,
  ): Promise<void> {
    // Cloud API supports message reactions, but our internal "👀 received" UX
    // isn't applicable in 1:1 SMS-style chats — keep a no-op for now.
  }

  async removeReaction(
    _threadId: string,
    _messageId: string,
    _emoji: EmojiValue | string,
  ): Promise<void> {}

  async startTyping(threadId: string): Promise<void> {
    const messageId = this.lastInboundMessageId.get(threadId);
    if (!messageId) return;
    try {
      await this.api.markRead(messageId, true);
    } catch (err) {
      this.logger.warn('startTyping failed: %s', err);
    }
  }

  // ------------------------------------------------------------------
  // Message parsing
  // ------------------------------------------------------------------

  parseMessage(raw: WhatsAppMessage): Message<WhatsAppMessage> {
    const text = extractText(raw);
    const formatted = parseMarkdown(text);
    const threadId = this.encodeThreadId({ id: raw.from, type: 'single' });

    return new Message({
      attachments: extractMediaMetadata(raw),
      author: {
        fullName: raw.from,
        isBot: raw.from === this.api.phoneNumberId,
        isMe: raw.from === this.api.phoneNumberId,
        userId: raw.from,
        userName: raw.from,
      },
      formatted,
      id: raw.id,
      metadata: {
        dateSent: new Date(Number(raw.timestamp) * 1000 || Date.now()),
        edited: false,
      },
      raw,
      text,
      threadId,
    });
  }

  private parseInbound(
    msg: WhatsAppMessage,
    threadId: string,
    senderName: string,
  ): Message<WhatsAppMessage> {
    const text = extractText(msg);
    const formatted = parseMarkdown(text);

    const author: Author = {
      fullName: senderName,
      isBot: false,
      isMe: false,
      userId: msg.from,
      userName: senderName,
    };

    return new Message({
      attachments: extractMediaMetadata(msg),
      author,
      formatted,
      id: msg.id,
      metadata: {
        dateSent: new Date(Number(msg.timestamp) * 1000 || Date.now()),
        edited: false,
      },
      raw: msg,
      text,
      threadId,
    });
  }

  // ------------------------------------------------------------------
  // Thread ID encoding
  // ------------------------------------------------------------------

  encodeThreadId(data: WhatsAppThreadId): string {
    return `whatsapp:${data.type}:${data.id}`;
  }

  decodeThreadId(threadId: string): WhatsAppThreadId {
    const parts = threadId.split(':');
    if (parts.length < 3 || parts[0] !== 'whatsapp') {
      return { id: threadId, type: 'single' };
    }
    return {
      id: parts.slice(2).join(':'),
      type: 'single',
    };
  }

  channelIdFromThreadId(threadId: string): string {
    return threadId;
  }

  isDM(_threadId: string): boolean {
    // Cloud API only routes 1:1 conversations to bots today.
    return true;
  }

  // ------------------------------------------------------------------
  // Format rendering
  // ------------------------------------------------------------------

  renderFormatted(content: FormattedContent): string {
    return this.formatConverter.fromAst(content);
  }

  // ------------------------------------------------------------------
  // Helpers exposed to the platform client
  // ------------------------------------------------------------------

  getLastInboundMessageId(threadId: string): string | undefined {
    return this.lastInboundMessageId.get(threadId);
  }

  setLastInboundMessageId(threadId: string, messageId: string): void {
    this.lastInboundMessageId.set(threadId, messageId);
  }
}

export function createWhatsAppAdapter(
  config: WhatsAppAdapterConfig & { userName?: string },
): WhatsAppAdapter {
  return new WhatsAppAdapter(config);
}
