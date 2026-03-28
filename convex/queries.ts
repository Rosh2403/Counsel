import { query } from "./_generated/server";
import { v } from "convex/values";

export const getThread = query({
  args: {
    threadId: v.id("threads"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.threadId);
  },
});

export const getSources = query({
  args: {
    threadId: v.id("threads"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sources")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect();
  },
});
