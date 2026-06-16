import {
  getDebate,
  getDebateMessages,
  getDebateReport,
} from "@/lib/db";
import { sanitizeDebateForClient } from "@/lib/debate-llm-config";
import { debateEvents, processDebateTurn, startDebateWorker } from "@/lib/debate-engine";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const debate = await getDebate(id);

  if (!debate) {
    return new Response("Not found", { status: 404 });
  }

  startDebateWorker();

  const encoder = new TextEncoder();
  const [existingMessages, report] = await Promise.all([
    getDebateMessages(id),
    getDebateReport(id),
  ]);

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      send("init", {
        debate: sanitizeDebateForClient(debate),
        messages: existingMessages,
        report,
      });

      if (debate.status === "active") {
        processDebateTurn(id).catch(console.error);
      }

      const onMessage = (payload: { debateId: string; message: unknown }) => {
        if (payload.debateId === id) {
          send("message", payload.message);
        }
      };

      const onReportStatus = (payload: {
        debateId: string;
        reportStatus: string;
      }) => {
        if (payload.debateId === id) {
          send("report-status", { reportStatus: payload.reportStatus });
        }
      };

      const onReport = (payload: { debateId: string; report: unknown }) => {
        if (payload.debateId === id) {
          send("report", payload.report);
        }
      };

      const onEnded = (payload: { debateId: string; endReason?: string | null }) => {
        if (payload.debateId === id) {
          send("ended", { debateId: id, endReason: payload.endReason ?? null });
        }
      };

      const onDebateUpdate = (payload: {
        debateId: string;
        debate: unknown;
      }) => {
        if (payload.debateId === id) {
          send("debate-update", {
            debate: sanitizeDebateForClient(
              payload.debate as Parameters<typeof sanitizeDebateForClient>[0],
            ),
          });
        }
      };

      debateEvents.on("message", onMessage);
      debateEvents.on("report-status", onReportStatus);
      debateEvents.on("report", onReport);
      debateEvents.on("debate-ended", onEnded);
      debateEvents.on("debate-update", onDebateUpdate);

      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": heartbeat\n\n"));
      }, 15000);

      const turnNudge = setInterval(() => {
        if (_request.signal.aborted) return;
        getDebate(id)
          .then((d) => {
            if (d?.status === "active") {
              processDebateTurn(id).catch(console.error);
            }
          })
          .catch(console.error);
      }, 3000);

      const cleanup = () => {
        clearInterval(heartbeat);
        clearInterval(turnNudge);
        debateEvents.off("message", onMessage);
        debateEvents.off("report-status", onReportStatus);
        debateEvents.off("report", onReport);
        debateEvents.off("debate-ended", onEnded);
        debateEvents.off("debate-update", onDebateUpdate);
      };

      _request.signal.addEventListener("abort", () => {
        cleanup();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
