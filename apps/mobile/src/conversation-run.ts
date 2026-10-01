type RunError = { error: unknown; code?: string; context?: { agentId?: string } };

/** CopilotKit emits run failures through onError even when runAgent resolves. */
export async function runConversationTurn(
  agentId: string,
  execute: () => Promise<unknown>,
  subscribe: (listener: (event: RunError) => void) => { unsubscribe: () => void },
  mode: "run" | "restore" = "run",
) {
  let failure: Error | undefined;
  const subscription = subscribe((event) => {
    if (event.context?.agentId && event.context.agentId !== agentId) return;
    // Replaying an old failed turn is valid history, not a failed connection.
    if (mode === "restore" && event.code === "agent_run_error_event") return;
    failure = event.error instanceof Error ? event.error : new Error(String(event.error));
  });
  try {
    await execute();
    if (failure) throw failure;
  } finally {
    subscription.unsubscribe();
  }
}
