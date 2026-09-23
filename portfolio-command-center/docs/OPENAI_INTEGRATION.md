# OpenAI Integration — Phase 3

Status: implemented, read-only, **no live OpenAI call has been made from
this environment** — `OPENAI_API_KEY` is not set here. See
[§9 Live testing](#9-live-testing) for exactly what that means and what's
required to run one.

## 1. What this is — and isn't

Portfolio AI is a tool-calling agent grounded in this user's actual
portfolio, not a general chatbot with a portfolio-flavored system prompt.
Every fact it states about the account comes from a backend tool call made
during that conversation turn; it has no other source of truth about
holdings, balances, or prices. See §5 for how that's enforced, not just
requested.

## 2. Architecture

```
AIProvider (interface)
      ↓
OpenAIProvider ⟶ OpenAI Responses API
      ↑
PortfolioAiAgent (orchestration loop)
      ↓
ToolExecutor ⟶ PortfolioDataSource / IbkrPortfolioDataSource / MarketDataSource
      ↓                        (Phase 1/2 services — unchanged)
ConversationService ⟶ Postgres (AIConversation / AIMessage)
```

- **`AIProvider`** (`apps/api/src/domain/data-sources/ai-provider.ts`) — a
  provider-agnostic "one model turn" contract: send message history + tool
  definitions, get back either a final text message or a set of tool calls
  to execute and feed back. Nothing above this interface knows it's OpenAI.
- **`OpenAIProvider`** (`apps/api/src/integrations/openai/openai-provider.ts`)
  — the only file that imports the `openai` SDK. Uses the **Responses API**
  (`client.responses.create`), OpenAI's current recommended API — a superset
  of the older Chat Completions API with first-class multi-turn tool-calling
  support. Maps our `AIChatMessage[]` to the SDK's `input` array (function
  calls become `type: "function_call"` items, results become
  `type: "function_call_output"` items) and our system prompt to the
  dedicated `instructions` parameter.
- **`PortfolioAiAgent`** (`apps/api/src/integrations/openai/agent.ts`) — the
  tool-calling loop. Provider-agnostic: written entirely against
  `AIProvider`, testable with a fake one (see `agent.test.ts`). Capped at 6
  iterations so a provider that only ever requests tools can't loop forever.
  Persists every message (assistant tool-call intent, tool result, final
  reply) incrementally via `ConversationService`, so a mid-loop failure
  doesn't lose history.
- **`TOOL_EXECUTORS`** (`apps/api/src/integrations/openai/tool-executor.ts`)
  — one function per tool, each calling an existing Phase 1/2 service
  (`PortfolioDataSource`, `IbkrPortfolioDataSource`, `MarketDataSource`).
  **No tool calls IBKR directly** — the same rule as the rest of the app.
- **`ConversationService`** — `AIConversation`/`AIMessage` persistence with
  per-user ownership checks (a conversation belonging to another user reads
  as not-found, never exposed).

## 3. Model configuration

`OPENAI_MODEL` (env var, default `gpt-5.4-mini` if unset) is read once in
`apps/api/src/config.ts` and passed into `OpenAIProvider`'s constructor —
the model ID isn't hardcoded anywhere else. `gpt-5.4-mini` was chosen from
the model list published by the installed `openai` SDK itself (v7.21.0,
`resources/shared.d.ts`) as a current-generation, cost-effective,
tool-calling-capable default; it is not guaranteed to remain available
forever, which is exactly why it's an overridable env var rather than a
constant sprinkled through the codebase. If it's retired, set `OPENAI_MODEL`
to whatever OpenAI's current model list recommends — no code change needed.

## 4. Tools

