import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  threads: defineTable({
    query: v.string(),
    status: v.union(
      v.literal("analyzing"),
      v.literal("searching"),
      v.literal("evaluating"),
      v.literal("synthesizing"),
      v.literal("complete"),
      v.literal("error"),
    ),
    sourcesPlan: v.array(v.string()),
    brief: v.optional(v.string()),
    createdAt: v.number(),
  }),
  sources: defineTable({
    threadId: v.id("threads"),
    type: v.union(v.literal("sso"), v.literal("mas"), v.literal("cases")),
    status: v.union(
      v.literal("pending"),
      v.literal("searching"),
      v.literal("complete"),
      v.literal("error"),
    ),
    query: v.string(),
    url: v.string(),
    results: v.optional(v.any()),
    retryCount: v.number(),
    streamingUrl: v.optional(v.string()),
    progressSteps: v.optional(
      v.array(
        v.object({
          text: v.string(),
          timestamp: v.number(),
        }),
      ),
    ),
    error: v.optional(
      v.object({
        kind: v.union(
          v.literal("no_api_key"),
          v.literal("database_unavailable"),
          v.literal("timeout"),
          v.literal("network_error"),
          v.literal("unknown"),
        ),
        message: v.string(),
        helpMessage: v.string(),
      }),
    ),
  }).index("by_thread", ["threadId"]),
});
