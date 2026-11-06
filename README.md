# pi-web-search

DeepSeek web search and fetch tools for [pi](https://pi.dev).

This extension only uses DeepSeek's standalone Search & Fetch API, so no model
completion is involved.

## Tools

### `web_search`

Calls `POST /v1/tools/search` and returns the response's `results` array as-is:
the model sees the raw JSON array (one object per hit, all fields included), not
a reformatted summary.

The tool accepts `keyword` and optional `question`. `question` is the user's
original question; it defaults to `keyword`.

Fixed request defaults:

```json
{
  "count": 10,
  "need_content": false
}
```

The query is passed through unchanged and supports DeepSeek search operators:

| Operator | Example |
|---|---|
| `site:` | `DeepSeek site:github.com` |
| `-site:` | `DeepSeek -site:example.com` |
| `-` | `DeepSeek -广告` |
| `-"..."` | `DeepSeek -"release notes"` |
| `"..."` | `DeepSeek "精确短语"` |
| `lang:` | `DeepSeek lang:zh,en` |
| `after:` | `DeepSeek after:2025` |
| `before:` | `DeepSeek before:2026-06-01` |

### `web_fetch`

Calls `POST /v1/tools/fetch` for one URL and returns the raw JSON response
(`{"title": ..., "content": ...}`) to the model.

Both tool responses are hidden from the TUI; only the model receives them.

## Install

```bash
pi install npm:pi-web-search
```

The current conversation model can be anything. The tools resolve credentials
from Pi's `deepseek` provider independently, so no model id is sent to the
Search or Fetch API. Authenticate DeepSeek with `/login` or
`DEEPSEEK_API_KEY`.

A configured DeepSeek provider base URL is preserved; only its API suffix
(`/v1`, `/anthropic`, …) is stripped so the `/v1/tools/*` routes stay on the
same origin.

## Scope

The implementation is intentionally small:

- DeepSeek only
- two tools
- fixed defaults
- no config file
- no retries, URL validation, custom timeouts, cancellation, or truncation

## Test

```bash
npm test
```

## License

MIT