| Tool | Backs onto | Notes |
|---|---|---|
| `getAccountSummary` | `PortfolioDataSource.getAccountSummary` | Real IBKR data (Phase 2) when connected. |
| `getPositions` | `PortfolioDataSource.getPositions` | Same. |
| `getPosition(symbol)` | `getPositions`, filtered | Returns `data: null` with a reason when the symbol isn't currently held — never a fabricated position. |
| `getPortfolioAllocation` | `IbkrPortfolioDataSource.getAllocation` | Sector/asset-class weights. |
| `getPortfolioPerformance` | `IbkrPortfolioDataSource.getPerformance` | Always `unavailable` in this phase — no snapshot history exists to compute it from yet. |
| `getMarketData(symbol)` | Held positions' live price, or `MarketDataSource.getQuote` | For a symbol you hold, reuses the price IBKR already returned with the position (no extra IBKR call); for anything else, honestly `unavailable` — arbitrary-symbol market data is Phase 4. |
| `getRecentTrades` | — | Always `unavailable`: trade-history sync isn't built yet. |
| `getOpenOrders` | — | Always `unavailable`: order sync isn't built yet. |
| `getHistoricalPortfolioSnapshots` | — | Always `unavailable`: no scheduled snapshot job exists yet. |
| `getRiskMetrics` | — | Always `unavailable`: the risk engine is Phase 5. |
| `getPortfolioContext` | Summary + positions + allocation, combined | A single efficient call for broad questions ("analyze my portfolio") instead of the model making 3 separate calls. |

Every tool result is a `LiveData<T>` envelope (`{data, meta: {source,
timestamp, status, reason?}}`) — the same structure Phase 2 established for
IBKR data, reused rather than invented anew. `status` is one of `live`,
`cached`, or `unavailable`; the system prompt (§6) tells the model exactly
how to treat each one, and `agent.test.ts` verifies the tool's real
status/reason string is what actually reaches the model — not a summary or
a reinterpretation of it.

The four "always unavailable" tools are real functions, not mocks: they
return the same honest envelope shape a live integration failure would,
with a reason naming the missing phase. This matches the pattern Phase 1/2
already used for not-yet-built integrations (`NotConnectedMarketDataSource`,
etc.) — extended here to the AI tool layer rather than reinvented.

## 5. Why the AI can't invent data (mechanically, not just by instruction)

Three layers, not one:

1. **The tools themselves** only ever return what the underlying service
   returned — `tool-executor.ts` has no code path that fabricates a value.
2. **The agent loop** serializes the tool's exact result (including
   `status`/`reason`) into the message sent back to the model — it doesn't
   summarize, round, or omit the unavailable case.
3. **The system prompt** (§6) explicitly forbids treating anything other
   than a tool result as portfolio fact, and forbids answering a
   current-state question from conversation memory alone.

A system prompt alone is a request the model could in principle ignore;
layers 1 and 2 are what's actually verified by `tool-executor.test.ts` and
`agent.test.ts`. Whether the model itself reliably honors layer 3 is what
§9's live test is for — that can only be verified against a real
`OPENAI_API_KEY`, which isn't available here.

## 6. System prompt

`apps/api/src/integrations/openai/system-prompt.ts`, sent via the Responses
API's `instructions` parameter on every call (not baked into a stored
"system" conversation message). It sets:

- **Persona**: a portfolio research assistant, not a general chatbot.
- **Response language**: Hebrew by default (tickers/technical terms may
  stay in English); English if the user writes in English.
- **The anti-invention rule** (§5).
- **Claim labeling**: every substantive statement must be identifiable as
  FACT / CURRENT DATA / ANALYST ESTIMATE / AI INTERPRETATION / SCENARIO /
  UNCERTAINTY.
- **Style**: concise, numbers over vague description, optional headings
  (FACTS / WHAT CHANGED / WHY IT MATTERS / RISKS / CATALYSTS / SCENARIOS /
  AI VIEW) used only when they add structure, never padded.
- **Scope**: no news/analyst/catalyst data exists yet (Phase 4); strictly
  read-only, no trading capability, ever.

`system-prompt.test.ts` asserts the prompt actually contains each of these
rules as text, so a future edit that accidentally drops one fails CI.

## 7. Conversations

`AIConversation` / `AIMessage` (schema from Phase 1, unchanged this phase).
Endpoints (all under `/api/v1`, all requiring auth):

