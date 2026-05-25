# iMessage via BlueBubbles – Bot Integration Notes

Authoritative references:

- BlueBubbles REST API and webhooks: <https://docs.bluebubbles.app/server/developer-guides/rest-api-and-webhooks>
- BlueBubbles Server source: <https://github.com/BlueBubblesApp/bluebubbles-server>

## Architecture

LobeHub does not speak to Apple's iMessage service directly. Operators host
BlueBubbles Server on a Mac signed into Messages. BlueBubbles observes the
local iMessage database / event stream, delivers `new-message` webhooks to
LobeHub, and accepts REST calls for replies.

```
iMessage user -> macOS Messages -> BlueBubbles Server -> LobeHub webhook
LobeHub agent -> BlueBubbles REST API -> macOS Messages -> iMessage user
```

## Credentials

| Field           | Source                             | Notes                                                                                                                             |
| --------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `applicationId` | Operator-chosen LobeHub identifier | Used only in `/api/agent/webhooks/imessage/:applicationId`. It does not need to match a BlueBubbles value.                        |
| `serverUrl`     | BlueBubbles public URL             | LobeHub appends `/api/v1/...`. HTTPS is recommended because credentials travel over the network.                                  |
| `password`      | BlueBubbles Server password        | Sent as the `password` query parameter. BlueBubbles also accepts `token` / `guid`, but this adapter uses `password` consistently. |
| `webhookSecret` | Operator-generated                 | BlueBubbles webhooks are not signed, so LobeHub requires `?secret=<value>` on inbound webhook URLs.                               |

## Webhook lifecycle

1. `start()` calls `GET /api/v1/ping?password=...` to verify credentials.
2. `start()` registers `POST /api/v1/webhook` with `{ url, events: ["new-message"] }`.
3. BlueBubbles posts `{ "type": "new-message", "data": <message> }`.
4. The adapter rejects missing / mismatched `secret`, ignores `isFromMe`
   messages to avoid loops, enriches the payload with
   `GET /api/v1/message/:guid?with=chats,attachments` when the webhook does
   not include `chats`, and dispatches to Chat SDK as `imessage:<chatGuid>`.

## Capabilities

- Text reply: `POST /api/v1/message/text`
- Attachment reply: `POST /api/v1/message/attachment`
- Attachment download: `GET /api/v1/attachment/:guid/download`
- Read recent messages: `GET /api/v1/chat/:guid/message`
- Search messages: `POST /api/v1/message/query`
- Channel metadata: `GET /api/v1/chat/:guid`

Typing indicators call `POST /api/v1/chat/:guid/typing`, which requires
BlueBubbles Private API. Failures are logged and ignored.

## Limitations

- iMessage has no general bot mention primitive. Group wake behavior relies
  on watch keywords and group policy, not native `@bot` mentions.
- Message editing, deleting, reactions, pins, polls, and threads are not
  exposed as LobeHub bot capabilities for iMessage.
- BlueBubbles advanced send features may require the Private API / SIP changes
  on the Mac. LobeHub's basic text and attachment path uses AppleScript by
  default.
