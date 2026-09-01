import { describe, expect, test } from "bun:test";
import { analysisOutcome } from "./analysis-status.js";

describe("analysisOutcome", () => {
  test("analyzed resolves to success", () => {
    expect(analysisOutcome("analyzed")).toBe("success");
  });

  test("legacy done resolves to success", () => {
    expect(analysisOutcome("done")).toBe("success");
  });

  test("legacy completed resolves to success", () => {
    expect(analysisOutcome("completed")).toBe("success");
  });

  test("failed resolves to failed", () => {
    expect(analysisOutcome("failed")).toBe("failed");
  });

  test("analyzing resolves to pending", () => {
    expect(analysisOutcome("analyzing")).toBe("pending");
  });

  test("any other status resolves to unexpected", () => {
    expect(analysisOutcome("none")).toBe("unexpected");
    expect(analysisOutcome("")).toBe("unexpected");
  });
});
