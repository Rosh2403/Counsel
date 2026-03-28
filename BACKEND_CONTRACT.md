# Counsel Backend Contract (Frontend Handoff)

## Convex Public Functions

### `research:startResearch`
- Type: mutation
- Args:
  - `query: string`
- Returns:
  - `threadId: Id<"threads">`
- Behavior:
  - Creates thread + three source rows (`sso`, `mas`, `cases`)
  - Starts background research workflow

### `research:retrySource`
- Type: mutation
- Args:
  - `threadId: Id<"threads">`
  - `sourceType: "sso" | "mas" | "cases"`
  - `query?: string` (defaults to thread query)
  - `keywords?: string` (defaults to empty)
- Returns:
  - `"retry_scheduled"`
- Behavior:
  - Schedules retry of a single source
  - Sets thread status to `searching`

### `research:generateBriefNow`
- Type: mutation
- Args:
  - `threadId: Id<"threads">`
- Returns:
  - `"brief_generation_scheduled"`
- Behavior:
  - Manually triggers synthesize/store brief flow
  - Useful when auto-brief is disabled

### `queries:getThread`
- Type: query
- Args:
  - `threadId: Id<"threads">`
- Returns:
  - Thread document

### `queries:getSources`
- Type: query
- Args:
  - `threadId: Id<"threads">`
- Returns:
  - Array of source documents for that thread

## Thread Status Lifecycle
- `analyzing`
- `searching`
- `evaluating`
- `synthesizing`
- `complete`
- `error`

## Source Status Lifecycle
- `pending`
- `searching`
- `complete`
- `error`

## Source Shape (important fields)
- `type: "sso" | "mas" | "cases"`
- `status`
- `query`
- `url`
- `streamingUrl?: string` (live TinyFish browser iframe URL)
- `progressSteps?: { text: string; timestamp: number }[]`
- `results?: any`
- `retryCount: number`
- `error?: { kind, message, helpMessage }`

## `results` Expected JSON Shapes

### SSO (`type = "sso"`)
```json
{
  "statutes": [
    {
      "act_name": "string",
      "part": "string",
      "section_number": "string",
      "section_title": "string",
      "text": "string",
      "url": "string"
    }
  ]
}
```

### MAS (`type = "mas"`)
```json
{
  "regulations": [
    {
      "title": "string",
      "date": "string",
      "type": "string",
      "summary": "string",
      "url": "string"
    }
  ]
}
```

### Cases (`type = "cases"`)
```json
{
  "cases": [
    {
      "case_name": "string",
      "citation": "string",
      "date": "string",
      "court": "string",
      "summary": "string",
      "holdings": "string",
      "statutes_cited": "string",
      "url": "string"
    }
  ]
}
```

## No-OpenAI Fallback
- If `OPENAI_API_KEY` is missing:
  - Source searches still run via TinyFish.
  - Brief is generated using deterministic fallback markdown.
  - App still reaches `complete`.
