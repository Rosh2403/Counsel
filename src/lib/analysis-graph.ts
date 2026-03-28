import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export const AnalysisState = Annotation.Root({
  // Input
  documentId: Annotation<string>,
  textContent: Annotation<string>,

  // Analysis results (ANALYZE node)
  summary: Annotation<string | null>({ reducer: (_, b) => b, default: () => null }),
  entities: Annotation<unknown | null>({ reducer: (_, b) => b, default: () => null }),
  riskFlags: Annotation<unknown | null>({ reducer: (_, b) => b, default: () => null }),
  clauses: Annotation<unknown | null>({ reducer: (_, b) => b, default: () => null }),

  // Classification (CLASSIFY node)
  documentType: Annotation<string | null>({ reducer: (_, b) => b, default: () => null }),
  verificationTasks: Annotation<unknown[]>({ reducer: (_, b) => b, default: () => [] }),

  // Verification (VERIFY node)
  verificationThreadId: Annotation<string | null>({ reducer: (_, b) => b, default: () => null }),
  verificationResults: Annotation<unknown[]>({ reducer: (_, b) => b, default: () => [] }),

  // Evaluation (EVALUATE node)
  needsRetry: Annotation<boolean>({ reducer: (_, b) => b, default: () => false }),
  retryCount: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),

  // Synthesis (SYNTHESIZE node)
  complianceReport: Annotation<string | null>({ reducer: (_, b) => b, default: () => null }),
  suggestedQueries: Annotation<string[]>({ reducer: (_, b) => b, default: () => [] }),

  // Progress
  currentStep: Annotation<string>({ reducer: (_, b) => b, default: () => "starting" }),
});

export type AnalysisStateType = typeof AnalysisState.State;

// ---------------------------------------------------------------------------
// LLM
// ---------------------------------------------------------------------------

