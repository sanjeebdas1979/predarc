"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { usePredarcNetwork } from "@/app/components/providers/PredarcNetworkProvider";
import {
  ASSISTANT_MAX_MESSAGE_LENGTH,
  ASSISTANT_MAX_MESSAGES,
  containsSensitiveAssistantMaterial,
  parseAssistantReply,
  type PredarcAssistantMessage,
  type PredarcAssistantReply,
  type PredarcAssistantSource,
} from "@/lib/predarc-assistant-core";

type UiMessage = PredarcAssistantMessage & {
  id: string;
  mode?: PredarcAssistantReply["mode"];
  sources?: PredarcAssistantSource[];
};

const INITIAL_MESSAGE: UiMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Hi! Ask me about Predarc, Arc or Base. I use verified Predarc information and official network documentation. I never need your seed phrase, private key or wallet credentials.",
  mode: "verified",
};

const CLIENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getAssistantClientId(): string {
  const storageKey = "predarc_assistant_client_id_v1";
  try {
    const existing = window.localStorage.getItem(storageKey) ?? "";
    if (CLIENT_ID_PATTERN.test(existing)) return existing;

    const created = window.crypto.randomUUID();
    window.localStorage.setItem(storageKey, created);
    return created;
  } catch {
    return window.crypto.randomUUID();
  }
}

function messageHistory(messages: readonly UiMessage[]): PredarcAssistantMessage[] {
  const history = messages
    .filter((message) => message.id !== "welcome")
    .map(({ role, content }) => ({ role, content }))
    .slice(-(ASSISTANT_MAX_MESSAGES - 1));

  while (history[0]?.role === "assistant") history.shift();
  return history;
}

function sourceIsExternal(source: PredarcAssistantSource): boolean {
  return source.href.startsWith("https://");
}

