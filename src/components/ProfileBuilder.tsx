"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useState } from "react";
import { apiErrorFromChatError, fetchProfile, resetProfile } from "@/lib/api/client";
import type { ApiError, ChatUIMessage } from "@/lib/api/contracts";
import type { TravelProfile } from "@/lib/profile/schema";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";
import { ProfilePanel } from "./ProfilePanel";

/**
 * Owns the two pieces of client state — the chat and the profile — and the
 * single link between them: `profile` data parts arriving on the chat stream
 * replace the profile snapshot, so the panel updates mid-turn.
 */
export function ProfileBuilder() {
  const [profile, setProfile] = useState<TravelProfile | null>(null);
  const [apiError, setApiError] = useState<ApiError | null>(null);
  const [resetting, setResetting] = useState(false);

  // Chat errors are surfaced via onError -> apiError (typed), not the hook's raw `error`.
  const { messages, sendMessage, status, clearError } = useChat<ChatUIMessage>({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
    onData: (part) => {
      if (part.type === "data-profile") setProfile(part.data);
    },
    onError: (err) => setApiError(apiErrorFromChatError(err) ?? { error: "internal_error", message: err.message }),
  });

  useEffect(() => {
    fetchProfile()
      .then((res) => setProfile(res.profile))
      .catch((err: Error) => setApiError({ error: "internal_error", message: err.message }));
  }, []);

  const handleSend = useCallback(
    (text: string) => {
      setApiError(null);
      clearError();
      void sendMessage({ text });
    },
    [sendMessage, clearError],
  );

  const handleReset = useCallback(async () => {
    setResetting(true);
    try {
      const res = await resetProfile();
      setProfile(res.profile);
    } catch (err) {
      setApiError({ error: "internal_error", message: (err as Error).message });
    } finally {
      setResetting(false);
    }
  }, []);

  const busy = status === "submitted" || status === "streaming";

  return (
    <div className="grid h-full grid-cols-[minmax(0,1fr)_340px] gap-4">
      <section className="flex h-full min-h-0 flex-col rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        {apiError && <ErrorBanner error={apiError} />}
        <MessageList messages={messages} streaming={busy} />
        <Composer onSend={handleSend} disabled={busy || apiError?.error === "llm_not_configured"} />
      </section>
      <ProfilePanel profile={profile} onReset={handleReset} resetting={resetting} />
    </div>
  );
}

function ErrorBanner({ error }: { error: ApiError }) {
  const isConfig = error.error === "llm_not_configured";
  return (
    <div
      role="alert"
      className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
    >
      <strong className="font-semibold">{isConfig ? "LLM not configured. " : "Something went wrong. "}</strong>
      {error.message}
      {isConfig && error.envVar && (
        <>
          {" "}
          Set <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">{error.envVar}</code> in{" "}
          <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">.env.local</code> and try again.
        </>
      )}
    </div>
  );
}
