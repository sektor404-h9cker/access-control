import { connection } from "next/server";
import { get } from "@/lib/db";
import { latestFrame, noteViewer } from "@/lib/gate-store";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";

export const instant = false;

// Один поток вместо отдельного запроса на каждый кадр: браузер сам сменяет картинку.
export async function GET(request, { params }) {
  await connection();
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!can(user, "monitoring.view") && !can(user, "cameras.view")) return new Response("Forbidden", { status: 403 });
  const { cameraId } = await params;
  const camera = get("SELECT id FROM cameras WHERE id = ?", [cameraId]);
  if (!camera) return new Response("Not found", { status: 404 });
  const viewer = request.headers.get("x-viewer") || crypto.randomUUID();
  let closed = false;
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let last = "";
      const timer = setInterval(() => {
        if (closed || request.signal.aborted) {
          clearInterval(timer);
          return;
        }
        const frame = latestFrame(cameraId);
        const seq = String(frame?.camera?.seq || "");
        if (!frame || !seq || seq === last) return;
        // Браузер ещё не забрал прошлый кадр: старый не копим, на следующем тике уйдёт свежий.
        if (controller.desiredSize != null && controller.desiredSize <= 0) return;
        last = seq;
        noteViewer(cameraId, viewer);
        const head = `--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.bytes.length}\r\n\r\n`;
        try {
          controller.enqueue(encoder.encode(head));
          controller.enqueue(frame.bytes);
          controller.enqueue(encoder.encode("\r\n"));
        } catch {
          clearInterval(timer);
        }
      }, 20);
      const stop = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        try { controller.close(); } catch { /* поток уже закрыт */ }
      };
      request.signal.addEventListener("abort", stop);
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "multipart/x-mixed-replace; boundary=frame",
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
