import { WorkflowManager } from "@convex-dev/workflow";
import { createThread } from "@convex-dev/agent";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
} from "./_generated/server";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { createLegalResearchAgent } from "./agent";

export const workflow = new WorkflowManager(components.workflow);

const SYNTHESIS_PROMPT = `You are a senior legal researcher preparing a research brief for a lawyer.

Legal question: {query}

Research findings:

## Legislation
{statutes_json}

## Regulatory Guidance
{regulations_json}

## Case Law
{cases_json}

Write a brief in this format:

# Legal Research Brief

**Query:** {query}
**Date:** {today}
**Sources Consulted:** {source_count} sources

## Executive Summary
[2-3 sentences]

## Applicable Legislation
[Section references]

## Regulatory Framework
[Regulations and requirements]

## Relevant Case Law
[Cases and holdings]

## Analysis
[Synthesize findings]

## Citations
[1] [Title](URL)
[2] [Title](URL)

Rules: formal legal language, cite specific sections, use [Title](URL) markdown link format for all citations so they render as clickable links, do not fabricate anything not in the provided sources.`;

export const startResearch = mutation({
  args: { query: v.string() },
  returns: v.id("threads"),
  handler: async (ctx, args) => {
    const now = Date.now();
    const sourcesPlan = ["sso", "mas", "cases"];
    const threadId = await ctx.db.insert("threads", {
      query: args.query,
      status: "analyzing",
      sourcesPlan,
      createdAt: now,
    });

    await ctx.db.insert("sources", {
      threadId,
      type: "sso",
      status: "pending",
      query: args.query,
      url: "https://sso.agc.gov.sg/Search",
      retryCount: 0,
      progressSteps: [],
    });
    await ctx.db.insert("sources", {
      threadId,
      type: "mas",
      status: "pending",
      query: args.query,
      url: "https://www.mas.gov.sg/search?q=" + encodeURIComponent(args.query),
      retryCount: 0,
      progressSteps: [],
    });
    await ctx.db.insert("sources", {
      threadId,
      type: "cases",
      status: "pending",
      query: args.query,
      url:
        "https://www.singaporelawwatch.sg/Judgments?SearchTerm=" +
        encodeURIComponent(args.query),
      retryCount: 0,
      progressSteps: [],
    });

    await workflow.start(ctx, internal.research.researchWorkflow, {
      threadId,
      query: args.query,
    });

    return threadId;
  },
});

export const researchWorkflow = workflow.define({
  args: {
    threadId: v.id("threads"),
    query: v.string(),
  },
  returns: v.string(),
  handler: async (step, args): Promise<string> => {
    await step.runMutation(internal.research.updateThreadStatus, {
      threadId: args.threadId,
      status: "analyzing",
    });

    await step.runAction(internal.research.runResearchAgent, {
      threadId: args.threadId,
      query: args.query,
    });

    await step.runMutation(internal.research.updateThreadStatus, {
      threadId: args.threadId,
      status: "synthesizing",
    });

    const brief = await step.runAction(internal.research.generateBrief, {
      threadId: args.threadId,
      query: args.query,
    });

    await step.runMutation(internal.research.storeBrief, {
      threadId: args.threadId,
      brief,
    });

    return brief;
  },
});

export const runResearchAgent = internalAction({
  args: {
    threadId: v.id("threads"),
    query: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.research.updateThreadStatus, {
      threadId: args.threadId,
      status: "searching",
    });

    // Hackathon fallback: allow end-to-end flow without OpenAI credits.
    if (!process.env.OPENAI_API_KEY) {
      await ctx.runAction(internal.tinyfish.searchStatutes, {
        threadId: args.threadId,
        query: args.query,
        keywords: "statutes legislation singapore",
      });
      await ctx.runAction(internal.tinyfish.searchRegulations, {
        threadId: args.threadId,
        query: args.query,
        keywords: "mas guideline notice circular",
      });
      await ctx.runAction(internal.tinyfish.searchCaseLaw, {
        threadId: args.threadId,
        query: args.query,
        keywords: "high court court of appeal",
      });

      await ctx.runMutation(internal.research.updateThreadStatus, {
        threadId: args.threadId,
        status: "evaluating",
      });
      return "OpenAI key missing: completed deterministic source searches.";
    }

    const agentThreadId = await createThread(ctx, components.agent, {
      title: `Research: ${args.query}`,
    });

    const agent = createLegalResearchAgent(args.threadId);
    const result = await agent.generateText(
      ctx,
      { threadId: agentThreadId },
      {
        prompt: `Research this legal question under Singapore law: "${args.query}".
Use tools to search statutes, MAS regulations, and case law.
If one source is weak, use refine_and_search for that source.`,
      },
    );

    await ctx.runMutation(internal.research.updateThreadStatus, {
      threadId: args.threadId,
      status: "evaluating",
    });

    return result.text;
  },
});