function getLLM() {
  return new ChatOpenAI({
    modelName: "gpt-4o",
    temperature: 0,
    openAIApiKey: process.env.OPENAI_API_KEY,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeJsonParse(text: string): unknown {
  try {
    // Strip markdown fences if present
    const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return text;
  }
}

function getConvex() {
  return new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
}

// ---------------------------------------------------------------------------
// ANALYZE node — 4 parallel OpenAI calls
// ---------------------------------------------------------------------------

async function analyze(
  state: AnalysisStateType,
): Promise<Partial<AnalysisStateType>> {
  const llm = getLLM();
  const doc = state.textContent;

  const [summaryResult, entitiesResult, risksResult, clausesResult] =
    await Promise.allSettled([
      llm.invoke(
        `You are a legal document analyst. Summarize this legal document in 3-5 sentences. Cover: the type of document (contract, agreement, filing, etc.), the parties involved, the key subject matter, and any notable terms or conditions.\n\nDocument:\n${doc}`,
      ),
      llm.invoke(
        `Extract all key legal entities from this document. Return ONLY valid JSON, no markdown fences.\n\n{"entities": [{"name": "...", "type": "person|company|government_body|statute|regulation", "role": "party|counterparty|regulator|reference|beneficiary", "context": "brief description of their role"}]}\n\nDocument:\n${doc}`,
      ),
      llm.invoke(
        `Identify potential legal risks or areas of concern in this document. Return ONLY valid JSON, no markdown fences.\n\n{"risks": [{"clause_text": "exact clause text", "risk_level": "high|medium|low", "risk_type": "liability|compliance|ambiguity|missing_provision|unfavorable_terms", "explanation": "why this is risky", "recommendation": "what to do"}]}\n\nDocument:\n${doc}`,
      ),
      llm.invoke(
        `List all distinct clauses or sections in this document. Return ONLY valid JSON, no markdown fences.\n\n{"clauses": [{"clause_number": "...", "clause_title": "...", "clause_type": "obligation|right|condition|definition|limitation|termination|indemnity|confidentiality", "summary": "one sentence"}]}\n\nDocument:\n${doc}`,
      ),
    ]);

  const summary =
    summaryResult.status === "fulfilled"
      ? (summaryResult.value.content as string)
      : null;
  const entities =
    entitiesResult.status === "fulfilled"
      ? safeJsonParse(entitiesResult.value.content as string)
      : null;
  const riskFlags =
    risksResult.status === "fulfilled"
      ? safeJsonParse(risksResult.value.content as string)
      : null;
  const clauses =
    clausesResult.status === "fulfilled"
      ? safeJsonParse(clausesResult.value.content as string)
      : null;

  return { summary, entities, riskFlags, clauses, currentStep: "classifying" };
}

// ---------------------------------------------------------------------------
// CLASSIFY node — GPT-4o decides document type + which databases to verify
// ---------------------------------------------------------------------------

async function classify(
  state: AnalysisStateType,
): Promise<Partial<AnalysisStateType>> {
  const llm = getLLM();

  const prompt = `You are a Singapore legal classification expert. Based on this document analysis, classify the document and determine which legal databases to search for compliance verification.

Document summary: ${state.summary ?? "N/A"}
Entities: ${JSON.stringify(state.entities)}
Risk flags: ${JSON.stringify(state.riskFlags)}
Clauses: ${JSON.stringify(state.clauses)}

Return ONLY valid JSON, no markdown fences:
{
  "documentType": "employment|financial|data_processing|corporate|intellectual_property|general",
  "verificationTasks": [
    {
      "source": "sso|mas|cases",
      "query": "specific search query for this database",
      "keywords": "key terms to look for",
      "reason": "why this database is relevant"
    }
  ],
  "suggestedQueries": ["3-5 broader research queries for the user"]
}

Rules:
- employment contracts → MUST search sso for Employment Act, cases for wrongful dismissal precedents
- financial agreements → MUST search sso for Payment Services Act, mas for MAS regulations
- data processing agreements → MUST search sso for PDPA, mas for PDPC guidelines
- Always include at least 2 verification tasks
- Each query should be specific to Singapore law
- suggestedQueries are for the user to optionally trigger full web research later`;

  const response = await llm.invoke(prompt);
  const parsed = safeJsonParse(response.content as string);

  if (typeof parsed === "object" && parsed !== null) {
    const data = parsed as {
      documentType?: string;
      verificationTasks?: unknown[];
      suggestedQueries?: string[];
    };
    return {
      documentType: data.documentType ?? "general",
      verificationTasks: data.verificationTasks ?? [],
      suggestedQueries: data.suggestedQueries ?? [],
      currentStep: "verifying",
    };
  }

  return { documentType: "general", verificationTasks: [], suggestedQueries: [], currentStep: "verifying" };
}

// ---------------------------------------------------------------------------
// VERIFY node — triggers TinyFish via existing Convex actions
// ---------------------------------------------------------------------------

interface VerificationTask {
  source: "sso" | "mas" | "cases";
  query: string;
  keywords: string;
  reason?: string;
}

async function verify(
  state: AnalysisStateType,
): Promise<Partial<AnalysisStateType>> {
  const convex = getConvex();
  const tasks = state.verificationTasks as VerificationTask[];

  if (!tasks.length) {
    return { verificationResults: [], currentStep: "evaluating" };
  }

  // 1. Create a verification thread (or reuse existing on retry)
  let threadId: string;
  if (state.verificationThreadId) {
    threadId = state.verificationThreadId;
  } else {
    threadId = await convex.mutation(api.documents.createVerificationThread, {
      documentId: state.documentId as Id<"documents">,
      documentType: state.documentType ?? "general",
    });
  }

  // 2. Fire TinyFish actions in parallel via scheduler (non-blocking)
  //    Each mutation schedules an internal TinyFish action and returns immediately.
  //    The TinyFish actions create/update source rows in real-time.
  await Promise.all(
    tasks.map((task) =>
      convex.mutation(api.documents.triggerVerificationSearch, {
        threadId: threadId as Id<"threads">,
        type: task.source,
        query: task.query,
        keywords: task.keywords ?? "",
      }),
    ),
  );

  // 3. Poll Convex until all sources reach a terminal state
  const maxWaitMs = 180_000; // 3 minutes
  const pollIntervalMs = 3_000;
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));

    const sources = await convex.query(api.queries.getSources, {
      threadId: threadId as Id<"threads">,
    });

    if (sources.length === 0) continue; // sources not yet created by scheduler

    const allDone = sources.every(
      (s: { status: string }) => s.status === "complete" || s.status === "error",
    );

    if (allDone) {
      return {
        verificationThreadId: threadId,
        verificationResults: sources,
        currentStep: "evaluating",
      };
    }
  }

  // Timeout: return whatever we have
  const finalSources = await convex.query(api.queries.getSources, {
    threadId: threadId as Id<"threads">,
  });

  return {
    verificationThreadId: threadId,
    verificationResults: finalSources,
    currentStep: "evaluating",
  };
}

// ---------------------------------------------------------------------------
// EVALUATE node — pure code, no LLM
// ---------------------------------------------------------------------------

async function evaluate(
  state: AnalysisStateType,
): Promise<Partial<AnalysisStateType>> {
  const results = state.verificationResults as Array<{
    status: string;
    results?: unknown;
  }>;

  const goodCount = results.filter(
    (s) => s.status === "complete" && s.results != null,
  ).length;

  const needsRetry = goodCount < 2 && state.retryCount < 2;

  return {
    needsRetry,
    currentStep: needsRetry ? "refining" : "synthesizing",
  };
}

// ---------------------------------------------------------------------------
// REFINE node — GPT-4o generates better search queries
// ---------------------------------------------------------------------------

