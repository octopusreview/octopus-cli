export function analysisOutcome(
  status: string,
): "success" | "failed" | "pending" | "unexpected" {
  // "analyzed" is what the server writes; "done"/"completed" kept for compatibility
  if (status === "analyzed" || status === "done" || status === "completed") {
    return "success";
  }
  if (status === "failed") return "failed";
  if (status === "analyzing") return "pending";
  return "unexpected";
}
