# n8n-nodes-apimaster

An [n8n](https://n8n.io/) community node for chat, image and video generation through
[APIMaster](https://apimaster.ai/docs) or any other OpenAI-compatible gateway.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/)
workflow automation platform.

[Installation](#installation) · [Operations](#operations) · [Credentials](#credentials) ·
[Compatibility](#compatibility) · [Usage](#usage) · [Resources](#resources)

## Installation

Follow the
[community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/):

**Settings → Community Nodes → Install**, then enter:

```
@apimaster/n8n-nodes-apimaster
```

Self-hosted with npm:

```bash
npm install @apimaster/n8n-nodes-apimaster
```

## Operations

### Chat

Send a prompt and get a completion. Supports a system prompt, temperature / top-p /
max-tokens, and a JSON output mode that parses the reply straight into the item.

**Message History** takes a JSON array of earlier turns. It exists because this gateway
keeps no server-side conversation state — multi-turn only works when every request
carries the full history. A node that hid this would silently lose context in production.

### Image

Text-to-image and image-to-image, with reference images and an inpainting mask. Size is
an aspect ratio (1:1, 16:9, 9:16, 4:3, 3:4, 21:9) and resolution is 1K / 2K / 4K. The
result is downloaded into a binary property by default, because generated media URLs
expire.

**Submit and Poll** switches to the asynchronous endpoint. Use it for 2K and 4K: a single
synchronous request at those sizes can exceed the gateway's own timeout and come back as
a 408.

### Video

Text-to-video and image-to-video. Duration 4–20s, 720p (1024p/1080p on the pro models),
landscape or portrait.

Two operations:

- **Generate** — submits the job and, by default, waits for it. *Max Wait* caps how long
  the node blocks; if it runs out, the error tells you the task ID rather than losing it.
- **Get** — checks a task ID from an earlier run. Turn *Wait for Completion* off, put a
  Wait node in between, and poll with this for long jobs instead of holding a worker.

Always set **Aspect Ratio** when you pass a reference image: a portrait reference with no
aspect ratio is treated as 16:9 and comes back letterboxed.

## Credentials

Create an **APIMaster API** credential with:

| Field | Value |
| --- | --- |
| API Key | from the [console](https://apimaster.ai/docs/getting-started/api-key) |
| Base URL | `https://apimaster.ai/v1` (or any other OpenAI-compatible gateway) |

Press **Test** — it calls `/models`. If that fails, no workflow using this node will work
either, and the two usual causes are a key copied with a trailing newline (401) or a base
URL missing the `/v1` suffix (404).

## Compatibility

Tested against n8n's current node API (`n8nNodesApiVersion: 1`) on Node.js 20 and 22.

## Usage

### Batch image generation from a spreadsheet

```
Google Sheets (read prompts)
  → APIMaster (Image: Generate, Model: gpt-image-2, Size: 16:9)
  → Google Drive (upload binary)
```

Each row becomes one image; the node emits one item per input item with the file in
`data`.

### Long video jobs without blocking a worker

```
APIMaster (Video: Generate, Wait for Completion: off)
  → Wait (2 minutes)
  → APIMaster (Video: Get, Task ID: {{ $json.taskId }})
  → IF (status == "completed") → Drive, else → back to Wait
```

### Model IDs

Every resource has a **Model ID Override** field next to the dropdown. Dropdowns are
populated from `/models` at edit time; the override lets you use an id that was added
after this node's release, or reference one from an expression.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [APIMaster API reference](https://apimaster.ai/docs)
- [Image API](https://apimaster.ai/docs/api/images) · [Video API](https://apimaster.ai/docs/api/videos)

## Development

```bash
npm install
npm run build      # tsc + copy icons into dist
npm run lint       # the same eslint-plugin-n8n-nodes-base ruleset used for verification
npm test           # build, then structural tests against dist/
```

Tests need no n8n instance and no API key: they load the built node and check the things
that otherwise only surface as a broken parameter panel in the editor — duplicate
parameter names, dangling `loadOptions` references, unsorted option lists, missing
credential wiring.

## License

[MIT](LICENSE.md)
