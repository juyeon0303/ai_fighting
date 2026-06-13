import {
  getDebate,
  getDebateMessages,
  getDebateReport,
  getTimelineEvents,
} from "@/lib/db";
import { debateEvents, startDebateWorker } from "@/lib/debate-engine";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const debate = getDebate(id);

  if (!debate) {
    return new Response("Not found", { status: 404 });
  }

  startDebateWorker();

  const encoder = new TextEncoder();
  const existingMessages = getDebateMessages(id);
  const timeline = getTimelineEvents(id);
  const report = getDebateReport(id);

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      send("init", {
        debate,
        messages: existingMessages,
        timeline,
        report,
      });

      const onMessage = (payload: { debateId: string; message: unknown }) => {
        if (payload.debateId === id) {
          send("message", payload.message);
        }
      };

      const onTimeline = (payload: { debateId: string; event: unknown }) => {
        if (payload.debateId === id) {
          send("timeline", payload.event);
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

      const onEnded = (payload: { debateId: string }) => {
        if (payload.debateId === id) {
          send("ended", { debateId: id });
        }
      };

      debateEvents.on("message", onMessage);
      debateEvents.on("timeline", onTimeline);
      debateEvents.on("report-status", onReportStatus);
      debateEvents.on("report", onReport);
      debateEvents.on("debate-ended", onEnded);

      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": heartbeat\n\n"));
      }, 15000);

      const cleanup = () => {
        clearInterval(heartbeat);
        debateEvents.off("message", onMessage);
        debateEvents.off("timeline", onTimeline);
        debateEvents.off("report-status", onReportStatus);
        debateEvents.off("report", onReport);
        debateEvents.off("debate-ended", onEnded);
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
