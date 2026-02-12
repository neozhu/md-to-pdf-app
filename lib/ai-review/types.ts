// ---------------------------------------------------------------------------
// Shared types for the AI review pipeline.
// Used by both the API route (server) and frontend components (client).
// ---------------------------------------------------------------------------

export type WorkflowRoute = "BRANCH_A" | "BRANCH_B";

export type ReviewerResult = {
  needsEdit: boolean;
  review: string;
  keyImprovements: string[];
  rewritePlan: string[];
};

export type AgentTokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens: number;
  cachedInputTokens: number;
  calls: number;
};

export type AgentTokenUsageSummary = {
  reviewer: AgentTokenUsage;
  editor: AgentTokenUsage;
};

export type AiReviewPayload = {
  review: string;
  keyImprovements: string[];
  polishedMarkdown: string;
  changed: boolean;
  tokenUsage: AgentTokenUsageSummary;
  toolInsights: {
    workflowRoute: WorkflowRoute;
    structureRecoveryDetected: boolean;
    editorSkipped: boolean;
    structureCues: string[];
    rawBlockCount: number;
    headingCandidateCount: number;
    listCandidateCount: number;
    codeCandidateCount: number;
    recoveredCodeBlockCount: number;
    factualRiskLevel: "low" | "medium" | "high";
    factualWarnings: string[];
    factualRecommendation: string;
  };
};

export type StageEvent = {
  agent: "reviewer" | "editor";
  status: "started" | "completed";
  message: string;
  usage?: AgentTokenUsage;
};

// ---------------------------------------------------------------------------
// Structure analysis types
// ---------------------------------------------------------------------------

export type StructureSignals = {
  isLikelyUnstructuredPlainText: boolean;
  hasMarkdownSignals: boolean;
  hasParagraphBreak: boolean;
  nonEmptyLineCount: number;
  avgLineLength: number;
  headingLikeLineCount: number;
  codeCueCount: number;
  inlineListCueCount: number;
  cues: string[];
};

export type RawBlockKind =
  | "heading_candidate"
  | "paragraph"
  | "list_candidate"
  | "code_candidate";

export type RawBlock = {
  index: number;
  kind: RawBlockKind;
  startLine: number;
  endLine: number;
  lineCount: number;
  confidence: number;
  preview: string;
};

export type RawBlocksResult = {
  blockCount: number;
  headingCandidateCount: number;
  listCandidateCount: number;
  codeCandidateCount: number;
  blocks: RawBlock[];
};

export type CodeRecoverySuggestion = {
  startLine: number;
  endLine: number;
  language: string;
  confidence: number;
  preview: string;
};

export type CodeRecoveryResult = {
  changed: boolean;
  recoveredBlockCount: number;
  candidateLineCount: number;
  suggestions: CodeRecoverySuggestion[];
  recoveredMarkdown?: string;
};

// ---------------------------------------------------------------------------
// Factual guard types
// ---------------------------------------------------------------------------

export type FactualGuardResult = {
  riskLevel: "low" | "medium" | "high";
  similarity: number;
  lengthDelta: number;
  missingNumbers: string[];
  addedNumbers: string[];
  missingUrls: string[];
  addedUrls: string[];
  missingVersions: string[];
  addedVersions: string[];
  warnings: string[];
  recommendation: string;
};

export type FactualBaseline = {
  normalizedOriginal: string;
  originalTokenSet: Set<string>;
  originalNumbers: string[];
  originalUrls: string[];
  originalVersions: string[];
};

// ---------------------------------------------------------------------------
// Workflow context (precomputed before any LLM call)
// ---------------------------------------------------------------------------

export type PrecomputedWorkflowContext = {
  route: WorkflowRoute;
  structureSignals: StructureSignals;
  rawBlocksResult: RawBlocksResult;
  codeRecoveryResult: CodeRecoveryResult;
  factualBaseline: FactualBaseline;
};

export type OpenAIStage = "formatter" | "reviewer" | "editor";

// ---------------------------------------------------------------------------
// Client-facing types (consumed by frontend components).
// These are the "optional-field" versions of the payload types, matching the
// shape the SSE consumer actually handles.
// ---------------------------------------------------------------------------

export type AiToolInsights = {
  structureRecoveryDetected?: boolean;
  editorSkipped?: boolean;
  structureCues?: string[];
  rawBlockCount?: number;
  headingCandidateCount?: number;
  listCandidateCount?: number;
  codeCandidateCount?: number;
  recoveredCodeBlockCount?: number;
  factualRiskLevel?: "low" | "medium" | "high";
  factualWarnings?: string[];
};

export type AiTokenUsage = {
  reviewer?: AiAgentTokenUsage;
  editor?: AiAgentTokenUsage;
};

export type AiAgentTokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  calls?: number;
};

export type AiReviewResponse = {
  review?: string;
  keyImprovements?: string[];
  polishedMarkdown?: string;
  changed?: boolean;
  tokenUsage?: AiTokenUsage;
  toolInsights?: AiToolInsights;
  error?: string;
};
