import { NextRequest } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { analysisGraph } from "@/lib/analysis-graph";
import type { Id } from "../../../../convex/_generated/dataModel";

const GRAPH_NODES = ["analyze", "classify", "verify", "evaluate", "refine", "synthesize"];

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { documentId, textContent } = body as {
    documentId: string;
    textContent: string;
  };

  if (!textContent || textContent.length < 50) {
    return new Response(
      JSON.stringify({ error: "Document text too short (min 50 chars)" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

  // Set document status to analyzing
  await convex.mutation(api.documents.updateDocumentStatus, {
    documentId: documentId as Id<"documents">,
    status: "analyzing",
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function emit(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      try {
        const startTime = Date.now();

        // Use streamEvents to get per-node updates
        const eventStream = analysisGraph.streamEvents(
          { documentId, textContent },
          { version: "v2" },
        );

        let analysisStored = false;
        // Accumulate state from all node outputs
        const accumulated: Record<string, unknown> = {};

        for await (const event of eventStream) {
          // on_chain_start: a node is starting
          if (event.event === "on_chain_start" && GRAPH_NODES.includes(event.name)) {
            emit({ step: event.name, status: "running" });
          }

          // on_chain_end: a node completed
          if (event.event === "on_chain_end" && GRAPH_NODES.includes(event.name)) {
            const output = event.data?.output as Record<string, unknown> | undefined;

            // Merge node output into accumulated state
            if (output) {
              Object.assign(accumulated, output);
            }

            // After CLASSIFY completes, store analysis in Convex using accumulated state
            if (event.name === "classify" && !analysisStored) {
              analysisStored = true;
              const elapsed = Date.now() - startTime;

              try {
                await convex.mutation(api.documents.storeAnalysis, {
                  documentId: documentId as Id<"documents">,
                  summary: accumulated.summary as string | undefined,
                  entities: accumulated.entities,
                  riskFlags: accumulated.riskFlags,
                  clauses: accumulated.clauses,
                  documentType: accumulated.documentType as string | undefined,
                  verificationTasks: accumulated.verificationTasks,
                  suggestedQueries: accumulated.suggestedQueries as string[] | undefined,
                  processingTimeMs: elapsed,
                });
              } catch {
                // Non-fatal: analysis display will still work from SSE data
              }
            }

            // Include verificationThreadId so frontend can show TinyFish iframes
            const emitData: Record<string, unknown> = {
              step: event.name,
              status: "complete",
            };

            if (output) {
              // Only send relevant fields, not the entire state
              if (event.name === "analyze") {
                emitData.data = {
                  summary: output.summary,
                  entities: output.entities,
                  riskFlags: output.riskFlags,
                  clauses: output.clauses,
                };
              } else if (event.name === "classify") {
                emitData.data = {
                  documentType: output.documentType,
                  verificationTasks: output.verificationTasks,
                  suggestedQueries: output.suggestedQueries,
                };
              } else if (event.name === "verify") {
                emitData.data = {
                  verificationThreadId: output.verificationThreadId,
                };
              } else if (event.name === "evaluate") {
                emitData.data = {
                  needsRetry: output.needsRetry,
                };
              } else if (event.name === "synthesize") {
                emitData.data = {
                  complianceReport: output.complianceReport,
                };
              }
            }

            emit(emitData);
          }
        }

        emit({ step: "done" });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";

        // Set document status to error
        try {
          await convex.mutation(api.documents.updateDocumentStatus, {
            documentId: documentId as Id<"documents">,
            status: "error",
          });
        } catch {
          // ignore
        }

        emit({ step: "error", error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
