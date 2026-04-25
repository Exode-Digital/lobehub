# WhatsApp Cloud API – Bot Integration Notes

This is a quick orientation map for engineers working on the WhatsApp adapter.
Authoritative documentation:

- Cloud API overview: <https://developers.facebook.com/docs/whatsapp/cloud-api>
- Webhook payload schema: <https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples>
- Send Messages API: <https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages>

## Credentials

| Field                               | Source                                                                                                    | Notes                                                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `applicationId` (Phone Number ID)   | "WhatsApp" tab in the Meta App dashboard                                                                  | Numeric. Used as the `applicationId` for routing webhooks (`/api/agent/webhooks/whatsapp/<phoneNumberId>`). |
| `accessToken`                       | System User → "Generate token" with `whatsapp_business_messaging` + `whatsapp_business_management` scopes | Long-lived. Bearer header for every Graph call.                                                             |
| `verifyToken`                       | Operator-chosen secret that they paste into Meta when configuring the webhook                             | Echoed in `hub.verify_token` during the GET handshake.                                                      |
| `appSecret` (optional, recommended) | Meta App → Basic Settings                                                                                 | Used to validate `X-Hub-Signature-256` on every inbound POST.                                               |

## Webhook lifecycle

1. **GET handshake** – Meta sends `?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…`.
   The adapter responds `200 text/plain` with the verbatim challenge if and only if
   the verify token matches.
2. **POST notification** – Meta sends a JSON body with `object: "whatsapp_business_account"`
   and one or more `entry[].changes[]`. We only handle `field === "messages"`.
3. **Signature validation** – when `appSecret` is set, every POST must carry an
   `X-Hub-Signature-256` header equal to `sha256=` + HMAC-SHA256(rawBody, appSecret).
   Mismatched signatures get a 401 and are dropped.

## Payload shape (inbound)

```jsonc
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "<WABA_ID>",
      "changes": [
        {
          "field": "messages",
          "value": {
            "messaging_product": "whatsapp",
            "metadata": { "phone_number_id": "<APP_PHONE_ID>" },
            "contacts": [{ "wa_id": "15551234567", "profile": { "name": "Jane" } }],
            "messages": [
              {
                "from": "15551234567",
                "id": "wamid.XXX",
                "timestamp": "1700000000",
                "type": "text",
                "text": { "body": "hi bot" },
              },
            ],
          },
        },
      ],
    },
  ],
}
```

Media messages (`image`, `video`, `audio`, `document`, `sticker`) carry a
`{type: { id, mime_type, sha256, caption?, filename? }}` payload. We only
ship metadata into the chat-sdk `Message`; bytes are fetched on demand by
the platform client's `extractFiles` via `GET /<mediaId>` → signed URL →
`GET <url>` (both with the same bearer header).

## Outbound

`POST /v21.0/<phoneNumberId>/messages` with

```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "text": { "body": "…", "preview_url": false },
  "to": "<wa_id>",
  "type": "text"
}
```

The response carries `messages: [{ id }]` — store the id if you need the
delivery / read status callback later.

## Capabilities

- **No edit / no delete** – Cloud API has no edit endpoint. The platform
  definition sets `supportsMessageEdit: false`; the bridge therefore skips
  the per-step progress edits and only emits the final reply.
- **Markdown** – rendered as the lightweight `*bold*` / `_italic_` /
  `~strike~` / `\``code`\` family. The platform client's `markdownToWhatsApp`
  translator handles the conversion.
- **Typing indicator** – the only way to surface a typing state is to mark
  the latest inbound message as read with `typing_indicator: { type: 'text' }`.
  The indicator stays up for \~25 s or until we send the next outbound
  message, whichever comes first.
- **Reactions** – Cloud API supports message reactions but not in a way
  that maps cleanly to our 👀 → ✏️ flow, so we no-op here.

## Operator-facing setup

Webhook URL must be configured manually in the Meta App dashboard
(`WhatsApp → Configuration → Webhooks`). Paste the channel detail page's
"Webhook URL" into the _Callback URL_ field and the `verifyToken` into the
_Verify token_ field, then subscribe to the `messages` field.
