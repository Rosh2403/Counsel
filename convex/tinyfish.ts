import { internalAction, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

type SourceType = "sso" | "mas" | "cases";
type ErrorKind =
  | "no_api_key"
  | "database_unavailable"
  | "timeout"
  | "network_error"
  | "unknown";

const TINYFISH_URL = "https://agent.tinyfish.ai/v1/automation/run-sse";
const TIMEOUT_MS = 120_000;

const SSO_GOAL =
  "1. Type the following search query into the search box on this page and press Enter or click Search: {query}. 2. Wait for search results to appear. 3. Extract the top 5 results shown on the page. For each result, extract the title, section reference, and any snippet text visible in the listing. Do NOT click into individual results. 4. Return JSON: { \"statutes\": [{ \"act_name\": \"\", \"section_number\": \"\", \"section_title\": \"\", \"text\": \"\", \"url\": \"\" }] }";

const MAS_GOAL =
  "1. You are on the MAS search results page. 2. Extract the top 5 results shown on the page. For each result, extract: the title, date, and any description or snippet shown in the listing. Do NOT click into individual documents. 3. Return JSON: { \"regulations\": [{ \"title\": \"\", \"date\": \"\", \"type\": \"\", \"summary\": \"\", \"url\": \"\" }] }";

const CASES_GOAL =
  "1. You are on the Singapore Law Watch judgments search page. 2. Extract the top 5 case results shown on the page. For each, extract: case name, citation, date, and court name from the listing. Do NOT click into individual cases. 3. Return JSON: { \"cases\": [{ \"case_name\": \"\", \"citation\": \"\", \"date\": \"\", \"court\": \"\", \"summary\": \"\", \"url\": \"\" }] }";

const SOURCE_META: Record<SourceType, { url: string; goal: string }> = {
  sso: {
    url: "https://sso.agc.gov.sg/Search",
    goal: SSO_GOAL,
  },
  mas: {
    url: "https://www.mas.gov.sg/search?q={query}",
    goal: MAS_GOAL,
  },
  cases: {
    url: "https://www.singaporelawwatch.sg/Judgments?SearchTerm={query}",
    goal: CASES_GOAL,
  },
};

function classifyTinyFishError(error: unknown): {
  kind: ErrorKind;
  message: string;
  helpMessage: string;
} {
  const message =
    error instanceof Error ? error.message : "Unknown TinyFish error";
  const lower = message.toLowerCase();
  if (lower.includes("tinyfish_api_key") || lower.includes("401")) {
    return {
      kind: "no_api_key",
      message,
      helpMessage: "Set TINYFISH_API_KEY in Convex and .env.local",
    };
  }
  if (lower.includes("timeout") || lower.includes("aborted")) {
    return {
      kind: "timeout",
      message,
      helpMessage: "The search took too long. Try a more specific query.",
    };
  }
  if (lower.includes("fetch failed") || lower.includes("network")) {
    return {
      kind: "network_error",
      message,
      helpMessage: "Check your internet connection.",
    };
  }
  if (
    lower.includes("503") ||
    lower.includes("502") ||
    lower.includes("database")
  ) {
    return {
      kind: "database_unavailable",
      message,
      helpMessage: "The legal source appears unavailable. Try again shortly.",
    };
  }
  return {
    kind: "unknown",
    message,
    helpMessage: "Unexpected source error. Please retry the search.",
  };
}

async function runTinyFishSearch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  args: {
    threadId: Id<"threads">;
    type: SourceType;
    query: string;
    keywords: string;
  },
): Promise<{ ok: true; sourceId: Id<"sources">; results: unknown } | { ok: false; sourceId: Id<"sources">; error: { kind: ErrorKind; message: string; helpMessage: string } }> {
  const sourceMeta = SOURCE_META[args.type];
  const effectiveQuery = args.query.trim();
  const sourceId: Id<"sources"> = await ctx.runMutation(internal.tinyfish.ensureSourceSearching, {
    threadId: args.threadId,
    type: args.type,
    query: effectiveQuery,
    url: sourceMeta.url.replace("{query}", encodeURIComponent(effectiveQuery)),
  });

  try {
    const apiKey = process.env.TINYFISH_API_KEY;
    if (!apiKey) {
      throw new Error("Missing TINYFISH_API_KEY");
    }

    const response = await fetch(TINYFISH_URL, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: sourceMeta.url.replace("{query}", encodeURIComponent(effectiveQuery)),
        goal: sourceMeta.goal.replace("{query}", effectiveQuery),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`TinyFish request failed: ${response.status}`);
    }
    if (!response.body) {
      throw new Error("TinyFish response body is empty");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let completeSeen = false;
    let resultJson: unknown = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith("data: ")) {
          continue;
        }
        const payload = line.slice(6);
        if (!payload) {
          continue;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let eventData: any;
        try {
          eventData = JSON.parse(payload);
        } catch {
          continue;
        }

        if (eventData.type === "STREAMING_URL" && eventData.streaming_url) {
          await ctx.runMutation(internal.tinyfish.updateSourceStreamingUrl, {
            sourceId,
            streamingUrl: eventData.streaming_url,
          });
          continue;
        }

        if (eventData.type === "PROGRESS" && eventData.purpose) {
          await ctx.runMutation(internal.tinyfish.addSourceProgressStep, {
            sourceId,
            text: String(eventData.purpose),
          });
          continue;
        }

        if (eventData.type === "COMPLETE") {
          if (completeSeen) {
            continue;
          }
          completeSeen = true;
          if (eventData.status !== "COMPLETED") {
            throw new Error(eventData.error || "TinyFish reported FAILED");
          }
          resultJson = eventData.resultJson ?? null;
        }
      }
    }

    if (!completeSeen) {
      throw new Error("TinyFish stream ended without COMPLETE event");
    }

    await ctx.runMutation(internal.tinyfish.updateSourceComplete, {
      sourceId,
      results: resultJson,
    });

    return { ok: true as const, sourceId, results: resultJson };
  } catch (error) {
    const classified = classifyTinyFishError(error);
    await ctx.runMutation(internal.tinyfish.updateSourceError, {
      sourceId,
      kind: classified.kind,
      message: classified.message,
      helpMessage: classified.helpMessage,
    });
    return { ok: false as const, sourceId, error: classified };
  }
}