export const generateBrief = internalAction({
  args: {
    threadId: v.id("threads"),
    query: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const sources = await ctx.runQuery(internal.research.getThreadSourcesForSynthesis, {
      threadId: args.threadId,
    });

    const statutes = sources.filter((s) => s.type === "sso");
    const regulations = sources.filter((s) => s.type === "mas");
    const cases = sources.filter((s) => s.type === "cases");
    const sourceCount = sources.filter((s) => s.status === "complete").length;

    const today = new Date().toISOString().slice(0, 10);

    if (!process.env.OPENAI_API_KEY) {
      const citations = sources
        .flatMap((source) => {
          const resultBlock = source.results as any;
          if (!resultBlock || typeof resultBlock !== "object") return [];
          const arr =
            resultBlock.statutes || resultBlock.regulations || resultBlock.cases || [];
          if (!Array.isArray(arr)) return [];
          return arr
            .map((item: any) => ({
              title:
                item?.act_name ||
                item?.title ||
                item?.case_name ||
                `${source.type.toUpperCase()} result`,
              url: item?.url,
            }))
            .filter((x: any) => typeof x.url === "string" && x.url.length > 0);
        })
        .slice(0, 12);

      const citationLines = citations.length
        ? citations.map((c, i) => `[${i + 1}] [${c.title}](${c.url})`).join("\n")
        : "[1] Source extraction completed, but no canonical URLs were returned.";

      return `# Legal Research Brief

**Query:** ${args.query}
**Date:** ${today}
**Sources Consulted:** ${sourceCount} sources

## Executive Summary
OpenAI credits are not configured yet, so this is a deterministic fallback brief generated from extracted source data. The agent completed source collection and citations are listed below.

## Applicable Legislation
See extracted statutes in the source panel.

## Regulatory Framework
See extracted MAS regulatory materials in the source panel.

## Relevant Case Law
See extracted case law findings in the source panel.

## Analysis
Once OPENAI_API_KEY is set, this section will be replaced by a full synthesized legal analysis.

## Citations
${citationLines}
`;
    }

    const prompt = SYNTHESIS_PROMPT.replaceAll("{query}", args.query)
      .replace("{today}", today)
      .replace("{source_count}", String(sourceCount))
      .replace("{statutes_json}", JSON.stringify(statutes, null, 2))
      .replace("{regulations_json}", JSON.stringify(regulations, null, 2))
      .replace("{cases_json}", JSON.stringify(cases, null, 2));

    const { text } = await generateText({
      model: openai.chat("gpt-4o"),
      prompt,
    });
    return text;
  },
});

export const updateThreadStatus = internalMutation({
  args: {
    threadId: v.id("threads"),
    status: v.union(
      v.literal("analyzing"),
      v.literal("searching"),
      v.literal("evaluating"),
      v.literal("synthesizing"),
      v.literal("complete"),
      v.literal("error"),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.threadId, { status: args.status });
  },
});

export const storeBrief = internalMutation({
  args: {
    threadId: v.id("threads"),
    brief: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.threadId, {
      brief: args.brief,
      status: "complete",
    });
  },
});

export const getThreadSourcesForSynthesis = internalQuery({
  args: {
    threadId: v.id("threads"),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sources")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect();
  },
});
