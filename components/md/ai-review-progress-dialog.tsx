"use client";

import type { CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export type AiAgent = "reviewer" | "editor" | null;
export type AiAgentTokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  calls?: number;
};

type AiReviewProgressDialogProps = {
  open: boolean;
  activeAgent: AiAgent;
  dialogError: string | null;
  dialogMessage: string;
  completed: boolean;
  completionChanged: boolean;
  completionSummary?: string;
  completionImprovements?: string[];
  tokenUsage?: {
    reviewer?: AiAgentTokenUsage;
    editor?: AiAgentTokenUsage;
  };
  isAiReviewing: boolean;
  onClose: () => void;
};

export function AiReviewProgressDialog({
  open,
  activeAgent,
  dialogError,
  dialogMessage,
  completed,
  completionChanged,
  completionSummary,
  completionImprovements,
  tokenUsage,
  isAiReviewing,
  onClose,
}: AiReviewProgressDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 px-4">
      <Card className="w-full max-w-md border shadow-xl">
        <div className="space-y-4 p-5">
          <div className="text-sm font-semibold">Improving Your Document</div>
          <div className="text-xs text-muted-foreground">
            Please hang tight while we polish your writing. This window will close
            when you close it.
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <AgentRow
              title="Review Pass"
              active={activeAgent === "reviewer" && !dialogError}
              done={activeAgent === "editor" && !dialogError}
              tokenUsage={tokenUsage?.reviewer}
            />
            <AgentRow
              title="Polish Pass"
              active={activeAgent === "editor" && !dialogError}
              done={
                dialogError ? false : activeAgent === "editor" && !isAiReviewing
              }
              tokenUsage={tokenUsage?.editor}
            />
          </div>

          <div className="min-h-6 text-xs text-muted-foreground">{dialogMessage}</div>

          {completed && !dialogError && (
            <div className="space-y-3 rounded-md border border-emerald-300/60 bg-emerald-50/70 px-3 py-3 text-xs dark:border-emerald-900/60 dark:bg-emerald-950/30">
              <div className="font-semibold text-emerald-700 dark:text-emerald-300">
                {completionChanged
                  ? "AI optimization applied"
                  : "AI review completed (minimal edits)"}
              </div>
              {completionSummary && (
                <div className="text-foreground/90">{completionSummary}</div>
              )}
              {(completionImprovements?.length ?? 0) > 0 && (
                <ul className="list-disc space-y-1 pl-4 text-foreground/80">
                  {completionImprovements?.slice(0, 3).map((item, idx) => (
                    <li key={`${idx}-${item}`}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {dialogError && (
            <div className="space-y-3">
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {dialogError}
              </div>
            </div>
          )}

          {(dialogError || completed) && (
            <div className="flex justify-end">
              <Button onClick={onClose}>Close</Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function AgentRow({
  title,
  active,
  done,
  tokenUsage,
}: {
  title: string;
  active: boolean;
  done: boolean;
  tokenUsage?: AiAgentTokenUsage;
}) {
  const totalTokens =
    typeof tokenUsage?.totalTokens === "number"
      ? tokenUsage.totalTokens
      : (tokenUsage?.inputTokens ?? 0) + (tokenUsage?.outputTokens ?? 0);
  const tokenText =
    totalTokens > 0
      ? `${totalTokens.toLocaleString()} tokens${
          tokenUsage?.calls && tokenUsage.calls > 1
            ? ` (${tokenUsage.calls} calls)`
            : ""
        }`
      : null;

  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2 text-xs">
      <span className="space-y-0.5">
        <span className="block font-medium">{title}</span>
        {tokenText && (
          <span className="block text-[11px] text-muted-foreground">
            {tokenText}
          </span>
        )}
      </span>
      {done ? (
        <span className="text-emerald-600">Done</span>
      ) : active ? (
        <span className="inline-flex items-center gap-2 text-primary">
          Thinking
          <ThinkingSignal />
        </span>
      ) : (
        <span className="text-muted-foreground">Waiting</span>
      )}
    </div>
  );
}

function ThinkingSignal() {
  const bars = [
    { delay: 0, duration: 0.78, min: 0.24, mid: 0.62, max: 1 },
    { delay: 80, duration: 1.02, min: 0.18, mid: 0.55, max: 0.9 },
    { delay: 160, duration: 0.86, min: 0.28, mid: 0.7, max: 0.96 },
    { delay: 240, duration: 1.1, min: 0.16, mid: 0.48, max: 0.84 },
    { delay: 40, duration: 0.74, min: 0.3, mid: 0.76, max: 1 },
    { delay: 120, duration: 0.96, min: 0.22, mid: 0.58, max: 0.92 },
    { delay: 200, duration: 1.14, min: 0.2, mid: 0.52, max: 0.86 },
    { delay: 280, duration: 0.9, min: 0.26, mid: 0.68, max: 0.97 },
  ];
  return (
    <span className="ai-thinking-signal" aria-hidden="true">
      <span className="ai-thinking-bars">
        {bars.map((bar, idx) => (
          <span
            key={idx}
            className="ai-thinking-bar"
            style={
              {
                animationDelay: `${bar.delay}ms`,
                animationDuration: `${bar.duration}s`,
                "--bar-min": bar.min,
                "--bar-mid": bar.mid,
                "--bar-max": bar.max,
              } as CSSProperties
            }
          />
        ))}
      </span>
      <style jsx>{`
        .ai-thinking-signal {
          position: relative;
          display: inline-flex;
          align-items: center;
          width: 2.7rem;
          height: 1.35rem;
        }

        .ai-thinking-bars {
          display: inline-flex;
          align-items: flex-end;
          gap: 0.1rem;
          height: 1.18rem;
          width: 2.58rem;
          mask-image: linear-gradient(to right, #000 72%, transparent 100%);
        }

        .ai-thinking-bar {
          width: 0.18rem;
          height: 80%;
          border-radius: 9999px;
          background: currentColor;
          opacity: 0.8;
          transform-origin: bottom;
          animation: ai-bars 0.9s ease-in-out infinite;
        }

        @keyframes ai-bars {
          0%,
          100% {
            transform: scaleY(var(--bar-min, 0.28));
            opacity: 0.45;
          }
          30% {
            transform: scaleY(var(--bar-mid, 0.62));
            opacity: 0.68;
          }
          55% {
            transform: scaleY(var(--bar-max, 1));
            opacity: 0.95;
          }
          78% {
            transform: scaleY(calc(var(--bar-mid, 0.62) * 0.88));
            opacity: 0.72;
          }
        }
      `}</style>
    </span>
  );
}
