import assert from "node:assert/strict";
import { test } from "node:test";
import { EventType } from "@ag-ui/core";
import { defineTool } from "@copilotkit/runtime/v2";
import { lastValueFrom, toArray } from "rxjs";
import { z } from "zod";
import { modelKeyConfigured } from "../apps/server/src/engine/model-provider.ts";
import { tanstackAgent } from "../apps/server/src/engine/tanstack-agent.ts";

for (const provider of ["openrouter", "nvidia"] as const) {
  test(`${provider} streams text and tools with its own credential and endpoint`, async (t) => {
    const keyName = provider === "openrouter" ? "OPENROUTER_API_KEY" : "NVIDIA_API_KEY";
    const previous = process.env[keyName];
    process.env[keyName] = `fixture-${provider}-key`;
    t.after(() => {
      if (previous === undefined) delete process.env[keyName];
      else process.env[keyName] = previous;
    });
    const requests: { url: string; auth: string | null; body: Record<string, unknown> }[] = [];
    t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push({
        url: request.url,
        auth: request.headers.get("authorization"),
        body: await request.json(),
      });
      const first = requests.length === 1;
      const deltas = first
        ? [
            {
              role: "assistant",
              tool_calls: [
                {
                  index: 0,
                  id: "call_lookup",
                  type: "function",
                  function: { name: "lookup", arguments: '{"topic":"hello"}' },
                },
              ],
            },
          ]
        : [{ role: "assistant", content: "Gateway works." }];
      const chunks = [
        ...deltas.map((delta) => ({ delta, finish_reason: null })),
        { delta: {}, finish_reason: first ? "tool_calls" : "stop" },
      ];
      const sse = chunks
        .map(
          (choice) =>
            `data: ${JSON.stringify({ id: `chat-${requests.length}`, object: "chat.completion.chunk", created: 1000, model: "vendor/model", choices: [{ index: 0, ...choice }] })}\n\n`,
        )
        .join("");
      return new Response(`${sse}data: [DONE]\n\n`, {
        headers: { "Content-Type": "text/event-stream" },
      });
    });
    let toolRuns = 0;
    const agent = tanstackAgent({
      model: `${provider}/vendor/model`,
      maxSteps: 3,
      prompt: "Look up the topic and reply.",
      tools: [
        defineTool({
          name: "lookup",
          description: "Look up a topic",
          parameters: z.object({ topic: z.string() }),
          execute: async ({ topic }) => {
            toolRuns++;
            return { topic, result: "found" };
          },
        }),
      ],
    });
    const events = await lastValueFrom(
      agent
        .run({
          threadId: "gateway-test",
          runId: "gateway-run",
          messages: [{ id: "message", role: "user", content: "Hello" }],
          state: {},
          context: [],
          tools: [],
          forwardedProps: {},
        })
        .pipe(toArray()),
    );
    assert.equal(
      events.find((event) => event.type === EventType.RUN_ERROR),
      undefined,
    );
    assert.ok(events.some((event) => event.type === EventType.RUN_FINISHED));
    assert.ok(events.some((event) => "delta" in event && event.delta === "Gateway works."));
    assert.equal(toolRuns, 1);
    assert.equal(requests.length, 2);
    for (const request of requests) {
      assert.equal(
        request.url,
        provider === "openrouter"
          ? "https://openrouter.ai/api/v1/chat/completions"
          : "https://integrate.api.nvidia.com/v1/chat/completions",
      );
      assert.equal(request.auth, `Bearer fixture-${provider}-key`);
      assert.equal(request.body.model, "vendor/model");
      assert.equal(request.body.stream, true);
    }
    assert.match(JSON.stringify(requests[1].body.messages), /"role":"tool"/);
    assert.match(JSON.stringify(requests[1].body.messages), /found/);
  });
}

test("readiness requires the key belonging to the selected model", () => {
  const before = { ...process.env };
  try {
    process.env.OPENAI_API_KEY = "unrelated-key";
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.NVIDIA_API_KEY;
    assert.equal(modelKeyConfigured("openrouter/vendor/model"), false);
    assert.equal(modelKeyConfigured("nvidia/vendor/model"), false);
    process.env.OPENROUTER_API_KEY = "fixture-router";
    assert.equal(modelKeyConfigured("openrouter/vendor/model"), true);
    assert.equal(modelKeyConfigured("nvidia/vendor/model"), false);
    process.env.NVIDIA_API_KEY = "fixture-nvidia";
    assert.equal(modelKeyConfigured("NVIDIA/vendor/model"), true);
    assert.equal(modelKeyConfigured("nvidia/"), false);
    assert.equal(modelKeyConfigured("unsupported/model"), false);
  } finally {
    for (const key of ["OPENAI_API_KEY", "OPENROUTER_API_KEY", "NVIDIA_API_KEY"]) {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    }
  }
});
