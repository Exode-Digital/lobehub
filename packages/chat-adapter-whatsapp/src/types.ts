// ---------- Adapter config ----------

export interface WhatsAppAdapterConfig {
  /**
   * Long-lived System User Access Token used to call the Graph API.
   * @see https://developers.facebook.com/docs/whatsapp/cloud-api/get-started
   */
  accessToken: string;
  /**
   * Meta App Secret. Required to validate `X-Hub-Signature-256` on inbound
   * webhook deliveries. When provided, requests with a missing or invalid
   * signature are rejected with HTTP 401.
   */
  appSecret?: string;
  /**
   * Optional Graph API base URL override (default `https://graph.facebook.com`).
   */
  graphApiBaseUrl?: string;
  /**
   * Optional Graph API version segment, e.g. `v21.0` (default `v21.0`).
   */
  graphApiVersion?: string;
  /**
   * The Phone Number ID returned by the Cloud API setup. Used as the bot's
   * own identifier and as the path prefix for outbound `POST /{phoneNumberId}/messages`.
   */
  phoneNumberId: string;
  /**
   * The verify token agreed with Meta during webhook setup. Echoed in the
   * GET verification handshake — the adapter responds with `hub.challenge`
   * only when `hub.verify_token` matches this value.
   */
  verifyToken: string;
}

export interface WhatsAppThreadId {
  /**
   * The end-user's `wa_id` (in practice the E.164 phone number without `+`).
   */
  id: string;
  /**
   * Currently WhatsApp Cloud API only delivers 1:1 conversations to bots, but
   * we keep the discriminator open for future group support.
   */
  type: 'single';
}

// ---------- Webhook payload types (subset of Meta's spec we use) ----------

export type WhatsAppMessageType =
  | 'audio'
  | 'button'
  | 'contacts'
  | 'document'
  | 'image'
  | 'interactive'
  | 'location'
  | 'reaction'
  | 'sticker'
  | 'text'
  | 'unknown'
  | 'unsupported'
  | 'video'
  | 'voice';

export interface WhatsAppMediaAttachment {
  caption?: string;
  filename?: string;
  /** Numeric Graph API media id — fetch URL via `GET /{id}` and download with auth header. */
  id: string;
  mime_type?: string;
  sha256?: string;
}

export interface WhatsAppText {
  body: string;
}

export interface WhatsAppContextRef {
  from?: string;
  id?: string;
}

export interface WhatsAppMessage {
  audio?: WhatsAppMediaAttachment;
  /** Reply context — present when the user quoted a previous message. */
  context?: WhatsAppContextRef;
  document?: WhatsAppMediaAttachment;
  /** E.164 phone of the sender, no `+`. */
  from: string;
  /** wamid.xxx — globally unique. */
  id: string;
  image?: WhatsAppMediaAttachment;
  sticker?: WhatsAppMediaAttachment;
  text?: WhatsAppText;
  /** Unix seconds (string in payload). */
  timestamp: string;
  type: WhatsAppMessageType;
  video?: WhatsAppMediaAttachment;
  voice?: WhatsAppMediaAttachment;
}

export interface WhatsAppContact {
  profile?: { name?: string };
  /** wa_id — typically equals `from`. */
  wa_id: string;
}

export interface WhatsAppMetadata {
  display_phone_number?: string;
  phone_number_id: string;
}

export interface WhatsAppValueMessages {
  contacts?: WhatsAppContact[];
  messages?: WhatsAppMessage[];
  messaging_product: 'whatsapp';
  metadata: WhatsAppMetadata;
  /** Delivery / read receipts — we ignore these but keep the shape for completeness. */
  statuses?: Array<Record<string, unknown>>;
}

export interface WhatsAppChange {
  field: string;
  value: WhatsAppValueMessages;
}

export interface WhatsAppEntry {
  changes: WhatsAppChange[];
  /** WhatsApp Business Account ID. */
  id: string;
}

export interface WhatsAppWebhookPayload {
  entry: WhatsAppEntry[];
  object: 'whatsapp_business_account';
}

// ---------- Outbound API ----------

export interface WhatsAppSendTextRequest {
  messaging_product: 'whatsapp';
  recipient_type: 'individual';
  text: { body: string; preview_url?: boolean };
  to: string;
  type: 'text';
}

export interface WhatsAppSendResponse {
  contacts?: Array<{ input: string; wa_id: string }>;
  /** Cloud API error envelope. */
  error?: {
    code?: number;
    error_data?: { details?: string };
    fbtrace_id?: string;
    message?: string;
    type?: string;
  };
  messages?: Array<{ id: string; message_status?: string }>;
}

export interface WhatsAppMediaUrlResponse {
  file_size?: number;
  id?: string;
  messaging_product?: 'whatsapp';
  mime_type?: string;
  sha256?: string;
  url?: string;
}