export default function PredarcAssistant() {
  const { network, selectedChainId } = usePredarcNetwork();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<UiMessage[]>([INITIAL_MESSAGE]);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const submittingRef = useRef(false);
  const clientIdRef = useRef<string | null>(null);
  const selectedChainIdRef = useRef(selectedChainId);

  const quickQuestions = [
    "What can I do on Predarc?",
    "How do I bridge USDC?",
    "How does Agent Research work?",
    `What is ${network.label}?`,
  ] as const;

  useEffect(() => {
    if (selectedChainIdRef.current === selectedChainId) return;
    selectedChainIdRef.current = selectedChainId;
    setMessages([INITIAL_MESSAGE]);
    setInput("");
    setNotice(`Assistant context changed to ${network.label}.`);
  }, [network.label, selectedChainId]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const container = messagesRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [messages, submitting]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        window.setTimeout(() => launcherRef.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  function closeAssistant() {
    setOpen(false);
    window.setTimeout(() => launcherRef.current?.focus(), 0);
  }

  async function sendQuestion(rawQuestion: string) {
    const question = rawQuestion.trim();
    if (!question || submittingRef.current) return;

    setNotice(null);
    if (containsSensitiveAssistantMaterial(question)) {
      setInput("");
      setNotice(
        "For your safety, that message was not sent. Never paste a private key, seed phrase, API key or agent token into chat. Use Predarc Receipts for transaction hashes."
      );
      return;
    }

    const userMessage: UiMessage = {
      id: window.crypto.randomUUID(),
      role: "user",
      content: question,
    };
    const outbound = [
      ...messageHistory(messages),
      { role: "user" as const, content: question },
    ];
    const requestChainId = selectedChainId;

    setMessages((current) => [...current, userMessage]);
    setInput("");
    submittingRef.current = true;
    setSubmitting(true);

    try {
      const clientId = clientIdRef.current ?? getAssistantClientId();
      clientIdRef.current = clientId;
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Predarc-Client": clientId,
        },
        body: JSON.stringify({
          messages: outbound,
          chainId: requestChainId,
        }),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const error =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "Predarc Assistant is temporarily unavailable.";
        throw new Error(error);
      }

      const assistantReply = parseAssistantReply(payload);
      if (!assistantReply) throw new Error("The assistant returned an invalid response.");
      if (selectedChainIdRef.current !== requestChainId) return;

      setMessages((current) => [
        ...current,
        {
          id: window.crypto.randomUUID(),
          role: "assistant",
          content: assistantReply.answer,
          mode: assistantReply.mode,
          sources: assistantReply.sources,
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: window.crypto.randomUUID(),
          role: "assistant",
          content:
            error instanceof Error
              ? error.message
              : "Predarc Assistant is temporarily unavailable.",
          mode: "verified",
        },
      ]);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendQuestion(input);
  }

  return (
    <div className="fixed bottom-4 right-4 z-[80] sm:bottom-6 sm:right-6">
      {open ? (
        <section
          id="predarc-assistant-dialog"
          role="dialog"
          aria-label="Predarc Assistant"
          className="mb-3 flex h-[min(36rem,calc(100dvh-7rem))] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-[1.75rem] border border-cyan-300/25 bg-[#09111d]/98 shadow-[0_24px_80px_rgba(0,0,0,0.58),4px_4px_0_0_rgba(255,255,255,0.11)] backdrop-blur-2xl"
        >
          <header className="flex items-center justify-between gap-3 border-b border-white/[0.08] bg-[linear-gradient(135deg,rgba(37,99,235,0.16),rgba(168,85,247,0.1),rgba(249,115,22,0.09))] px-4 py-3.5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-300/10 text-lg text-cyan-200 shadow-[0_0_22px_rgba(34,211,238,0.13)]">
                ✦
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-black text-white">
                  Predarc Assistant
                </h2>
                <p className="mt-0.5 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-cyan-200/75">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                  Verified help · Arc + Base
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={closeAssistant}
              aria-label="Close Predarc Assistant"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/20 text-lg text-gray-400 transition hover:border-white/20 hover:text-white"
            >
              ×
            </button>
          </header>

          <div
            ref={messagesRef}
            className="flex-1 space-y-4 overflow-y-auto px-4 py-4"
            aria-live="polite"
          >
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-3.5 py-3 text-xs leading-5 shadow-sm ${
                    message.role === "user"
                      ? "rounded-br-md border border-purple-300/25 bg-gradient-to-br from-indigo-600/90 via-purple-600/90 to-pink-500/85 text-white"
                      : "rounded-bl-md border border-white/[0.09] bg-white/[0.045] text-gray-200"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  {message.role === "assistant" && message.mode ? (
                    <p className="mt-2 text-[8px] font-black uppercase tracking-[0.13em] text-cyan-200/60">
                      {message.mode === "ai"
                        ? "AI · verified context"
                        : "Verified answer"}
                    </p>
                  ) : null}
                  {message.sources && message.sources.length > 0 ? (
                    <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-white/[0.07] pt-2.5">
                      {message.sources.map((source) => (
                        <a
                          key={source.id}
                          href={source.href}
                          target={sourceIsExternal(source) ? "_blank" : undefined}
                          rel={
                            sourceIsExternal(source)
                              ? "noopener noreferrer"
                              : undefined
                          }
                          className="rounded-full border border-cyan-300/15 bg-cyan-300/[0.06] px-2 py-1 text-[8px] font-black uppercase tracking-[0.07em] text-cyan-100/80 transition hover:border-cyan-200/30 hover:text-white"
                        >
                          {source.label}
                          {sourceIsExternal(source) ? " ↗" : " →"}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}

            {messages.length === 1 ? (
              <div className="grid gap-2">
                {quickQuestions.map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => void sendQuestion(question)}
                    disabled={submitting}
                    className="rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2.5 text-left text-[10px] font-bold text-gray-300 transition hover:border-cyan-300/20 hover:bg-cyan-300/[0.05] hover:text-white"
                  >
                    {question}
                  </button>
                ))}
              </div>
            ) : null}

            {submitting ? (
              <div className="flex justify-start">
                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-white/[0.08] bg-white/[0.04] px-4 py-3">
                  {[0, 1, 2].map((dot) => (
                    <span
                      key={dot}
                      className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300/70"
                      style={{ animationDelay: `${dot * 140}ms` }}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <form
            onSubmit={submitQuestion}
            className="border-t border-white/[0.08] bg-[#080e18] p-3"
          >
            <div className="flex items-end gap-2 rounded-2xl border border-white/[0.1] bg-white/[0.035] p-2 focus-within:border-cyan-300/25">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(event) => {
                  setInput(event.target.value);
                  if (notice) setNotice(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                maxLength={ASSISTANT_MAX_MESSAGE_LENGTH}
                rows={1}
                disabled={submitting}
                placeholder="Ask about Predarc, Arc or Base..."
                aria-label="Message Predarc Assistant"
                className="max-h-24 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-xs leading-5 text-white outline-none placeholder:text-gray-600 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={submitting || !input.trim()}
                aria-label="Send message"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-purple-300/30 bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 text-sm font-black text-white shadow-[2px_2px_0_0_rgba(0,0,0,0.75)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ↑
              </button>
            </div>
            {notice ? (
              <p
                role="alert"
                className="mt-2 rounded-xl border border-amber-300/15 bg-amber-300/[0.05] px-3 py-2 text-[9px] leading-4 text-amber-100/80"
              >
                {notice}
              </p>
            ) : null}
            <p className="mt-2 px-1 text-[8px] leading-4 text-gray-600">
              Informational only. Never share keys, seed phrases or agent tokens.
            </p>
          </form>
        </section>
      ) : null}

      <button
        ref={launcherRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={open ? "Close Predarc Assistant" : "Open Predarc Assistant"}
        aria-expanded={open}
        aria-controls="predarc-assistant-dialog"
        className="ml-auto flex items-center gap-2.5 rounded-full border border-cyan-300/30 bg-[linear-gradient(135deg,#1d4ed8,#7c3aed_58%,#db2777)] px-4 py-3 text-[10px] font-black uppercase tracking-[0.09em] text-white shadow-[0_15px_45px_rgba(37,99,235,0.28),3px_3px_0_0_rgba(0,0,0,0.85)] transition hover:-translate-y-0.5 hover:brightness-110"
      >
        <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-sm">
          ✦
          {!open ? (
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#5235b8] bg-emerald-400" />
          ) : null}
        </span>
        <span>{open ? "Close" : "Ask Predarc"}</span>
      </button>
    </div>
  );
}
