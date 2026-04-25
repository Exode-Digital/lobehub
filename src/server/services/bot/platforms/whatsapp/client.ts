import {
  createWhatsAppAdapter,
  resolveMediaIdFromRaw,
  WhatsAppApiClient,
  type WhatsAppMessage,
} from '@lobechat/chat-adapter-whatsapp';
import type { Message } from 'chat';
import debug from 'debug';

import type { AttachmentSource } from '@/server/services/aiAgent/ingestAttachment';
import {
  BOT_RUNTIME_STATUSES,
  getRuntimeStatusErrorMessage,
  updateBotRuntimeStatus,
} from '@/server/services/gateway/runtimeStatus';

import {
  type BotPlatformRuntimeContext,
  type BotProviderConfig,
  ClientFactory,
  type PlatformClient,
  type PlatformMessenger,
  type UsageStats,
  type ValidationResult,
} from '../types';
import { formatUsageStats } from '../utils';
import { markdownToWhatsApp } from './markdownToWhatsApp';

const log = debug('bot-platform:whatsapp:bot');

function extractChatId(platformThreadId: string): string {
  // Thread ID format: whatsapp:single:waId
  const parts = platformThreadId.split(':');
  return parts.slice(2).join(':');
}

function buildApi(config: BotProviderConfig): WhatsAppApiClient {
  return new WhatsAppApiClient({
    accessToken: config.credentials.accessToken,
    phoneNumberId: config.applicationId,
  });
}

class WhatsAppWebhookClient implements PlatformClient {
  readonly id = 'whatsapp';
  readonly applicationId: string;

  private config: BotProviderConfig;
  private context: BotPlatformRuntimeContext;
  private api: WhatsAppApiClient;
  /**
   * Cache of the most recent inbound `wamid` per thread, indexed by the
   * decoded chat id (the recipient's wa_id). The Cloud API needs this id
   * to mark a thread as read or to surface the typing indicator.
   */
  private lastInboundMessageId = new Map<string, string>();

  constructor(config: BotProviderConfig, context: BotPlatformRuntimeContext) {
    this.config = config;
    this.context = context;
    this.applicationId = config.applicationId;
    this.api = buildApi(config);
  }

  // --- Lifecycle ---

  async start(): Promise<void> {
    log('Starting WhatsAppBot appId=%s', this.applicationId);
    await updateBotRuntimeStatus({
      applicationId: this.applicationId,
      platform: this.id,
      status: BOT_RUNTIME_STATUSES.starting,
    });

    try {
      // WhatsApp Cloud API does not let us register a webhook URL
      // programmatically — operators paste the URL into the Meta dashboard.
      // We can still verify the access token / phone number id pair is
      // valid so a clearly-broken provider doesn't reach the connected
      // state silently.
      await this.api.verifyCredentials();

      await updateBotRuntimeStatus({
        applicationId: this.applicationId,
        platform: this.id,
        status: BOT_RUNTIME_STATUSES.connected,
      });

      log(
        'WhatsAppBot appId=%s ready (operator must wire webhook in Meta dashboard)',
        this.applicationId,
      );
    } catch (error) {
      await updateBotRuntimeStatus({
        applicationId: this.applicationId,
        errorMessage: getRuntimeStatusErrorMessage(error),
        platform: this.id,
        status: BOT_RUNTIME_STATUSES.failed,
      });
      throw error;
    }
  }

  async stop(): Promise<void> {
    log('Stopping WhatsAppBot appId=%s', this.applicationId);
    await updateBotRuntimeStatus({
      applicationId: this.applicationId,
      platform: this.id,
      status: BOT_RUNTIME_STATUSES.disconnected,
    });
  }

  // --- Runtime Operations ---

  createAdapter(): Record<string, any> {
    return {
      whatsapp: createWhatsAppAdapter({
        accessToken: this.config.credentials.accessToken,
        appSecret: this.config.credentials.appSecret || undefined,
        phoneNumberId: this.applicationId,
        verifyToken: this.config.credentials.verifyToken,
      }),
    };
  }

