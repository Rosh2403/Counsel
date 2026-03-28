import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// --- MUTATIONS ---

export const createDocument = mutation({
  args: {
    fileName: v.string(),
    fileType: v.string(),
    textContent: v.string(),
  },
  returns: v.id("documents"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("documents", {
      fileName: args.fileName,
      fileType: args.fileType,
      textContent: args.textContent,
      status: "uploaded",
      createdAt: Date.now(),
    });
  },
});

export const updateDocumentStatus = mutation({
  args: {
    documentId: v.id("documents"),
    status: v.union(
      v.literal("uploaded"),
      v.literal("analyzing"),
      v.literal("verifying"),
      v.literal("complete"),
      v.literal("error"),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.documentId, { status: args.status });
  },
});

export const storeAnalysis = mutation({
  args: {
    documentId: v.id("documents"),
    summary: v.optional(v.string()),
    entities: v.optional(v.any()),
    riskFlags: v.optional(v.any()),
    clauses: v.optional(v.any()),
    documentType: v.optional(v.string()),
    verificationTasks: v.optional(v.any()),
    suggestedQueries: v.optional(v.array(v.string())),
    processingTimeMs: v.optional(v.number()),
  },
  returns: v.id("documentAnalysis"),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.documentId, { status: "analyzing" });

    // Upsert: update existing row if one exists, otherwise insert
    const existing = await ctx.db
      .query("documentAnalysis")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .first();

    const data = {
      documentId: args.documentId,
      summary: args.summary,
      entities: args.entities,
      riskFlags: args.riskFlags,
      clauses: args.clauses,
      documentType: args.documentType,
      verificationTasks: args.verificationTasks,
      suggestedQueries: args.suggestedQueries,
      processingTimeMs: args.processingTimeMs,
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
      return existing._id;
    }
    return await ctx.db.insert("documentAnalysis", data);
  },
});

export const storeComplianceReport = mutation({
  args: {
    documentId: v.id("documents"),
    complianceReport: v.string(),
  },
  handler: async (ctx, args) => {
    const analysis = await ctx.db
      .query("documentAnalysis")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .first();
    if (analysis) {
      await ctx.db.patch(analysis._id, {
        complianceReport: args.complianceReport,
      });
    }
    await ctx.db.patch(args.documentId, { status: "complete" });
  },
});

export const linkVerificationThread = mutation({
  args: {
    documentId: v.id("documents"),
    threadId: v.id("threads"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.documentId, {
      verificationThreadId: args.threadId,
    });
  },
});

export const linkResearchThread = mutation({
  args: {
    analysisId: v.id("documentAnalysis"),
    threadId: v.id("threads"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.analysisId, { linkedThreadId: args.threadId });
  },
});

export const createVerificationSource = mutation({
  args: {
    threadId: v.id("threads"),
    type: v.union(v.literal("sso"), v.literal("mas"), v.literal("cases")),
    query: v.string(),
  },
  returns: v.id("sources"),
  handler: async (ctx, args) => {
    const urls: Record<string, string> = {
      sso: "https://sso.agc.gov.sg/Search",
      mas: "https://www.mas.gov.sg/search",
      cases: "https://www.singaporelawwatch.sg/Judgments",
    };
    return await ctx.db.insert("sources", {
      threadId: args.threadId,
      type: args.type,
      status: "pending",
      query: args.query,
      url: urls[args.type],
      retryCount: 0,
      progressSteps: [],
    });
  },
});

export const createVerificationThread = mutation({
  args: {
    documentId: v.id("documents"),
    documentType: v.string(),
  },
  returns: v.id("threads"),
  handler: async (ctx, args) => {
    const threadId = await ctx.db.insert("threads", {
      query: `Verification: ${args.documentType} contract`,
      status: "searching",
      sourcesPlan: ["sso", "mas", "cases"],
      createdAt: Date.now(),
    });
    await ctx.db.patch(args.documentId, {
      verificationThreadId: threadId,
      status: "verifying",
    });
    return threadId;
  },
});

export const triggerVerificationSearch = mutation({
  args: {
    threadId: v.id("threads"),
    type: v.union(v.literal("sso"), v.literal("mas"), v.literal("cases")),
    query: v.string(),
    keywords: v.string(),
  },
  handler: async (ctx, args) => {
    const action =
      args.type === "sso"
        ? internal.tinyfish.searchStatutes
        : args.type === "mas"
          ? internal.tinyfish.searchRegulations
          : internal.tinyfish.searchCaseLaw;
    await ctx.scheduler.runAfter(0, action, {
      threadId: args.threadId,
      query: args.query,
      keywords: args.keywords,
    });
  },
});

// --- QUERIES ---

export const getDocument = query({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.documentId);
  },
});

export const getAnalysis = query({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("documentAnalysis")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .first();
  },
});

export const getDocumentByThreadId = query({
  args: {
    threadId: v.id("threads"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("documents")
      .filter((q) => q.eq(q.field("verificationThreadId"), args.threadId))
      .first();
  },
});
