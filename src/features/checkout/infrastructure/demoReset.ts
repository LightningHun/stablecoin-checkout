// This evaluator-only command must succeed before clearing payment persistence.
let pendingReset: Promise<void> | null = null;
export function resetDemoServer(): Promise<void> {
  pendingReset ??= performReset().finally(() => {
    pendingReset = null;
  });
  return pendingReset;
}
async function performReset(): Promise<void> {
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 10000);
  try {
    const response = await fetch("/api/demo/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: abort.signal,
    });
    if (!response.ok) throw Error("Demo reset failed");
    const result: unknown = await response.json();
    if (
      !result ||
      typeof result !== "object" ||
      !("reset" in result) ||
      result.reset !== true
    )
      throw Error("Demo reset was not confirmed");
  } finally {
    clearTimeout(timeout);
  }
}
