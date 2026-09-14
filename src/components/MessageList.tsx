import { isToolUIPart } from "ai";
import { useEffect, useRef } from "react";
import type { ChatTools, ChatUIMessage } from "@/lib/api/contracts";
import { ToolCallChip } from "./ToolCallChip";

type Props = {
  messages: ChatUIMessage[];
  streaming: boolean;
};

export function MessageList({ messages, streaming }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-neutral-500">
        <p>
          Tell me how you like to travel — pace, budget, food, who you go with — and I&apos;ll
          build your profile as we chat.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
      {streaming && messages[messages.length - 1]?.role === "user" && (
        <p className="text-xs text-neutral-400">Thinking…</p>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

function MessageBubble({ message }: { message: ChatUIMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          isUser
            ? "max-w-[80%] rounded-2xl rounded-br-sm bg-blue-600 px-4 py-2 text-sm text-white"
            : "max-w-[80%] rounded-2xl rounded-bl-sm bg-neutral-100 px-4 py-2 text-sm dark:bg-neutral-800"
        }
      >
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            return (
              <p key={i} className="whitespace-pre-wrap">
                {part.text}
              </p>
            );
          }
          if (isToolUIPart<ChatTools>(part) && part.type !== "dynamic-tool") {
            return <ToolCallChip key={i} part={part} />;
          }
          return null;
        })}
      </div>
    </div>
  );
}
