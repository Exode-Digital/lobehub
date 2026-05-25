import {
  BlueBubblesApiClient,
  type BlueBubblesAttachment,
  type BlueBubblesOutboundAttachment,
  createImessageAdapter,
  resolveAttachmentGuid,
  resolveAttachmentName,
} from '@lobechat/chat-adapter-imessage';
import type { Message } from 'chat';
import debug from 'debug';

import type { AttachmentSource } from '@/server/services/aiAgent/ingestAttachment';
import {
  BOT_RUNTIME_STATUSES,
  getRuntimeStatusErrorMessage,
  updateBotRuntimeStatus,
} from '@/server/services/gateway/runtimeStatus';

import { stripMarkdown } from '../stripMarkdown';
import {
  type BotMessageAttachment,
  type BotPlatformRuntimeContext,
  type BotProviderConfig,
  ClientFactory,
  messengerContentText,
  type PlatformClient,
  type PlatformMessenger,
  type UsageStats,
  type ValidationResult,
} from '../types';
import { formatUsageStats } from '../utils';

const log = debug('bot-platform:imessage:bot');

interface ImessageCredentials {
  password: string;
  serverUrl: string;
  webhookSecret: string;
}

function resolveCredentials(credentials: Record<string, string>): ImessageCredentials {
  const serverUrl = credentials.serverUrl?.trim();
  const password = credentials.password?.trim();
  const webhookSecret = credentials.webhookSecret?.trim();

  if (!serverUrl) throw new Error('BlueBubbles Server URL is required');
  if (!password) throw new Error('BlueBubbles Password is required');
  if (!webhookSecret) throw new Error('Webhook Secret is required');

  return { password, serverUrl, webhookSecret };
}

function decodeThread(platformThreadId: string): string {
  return platformThreadId.startsWith('imessage:')
    ? platformThreadId.slice('imessage:'.length)
    : platformThreadId;
}

function buildWebhookUrl(appUrl: string, applicationId: string, webhookSecret: string): string {
  const baseUrl = appUrl.endsWith('/') ? appUrl : `${appUrl}/`;
  const url = new URL(`api/agent/webhooks/imessage/${encodeURIComponent(applicationId)}`, baseUrl);
  url.searchParams.set('secret', webhookSecret);
  return url.toString();
}

function toBlueBubblesAttachment(attachment: BotMessageAttachment): BlueBubblesOutboundAttachment {
  return {
    data: attachment.data,
    fetchUrl: attachment.fetchUrl,
    mimeType: attachment.mimeType,
    name: attachment.name,
  };
}

class ImessageWebhookClient implements PlatformClient {
  readonly id = 'imessage';
  readonly applicationId: string;

  private api: BlueBubblesApiClient;
  private config: BotProviderConfig;
  private context: BotPlatformRuntimeContext;
  private credentials: ImessageCredentials;

  constructor(config: BotProviderConfig, context: BotPlatformRuntimeContext) {
    this.config = config;
    this.context = context;
    this.applicationId = config.applicationId;
    this.credentials = resolveCredentials(config.credentials);
    this.api = new BlueBubblesApiClient(this.credentials);
  }