| Method | Path | Purpose |
|---|---|---|
| POST | `/ai/conversations` | Create a conversation (optional title). |
| GET | `/ai/conversations` | List the authenticated user's conversations. |
| GET | `/ai/conversations/:id` | Load one conversation with its messages. 404s (not 403) for another user's conversation — existence isn't leaked either. |
| POST | `/ai/conversations/:id/messages` | Send a message; runs the agent loop; returns the assistant's reply and which tools were used. |

The first message in a conversation with no title auto-titles it (a
60-character summary of that message) for the conversation list.

Continuing a conversation works because the agent rebuilds the full message
history (system prompt + every prior stored message) on each turn — the
model sees prior questions and answers, but §5/§6 stop it from treating
*prior data values* as still current; it must call the tool again for
anything time-sensitive.

## 8. Security

- `OPENAI_API_KEY` is read once from env in `config.ts`, passed only to
  `OpenAIProvider`'s constructor, never returned by any route, never logged
  (pino's redact config already covers `*.apiKey`/`*.secret` patterns from
  Phase 1), and never written to Postgres — `AIConversation`/`AIMessage`
  store only conversation content, not credentials.
- No IBKR credential, session cookie, or authentication secret is ever
  constructed into a message sent to OpenAI — the tool executors only ever
  return the same `LiveData<T>` shapes the REST API itself exposes to the
  frontend, nothing more privileged.
- Every AI route requires an authenticated session
  (`apps/api/src/auth/middleware.ts`, unchanged from Phase 1) and every
  conversation lookup is scoped to `request.user.id` — cross-user access is
  impossible by construction (`ConversationService.getConversationForUser`
  returns `null`, not another user's data, on a mismatch; verified in
  `apps/api/test/ai-conversations.test.ts`).

## 9. Live testing

`OPENAI_API_KEY` is not set anywhere in this environment (`.env`, shell, or
otherwise) — confirmed before writing this document. **No real OpenAI API
call has been made.** Per the task's own instruction for this case:

> OpenAI integration implemented; API key configuration required for live
> testing.

To run the real test described in the Phase 3 task spec ("what is the
current status of my portfolio?", expecting the AI to call tools and, if
IBKR is unavailable, say so explicitly):

1. Set `OPENAI_API_KEY` (and, for a real portfolio answer rather than an
   honest "IBKR unavailable" one, complete IBKR setup per
   `docs/IBKR_INTEGRATION.md` §9 first).
2. Restart the backend.
3. Open AI Chat and ask the question, or call
   `POST /api/v1/ai/conversations` then
   `POST /api/v1/ai/conversations/:id/messages`.
4. Check Settings → Connections / System Health — `checkOpenAi` only
   reports `operational` after that call actually succeeds (see
   `apps/api/src/domain/health/health-checks.ts`), the same honesty rule
   Phase 2 established for IBKR.

## 10. Cost controls

- `max_output_tokens: 2000` per model call (`openai-provider.ts`).
- Tool results sent back to the model are the same compact `LiveData<T>`
  shapes the REST API returns — no raw IBKR payloads, no unnecessary
  fields. `getPortfolioContext` exists specifically so a broad question
  costs one tool round-trip instead of three.
- The 6-iteration cap (§2) bounds the worst case for a single user message.
- `checkOpenAi`'s health check never makes a live call itself (§9) — it
  only reports the outcome of calls the user actually triggered, so
  Connections/System Health polling costs nothing.
- Conversation history sent to the model is exactly what's stored — no
  artificial truncation yet. If conversations grow very long this may need
  a token-budget-aware trim later; not needed at current expected usage
  (a personal portfolio assistant), so not built speculatively now.

## 11. Error handling

`apps/api/src/integrations/openai/errors.ts` classifies every failure
(`not_configured`, `invalid_api_key`, `rate_limited`, `timeout`,
`unavailable`, `malformed_response`, `unknown_openai_error`) into a safe
message — the same pattern as `integrations/ibkr/errors.ts`. The agent loop
catches any provider error and returns the classified safe message as the
assistant's reply (persisted like any other turn) rather than a raw 500 —
a user sees "Portfolio AI is temporarily unavailable" (in Hebrew, matching
the assistant's own voice), never a stack trace or the raw SDK error.