export const searchStatutes = internalAction({
  args: {
    threadId: v.id("threads"),
    query: v.string(),
    keywords: v.string(),
  },
  handler: async (ctx, args): ReturnType<typeof runTinyFishSearch> =>
    runTinyFishSearch(ctx, {
      ...args,
      type: "sso",
    }),
});

export const searchRegulations = internalAction({
  args: {
    threadId: v.id("threads"),
    query: v.string(),
    keywords: v.string(),
  },
  handler: async (ctx, args): ReturnType<typeof runTinyFishSearch> =>
    runTinyFishSearch(ctx, {
      ...args,
      type: "mas",
    }),
});

export const searchCaseLaw = internalAction({
  args: {
    threadId: v.id("threads"),
    query: v.string(),
    keywords: v.string(),
  },
  handler: async (ctx, args): ReturnType<typeof runTinyFishSearch> =>
    runTinyFishSearch(ctx, {
      ...args,
      type: "cases",
    }),
});

export const ensureSourceSearching = internalMutation({
  args: {
    threadId: v.id("threads"),
    type: v.union(v.literal("sso"), v.literal("mas"), v.literal("cases")),
    query: v.string(),
    url: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sources")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect();
    const current = existing.find((source) => source.type === args.type);

    if (current) {
      await ctx.db.patch(current._id, {
        status: "searching",
        query: args.query,
        url: args.url,
        retryCount: current.retryCount + 1,
        error: undefined,
      });
      return current._id;
    }

    return await ctx.db.insert("sources", {
      threadId: args.threadId,
      type: args.type,
      status: "searching",
      query: args.query,
      url: args.url,
      retryCount: 0,
      progressSteps: [],
    });
  },
});

export const updateSourceStreamingUrl = internalMutation({
  args: {
    sourceId: v.id("sources"),
    streamingUrl: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sourceId, { streamingUrl: args.streamingUrl });
  },
});

export const addSourceProgressStep = internalMutation({
  args: {
    sourceId: v.id("sources"),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const source = await ctx.db.get(args.sourceId);
    if (!source) {
      return;
    }
    const existingSteps = source.progressSteps ?? [];
    const last = existingSteps[existingSteps.length - 1];
    if (last?.text === args.text) {
      return;
    }
    await ctx.db.patch(args.sourceId, {
      progressSteps: [
        ...existingSteps,
        {
          text: args.text,
          timestamp: Date.now(),
        },
      ],
    });
  },
});

export const updateSourceComplete = internalMutation({
  args: {
    sourceId: v.id("sources"),
    results: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sourceId, {
      status: "complete",
      results: args.results,
      error: undefined,
    });
  },
});

export const updateSourceError = internalMutation({
  args: {
    sourceId: v.id("sources"),
    kind: v.union(
      v.literal("no_api_key"),
      v.literal("database_unavailable"),
      v.literal("timeout"),
      v.literal("network_error"),
      v.literal("unknown"),
    ),
    message: v.string(),
    helpMessage: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sourceId, {
      status: "error",
      error: {
        kind: args.kind,
        message: args.message,
        helpMessage: args.helpMessage,
      },
    });
  },
});