  async start(): Promise<void> {
    log('Starting iMessage appId=%s', this.applicationId);
    await updateBotRuntimeStatus({
      applicationId: this.applicationId,
      platform: this.id,
      status: BOT_RUNTIME_STATUSES.starting,
    });

    try {
      await this.api.ping();
      if (!this.context.appUrl?.trim()) {
        throw new Error('APP_URL is required to register the BlueBubbles webhook');
      }

      const webhookUrl = buildWebhookUrl(
        this.context.appUrl,
        this.applicationId,
        this.credentials.webhookSecret,
      );
      await this.api.registerWebhook(webhookUrl, ['new-message']);

      await updateBotRuntimeStatus({
        applicationId: this.applicationId,
        platform: this.id,
        status: BOT_RUNTIME_STATUSES.connected,
      });

      log('iMessage appId=%s ready, webhookUrl=%s', this.applicationId, webhookUrl);
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
    log('Stopping iMessage appId=%s', this.applicationId);
    await updateBotRuntimeStatus({
      applicationId: this.applicationId,
      platform: this.id,
      status: BOT_RUNTIME_STATUSES.disconnected,
    });
  }

  createAdapter(): Record<string, any> {
    return {
      imessage: createImessageAdapter({
        ...this.credentials,
        botUserId: this.config.settings?.userId as string | undefined,
      }),
    };
  }

  getMessenger(platformThreadId: string): PlatformMessenger {
    const chatGuid = decodeThread(platformThreadId);
    return {
      createMessage: async (content) => {
        const text = messengerContentText(content);
        const attachments = typeof content === 'string' ? undefined : content.attachments;

        if (text.trim()) {
          await this.api.sendText(chatGuid, text);
        }

        for (const attachment of attachments ?? []) {
          await this.api.sendAttachment(chatGuid, toBlueBubblesAttachment(attachment));
        }
      },
      editMessage: async (_messageId, content) => {
        await this.getMessenger(platformThreadId).createMessage(content);
      },
      removeReaction: () => Promise.resolve(),
      triggerTyping: async () => {
        try {
          await this.api.startTyping(chatGuid);
        } catch (error) {
          log('triggerTyping failed: %O', error);
        }
      },
    };
  }

  async extractFiles(message: Message): Promise<AttachmentSource[] | undefined> {
    const attachments = ((message as any).attachments ?? []) as Array<{
      raw?: BlueBubblesAttachment;
    }>;
    const candidates = attachments
      .map((attachment) => ({
        guid: resolveAttachmentGuid(attachment.raw),
        raw: attachment.raw,
      }))
      .filter((entry): entry is { guid: string; raw: BlueBubblesAttachment } =>
        Boolean(entry.guid && entry.raw),
      );

    if (candidates.length === 0) return undefined;

    const results = await Promise.all(
      candidates.map(async ({ guid, raw }): Promise<AttachmentSource | undefined> => {
        try {
          const downloaded = await this.api.downloadAttachment(guid);
          return {
            buffer: downloaded.buffer,
            mimeType: downloaded.mimeType ?? raw.mimeType ?? 'application/octet-stream',
            name: resolveAttachmentName(raw),
            size: downloaded.buffer.length,
          };
        } catch (error) {
          log('extractFiles: downloadAttachment failed for guid=%s: %O', guid, error);
          return undefined;
        }
      }),
    );

    const sources = results.filter((source): source is AttachmentSource => Boolean(source));
    return sources.length > 0 ? sources : undefined;
  }

  extractChatId(platformThreadId: string): string {
    return decodeThread(platformThreadId);
  }

  formatMarkdown(markdown: string): string {
    return stripMarkdown(markdown);
  }

  formatReply(body: string, stats?: UsageStats): string {
    if (!stats || !this.config.settings?.showUsageStats) return body;
    return `${body}\n\n${formatUsageStats(stats)}`;
  }

  parseMessageId(compositeId: string): string {
    return compositeId;
  }
}

export class ImessageClientFactory extends ClientFactory {
  createClient(config: BotProviderConfig, context: BotPlatformRuntimeContext): PlatformClient {
    return new ImessageWebhookClient(config, context);
  }

  async validateCredentials(
    credentials: Record<string, string>,
    _settings?: Record<string, unknown>,
    applicationId?: string,
  ): Promise<ValidationResult> {
    const errors: Array<{ field: string; message: string }> = [];
    if (!credentials.serverUrl?.trim()) {
      errors.push({ field: 'serverUrl', message: 'BlueBubbles Server URL is required' });
    }
    if (!credentials.password?.trim()) {
      errors.push({ field: 'password', message: 'BlueBubbles Password is required' });
    }
    if (!credentials.webhookSecret?.trim()) {
      errors.push({ field: 'webhookSecret', message: 'Webhook Secret is required' });
    }
    if (!applicationId?.trim()) {
      errors.push({ field: 'applicationId', message: 'Application ID is required' });
    }
    if (errors.length > 0) return { errors, valid: false };

    try {
      const api = new BlueBubblesApiClient({
        password: credentials.password,
        serverUrl: credentials.serverUrl,
      });
      await api.ping();
      return { valid: true };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to authenticate with BlueBubbles';
      return {
        errors: [{ field: 'serverUrl', message }],
        valid: false,
      };
    }
  }
}

export const imessageTestInternals = {
  buildWebhookUrl,
  decodeThread,
};
