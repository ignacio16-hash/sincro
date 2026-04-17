import { runFullSync, SyncProgressEvent } from "@/lib/sync";

export const dynamic = "force-dynamic";

// Prevent multiple simultaneous syncs from this endpoint
let streamSyncRunning = false;

// GET /api/sync/stream — Server-Sent Events stream of sync progress.
// The frontend connects via EventSource; each event is a JSON SyncProgressEvent.
export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: SyncProgressEvent | { type: string; message?: string }) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Controller may already be closed if client disconnected
        }
      };

      if (streamSyncRunning) {
        send({ type: "error", message: "Ya hay una sincronización en curso" });
        controller.close();
        return;
      }

      streamSyncRunning = true;
      try {
        await runFullSync((event: SyncProgressEvent) => send(event));
        send({ type: "done" });
      } catch (err) {
        send({ type: "error", message: (err as Error).message });
      } finally {
        streamSyncRunning = false;
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // disable Nginx/Railway buffering
    },
  });
}