async function refine(
  state: AnalysisStateType,
): Promise<Partial<AnalysisStateType>> {
  const llm = getLLM();

  const failedSources = (
    state.verificationResults as Array<{
      type: string;
      status: string;
      query: string;
      results?: unknown;
    }>
  ).filter((s) => s.status === "error" || s.results == null);

  const prompt = `The following legal verification searches returned insufficient results. Generate improved search queries.

Original document type: ${state.documentType}
Original document summary: ${state.summary}

Failed or insufficient searches:
${JSON.stringify(failedSources, null, 2)}

For each failed source, provide a refined query with better keywords. Return ONLY valid JSON, no markdown fences:
{"refinedTasks": [{"source": "sso|mas|cases", "query": "improved search query", "keywords": "better key terms", "reason": "why this query is better"}]}`;

  const response = await llm.invoke(prompt);
  const parsed = safeJsonParse(response.content as string);

  let refinedTasks: unknown[] = [];
  if (typeof parsed === "object" && parsed !== null && "refinedTasks" in (parsed as Record<string, unknown>)) {
    refinedTasks = (parsed as { refinedTasks: unknown[] }).refinedTasks;
  }

  return {
    verificationTasks: refinedTasks.length > 0 ? refinedTasks : state.verificationTasks,
    retryCount: state.retryCount + 1,
    currentStep: "verifying",
  };
}

// ---------------------------------------------------------------------------
// SYNTHESIZE node — compliance report from analysis + verification
// ---------------------------------------------------------------------------

async function synthesize(
  state: AnalysisStateType,
): Promise<Partial<AnalysisStateType>> {
  const llm = getLLM();
  const convex = getConvex();

  const sources = state.verificationResults as Array<{
    type: string;
    status: string;
    results?: unknown;
  }>;

  const statutes = sources
    .filter((s) => s.type === "sso" && s.status === "complete")
    .map((s) => s.results);
  const regulations = sources
    .filter((s) => s.type === "mas" && s.status === "complete")
    .map((s) => s.results);
  const cases = sources
    .filter((s) => s.type === "cases" && s.status === "complete")
    .map((s) => s.results);

  const today = new Date().toISOString().slice(0, 10);
  const sourceCount = sources.filter((s) => s.status === "complete").length;

  const prompt = `You are a senior legal analyst producing a compliance verification report.

Document type: ${state.documentType}
Document summary: ${state.summary}

Key clauses identified:
${JSON.stringify(state.clauses)}

Risks flagged:
${JSON.stringify(state.riskFlags)}

Verification results from live Singapore legal databases:

## Statutes found:
${JSON.stringify(statutes, null, 2)}

## Regulations found:
${JSON.stringify(regulations, null, 2)}

## Case law found:
${JSON.stringify(cases, null, 2)}

Write a compliance report in this format:

# Compliance Verification Report

**Document:** ${state.documentType}
**Date:** ${today}
**Sources Verified:** ${sourceCount} legal databases

## Executive Summary
[2-3 sentences on overall compliance status]

## Clause-by-Clause Verification
[For each major clause in the document, state whether it aligns with current Singapore law. Reference specific statutes/regulations found.]

## Risk Assessment
[For each flagged risk, state whether the verification confirmed or reduced the concern. Reference specific cases or regulations.]

## Compliance Status
[Overall: Compliant / Partially Compliant / Non-Compliant / Requires Review]
[List specific areas needing attention]

## Citations
[1] [Title](URL)
[2] [Title](URL)

Rules: formal legal language, cite specific sections and cases from the verification results, use [Title](URL) markdown links for all citations, do not fabricate anything not in the provided verification data.`;

  try {
    const response = await llm.invoke(prompt);
    const report = response.content as string;

    await convex.mutation(api.documents.storeComplianceReport, {
      documentId: state.documentId as Id<"documents">,
      complianceReport: report,
    });

    return { complianceReport: report, currentStep: "complete" };
  } catch {
    // If synthesis fails, still mark complete with whatever we have
    await convex.mutation(api.documents.updateDocumentStatus, {
      documentId: state.documentId as Id<"documents">,
      status: "complete",
    });
    return { currentStep: "complete" };
  }
}

// ---------------------------------------------------------------------------
// Conditional router after EVALUATE
// ---------------------------------------------------------------------------

function evaluateRouter(state: AnalysisStateType): string {
  if (state.needsRetry && state.retryCount < 2) {
    return "refine";
  }
  return "synthesize";
}

// ---------------------------------------------------------------------------
// Graph
// ---------------------------------------------------------------------------

const graphBuilder = new StateGraph(AnalysisState)
  .addNode("analyze", analyze)
  .addNode("classify", classify)
  .addNode("verify", verify)
  .addNode("evaluate", evaluate)
  .addNode("refine", refine)
  .addNode("synthesize", synthesize)
  .addEdge(START, "analyze")
  .addEdge("analyze", "classify")
  .addEdge("classify", "verify")
  .addEdge("verify", "evaluate")
  .addConditionalEdges("evaluate", evaluateRouter, {
    refine: "refine",
    synthesize: "synthesize",
  })
  .addEdge("refine", "verify") // cycle: refine → verify → evaluate → ...
  .addEdge("synthesize", END);

export const analysisGraph = graphBuilder.compile();

// ---------------------------------------------------------------------------
// Invoke helper
// ---------------------------------------------------------------------------

export async function runAnalysis(
  documentId: string,
  textContent: string,
): Promise<AnalysisStateType> {
  const result = await analysisGraph.invoke({
    documentId,
    textContent,
  });
  return result as AnalysisStateType;
}
