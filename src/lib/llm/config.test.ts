import { describe, expect, it } from "vitest";
import { LlmConfigError, loadLlmConfig } from "./config";

describe("loadLlmConfig", () => {
  it("defaults to openai + gpt-4o-mini when only the key is set", () => {
    const cfg = loadLlmConfig({ OPENAI_API_KEY: "sk-test" });
    expect(cfg).toMatchObject({ provider: "openai", model: "gpt-4o-mini", apiKey: "sk-test" });
  });

  it("names the missing env var for the selected provider", () => {
    expect(() => loadLlmConfig({ LLM_PROVIDER: "anthropic" })).toThrowError(
      expect.objectContaining({ name: "LlmConfigError", envVar: "ANTHROPIC_API_KEY" }),
    );
  });

  it("treats a blank key as missing", () => {
    expect(() => loadLlmConfig({ OPENAI_API_KEY: "   " })).toThrow(LlmConfigError);
  });

  it("rejects unknown providers with a helpful message", () => {
    expect(() => loadLlmConfig({ LLM_PROVIDER: "gemini", OPENAI_API_KEY: "x" })).toThrow(
      /LLM_PROVIDER="gemini" is not supported/,
    );
  });

  it("honours LLM_MODEL override and per-provider defaults", () => {
    expect(loadLlmConfig({ OPENAI_API_KEY: "x", LLM_MODEL: "gpt-4.1" }).model).toBe("gpt-4.1");
    expect(loadLlmConfig({ LLM_PROVIDER: "openrouter", OPENROUTER_API_KEY: "x" }).model).toBe(
      "openai/gpt-4o-mini",
    );
  });
});