  getMessenger(platformThreadId: string): PlatformMessenger {
    const recipient = extractChatId(platformThreadId);
    return {
      createMessage: async (content) => {
        await this.api.sendText(recipient, content);
      },
      // WhatsApp Cloud API does not support editing a sent message.
      // `supportsMessageEdit: false` on the platform definition makes the
      // bridge skip step-progress edits, but we still implement this here
      // for the rare path where the bridge needs to "replace" content —
      // we send a brand-new message, matching WeChat's behavior.
      editMessage: async (_messageId, content) => {
        await this.api.sendText(recipient, content);
      },
      removeReaction: () => Promise.resolve(),
      triggerTyping: async () => {
        const lastId = this.lastInboundMessageId.get(recipient);
        if (!lastId) return;
        try {
          await this.api.markRead(lastId, true);
        } catch (err) {
          log('triggerTyping failed: %O', err);
        }
      },
    };
  }

  /**
   * Resolve attachments on an inbound WhatsApp message into `AttachmentSource[]`.
   *
   * WhatsApp media is referenced by id only — both adapter parse-time and
   * the SDK Redis round-trip preserve `raw.{image,video,audio,…}.id`, but
   * the binary itself must be fetched twice: once to resolve the signed
   * lookaside URL, and once to download the bytes (both with the bearer
   * header). We do this on demand inside `extractFiles`.
   */
  async extractFiles(message: Message): Promise<AttachmentSource[] | undefined> {
    const raw = (message as any).raw as WhatsAppMessage | undefined;
    const media = resolveMediaIdFromRaw(raw);
    if (!raw || !media?.id) return undefined;

    log('extractFiles: msgId=%s mediaId=%s', (message as any).id, media.id);

    try {
      const buffer = await this.api.downloadMedia(media.id);
      return [
        {
          buffer,
          mimeType: media.mime_type ?? defaultMimeForType(raw.type),
          name: media.filename ?? defaultNameForType(raw.type, media.mime_type),
          size: buffer.length,
        },
      ];
    } catch (err) {
      log('extractFiles: downloadMedia failed for mediaId=%s: %O', media.id, err);
      return undefined;
    }
  }

  extractChatId(platformThreadId: string): string {
    return extractChatId(platformThreadId);
  }

  formatMarkdown(markdown: string): string {
    return markdownToWhatsApp(markdown);
  }

  formatReply(body: string, stats?: UsageStats): string {
    if (!stats || !this.config.settings?.showUsageStats) return body;
    return `${body}\n\n${formatUsageStats(stats)}`;
  }

  parseMessageId(compositeId: string): string {
    return compositeId;
  }

  /**
   * Updated by the bridge whenever a new inbound message arrives so that
   * the next `triggerTyping` call has a target message id to mark read.
   * Exposed via the `chat-sdk` `Adapter` interface, but the bridge keeps
   * its own copy here for simpler callback paths.
   */
  recordInboundMessage(threadId: string, messageId: string): void {
    const recipient = extractChatId(threadId);
    this.lastInboundMessageId.set(recipient, messageId);
  }
}

function defaultMimeForType(type: string | undefined): string {
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

function defaultNameForType(type: string | undefined, mimeType?: string): string {
  const ext = (mimeType ?? '').split('/')[1]?.split(';')[0]?.split('+')[0];
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

export class WhatsAppClientFactory extends ClientFactory {
  createClient(config: BotProviderConfig, context: BotPlatformRuntimeContext): PlatformClient {
    return new WhatsAppWebhookClient(config, context);
  }

  async validateCredentials(
    credentials: Record<string, string>,
    _settings?: Record<string, unknown>,
    applicationId?: string,
  ): Promise<ValidationResult> {
    const errors: Array<{ field: string; message: string }> = [];
    if (!credentials.accessToken) {
      errors.push({ field: 'accessToken', message: 'Access Token is required' });
    }
    if (!credentials.verifyToken) {
      errors.push({ field: 'verifyToken', message: 'Verify Token is required' });
    }
    if (!applicationId) {
      errors.push({ field: 'applicationId', message: 'Phone Number ID is required' });
    }
    if (errors.length > 0) {
      return { errors, valid: false };
    }

    try {
      const api = new WhatsAppApiClient({
        accessToken: credentials.accessToken,
        phoneNumberId: applicationId!,
      });
      await api.verifyCredentials();
      return { valid: true };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to authenticate with WhatsApp Cloud API';
      return {
        errors: [{ field: 'accessToken', message }],
        valid: false,
      };
    }
  }
}
