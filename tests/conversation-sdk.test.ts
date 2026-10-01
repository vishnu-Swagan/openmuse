import assert from "node:assert/strict";
import { test } from "node:test";
import { AbstractAgent } from "@ag-ui/client";
import { EventType } from "@ag-ui/core";
import { CopilotKitCore } from "@copilotkit/core";
import { of, throwError } from "rxjs";
import { ConversationQueue } from "../apps/mobile/src/conversation-queue.ts";
import { runConversationTurn } from "../apps/mobile/src/conversation-run.ts";

test("an emitted CopilotKit run error stops the queue even when runAgent resolves", async () => {
  let attempts = 0;
  class FailingAgent extends AbstractAgent {
    run() {
      attempts++;
      return throwError(() => new Error("Connection interrupted"));
    }
  }
  const agent = new FailingAgent({ agentId: "default" });
  const core = new CopilotKitCore({ agents__unsafe_dev_only: { default: agent } });
  const queue = new ConversationQueue();
  queue.enqueue({ id: "first", text: "First task" });
  queue.enqueue({ id: "second", text: "Second task" });
  await assert.rejects(
    queue.flush(() =>
      runConversationTurn(
        "default",
        () => core.runAgent({ agent }),
        (onError) => core.subscribe({ onError }),
      ),
    ),
    /Connection interrupted/,
  );
  assert.equal(attempts, 1);
  assert.equal(queue.getSnapshot().paused, true);
  assert.deepEqual(
    queue.getSnapshot().pending.map((message) => message.id),
    ["second"],
  );
});

test("restoring a failed turn keeps its messages available for retry", async () => {
  class ReplayAgent extends AbstractAgent {
    run() {
      return of();
    }
    connect() {
      return of(
        { type: EventType.RUN_STARTED, threadId: "thread", runId: "old-run" },
        {
          type: EventType.MESSAGES_SNAPSHOT,
          messages: [{ id: "message", role: "user" as const, content: "Hello" }],
        },
        { type: EventType.RUN_ERROR, message: "Old provider credit error" },
      );
    }
  }
  const agent = new ReplayAgent({ agentId: "default", threadId: "thread" });
  const core = new CopilotKitCore({ agents__unsafe_dev_only: { default: agent } });
  await runConversationTurn(
    "default",
    () => core.connectAgent({ agent }),
    (onError) => core.subscribe({ onError }),
    "restore",
  );
  assert.equal(agent.messages[0]?.content, "Hello");
});

test("restoring still rejects connection failures", async () => {
  class OfflineAgent extends AbstractAgent {
    run() {
      return of();
    }
    connect() {
      return throwError(() => new Error("Network unavailable"));
    }
  }
  const agent = new OfflineAgent({ agentId: "default", threadId: "thread" });
  const core = new CopilotKitCore({ agents__unsafe_dev_only: { default: agent } });
  await assert.rejects(
    runConversationTurn(
      "default",
      () => core.connectAgent({ agent }),
      (onError) => core.subscribe({ onError }),
      "restore",
    ),
    /Network unavailable/,
  );
});
