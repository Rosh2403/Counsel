import { Agent, createTool } from "@convex-dev/agent";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const SHARED_INSTRUCTIONS =
  "You are a legal research agent specializing in Singapore law. You search statutes, regulations, and case law to answer legal questions. When you receive search results, evaluate if they sufficiently answer the query. If a source returned too few or irrelevant results, use refine_and_search to try again with better keywords.";

export function createLegalResearchAgent(appThreadId: Id<"threads">) {
  return new Agent(components.agent, {
    name: "Counsel Research Agent",
    instructions: SHARED_INSTRUCTIONS,
    languageModel: openai.chat("gpt-4o"),
    maxSteps: 10,
    tools: {
      search_statutes: createTool({
        description: "Search Singapore statutes in SSO via TinyFish browser automation.",
        inputSchema: z.object({
          query: z.string(),
          keywords: z.string(),
        }),
        execute: async (ctx, input) => {
          return await ctx.runAction(internal.tinyfish.searchStatutes, {
            threadId: appThreadId,
            query: input.query,
            keywords: input.keywords,
          });
        },
      }),
      search_regulations: createTool({
        description: "Search MAS regulations and guidance via TinyFish browser automation.",
        inputSchema: z.object({
          query: z.string(),
          keywords: z.string(),
        }),
        execute: async (ctx, input) => {
          return await ctx.runAction(internal.tinyfish.searchRegulations, {
            threadId: appThreadId,
            query: input.query,
            keywords: input.keywords,
          });
        },
      }),
      search_case_law: createTool({
        description:
          "Search Singapore case law (Singapore Law Watch) via TinyFish browser automation.",
        inputSchema: z.object({
          query: z.string(),
          keywords: z.string(),
        }),
        execute: async (ctx, input) => {
          return await ctx.runAction(internal.tinyfish.searchCaseLaw, {
            threadId: appThreadId,
            query: input.query,
            keywords: input.keywords,
          });
        },
      }),
      refine_and_search: createTool({
        description:
          "Retry one source with a refined query when initial results are insufficient.",
        inputSchema: z.object({
          source: z.enum(["sso", "mas", "cases"]),
          refined_query: z.string(),
        }),
        execute: async (ctx, input) => {
          if (input.source === "sso") {
            return await ctx.runAction(internal.tinyfish.searchStatutes, {
              threadId: appThreadId,
              query: input.refined_query,
              keywords: "",
            });
          }
          if (input.source === "mas") {
            return await ctx.runAction(internal.tinyfish.searchRegulations, {
              threadId: appThreadId,
              query: input.refined_query,
              keywords: "",
            });
          }
          return await ctx.runAction(internal.tinyfish.searchCaseLaw, {
            threadId: appThreadId,
            query: input.refined_query,
            keywords: "",
          });
        },
      }),
    },
  });
}
