# OpenRouter and NVIDIA deployment

This fork accepts both provider keys as server-only environment variables. Select
one active model with `MODEL`; it does not automatically send failed requests to
the other provider.

| Provider | Model setting example | Secret |
| --- | --- | --- |
| OpenRouter | `openrouter/openai/gpt-5` | `OPENROUTER_API_KEY` |
| NVIDIA hosted API | `nvidia/meta/llama-3.3-70b-instruct` | `NVIDIA_API_KEY` |

The part after `openrouter/` or `nvidia/` must be the exact model ID available to
your provider account, including its own vendor prefix. Select a model supporting
streaming and function/tool calls. Changing `MODEL` and restarting the server
switches providers; no app rebuild is needed.

Both adapters use Chat Completions and send each key only to its provider's
endpoint. `OPENAI_BASE_URL` does not override these two endpoints. An OpenAI
account or `OPENAI_API_KEY` is not required when using either provider.

The Render Blueprint asks for `MODEL`, `OPENROUTER_API_KEY`, `NVIDIA_API_KEY`, and
`CPK_INTELLIGENCE_API_KEY`. Keep every key in the API service environment. Never put
keys in the static website or an `EXPO_PUBLIC_` variable. CopilotKit Intelligence
is still required for conversation storage, separately from your model provider.

Hosting still uses the API, private browser, and static website from the upstream
Blueprint. No extra service or model proxy is added. API use is billed/limited by
the selected provider. Configure provider spending limits in that account.

Provider protocol tests exercise streaming replies, server tool execution,
follow-up tool results, endpoint selection, and credential isolation with mocked
provider responses. A live account smoke test is still needed after keys are
entered; these tests do not establish account credits or model availability.
