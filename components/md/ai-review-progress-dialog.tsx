"use client";

import type { CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ReviewProfileId } from "@/lib/ai-review/review-profile-options";
import type { AiAgentTokenUsage } from "@/lib/ai-review/types";

export type AiAgent = "reviewer" | "editor" | null;
export type { AiAgentTokenUsage };

type AiReviewProgressDialogProps = {
  open: boolean;
  reviewProfiles: ReadonlyArray<{
    id: ReviewProfileId;
    label: string;
    description: string;
  }>;
  selectedReviewProfile: ReviewProfileId | "";
  activeAgent: AiAgent;
  dialogError: string | null;
  dialogMessage: string;
  completed: boolean;
  completionChanged: boolean;
  completionSkipped?: boolean;
  completionSummary?: string;
  completionImprovements?: string[];
  editableReview: string;
  decisionPending: boolean;
  tokenUsage?: {
    reviewer?: AiAgentTokenUsage;
    editor?: AiAgentTokenUsage;
  };
  isAiReviewing: boolean;
  onReviewProfileChange: (value: ReviewProfileId) => void;
  onStartReview: () => void;
  onEditableReviewChange: (value: string) => void;
  onPolish: () => void;
  onAccept: () => void;
  onReject: () => void;
  onClose: () => void;
};

export function AiReviewProgressDialog({
  open,
  reviewProfiles,
  selectedReviewProfile,
  activeAgent,
  dialogError,
  dialogMessage,
  completed,
  completionChanged,
  completionSkipped,
  completionSummary,
  completionImprovements,
  editableReview,
  decisionPending,
  tokenUsage,
  isAiReviewing,
  onReviewProfileChange,
  onStartReview,
  onEditableReviewChange,
  onPolish,
  onAccept,
  onReject,
  onClose,
}: AiReviewProgressDialogProps) {
  if (!open) return null;
  const selectedProfile = reviewProfiles.find(
    (profile) => profile.id === selectedReviewProfile,
  );
  const isProfileSelectionPending =
    !isAiReviewing &&
    !completed &&
    !dialogError &&
    !editableReview &&
    !decisionPending &&
    activeAgent === null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 px-4">
      <Card className="w-full max-w-md border shadow-xl">
        <div className="space-y-4 p-5">
          <div className="text-sm font-semibold">Improving Your Document</div>
          <div className="text-xs text-muted-foreground">
            {isProfileSelectionPending
              ? "Choose how the document should be reviewed before starting."
              : "Review the suggestions first, then choose whether AI should polish the document."}
          </div>
          {!isProfileSelectionPending && selectedProfile && (
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
              <div className="font-medium text-foreground">
                Selected profile: {selectedProfile?.label}
              </div>
              <div className="mt-1 text-[11px] leading-4 text-muted-foreground">
                {selectedProfile?.description}
              </div>
            </div>
          )}

          {isProfileSelectionPending ? (
            <div className="space-y-3 rounded-md border p-3">
              <div className="text-xs font-medium text-foreground">
                Review Profile
              </div>
              <div className="grid gap-2">
                {reviewProfiles.map((profile) => {
                  const selected = selectedReviewProfile === profile.id;
                  return (
                    <button
                      key={profile.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onReviewProfileChange(profile.id)}
                      className={`rounded-md border px-3 py-2 text-left transition ${
                        selected
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-background hover:bg-muted"
                      }`}
                    >
                      <span className="block text-xs font-medium">
                        {profile.label}
                      </span>
                      <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
                        {profile.description}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  onClick={onStartReview}
                  disabled={!selectedReviewProfile || isAiReviewing}
                >
                  Start Review
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2 rounded-md border p-3">
              <AgentRow
                title="Review Pass"
                active={activeAgent === "reviewer" && isAiReviewing && !dialogError}
                done={Boolean(editableReview) || (activeAgent === "editor" && !dialogError)}
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
          )}

          <div className="min-h-6 text-xs text-muted-foreground">{dialogMessage}</div>

          {completed && !dialogError && !editableReview && (
            <div className="space-y-3 rounded-md border border-emerald-300/60 bg-emerald-50/70 px-3 py-3 text-xs dark:border-emerald-900/60 dark:bg-emerald-950/30">
              <div className="font-semibold text-emerald-700 dark:text-emerald-300">
                {decisionPending
                  ? "AI draft ready for your decision"
                  : completionSkipped
                    ? "No edit needed"
                  : completionChanged
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

          {completed && !dialogError && editableReview && !decisionPending && (
            <div className="space-y-2">
              <label
                htmlFor="ai-review-editable"
                className="text-xs font-medium text-foreground"
              >
                Review suggestions
              </label>
              <textarea
                id="ai-review-editable"
                value={editableReview}
                onChange={(event) => onEditableReviewChange(event.target.value)}
                className="min-h-40 w-full resize-y rounded-md border bg-background px-3 py-2 text-xs leading-5 outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                disabled={isAiReviewing}
              />
            </div>
          )}

          {dialogError && (
            <div className="space-y-3">
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {dialogError}
              </div>
            </div>
          )}

          {completed && !dialogError && decisionPending && (
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onReject}>
                Keep Original
              </Button>
              <Button onClick={onAccept}>Accept Changes</Button>
            </div>
          )}

          {completed && !dialogError && editableReview && !decisionPending && (
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={isAiReviewing}>
                Skip Editing
              </Button>
              <Button onClick={onPolish} disabled={isAiReviewing}>
                Apply Review
              </Button>
            </div>
          )}

          {(dialogError || (completed && !decisionPending && !editableReview)) && (
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
