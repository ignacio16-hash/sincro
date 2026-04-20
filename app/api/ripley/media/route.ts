import { NextRequest } from "next/server";
import axios from "axios";
import { prisma } from "@/lib/db";

// Proxy de imágenes de Ripley (Mirakl).
//
// Las URLs que devuelve OR11/OR15 en product_medias son:
//   - relativas al instanceUrl  (e.g. "/media/product/image/<uuid>")
//   - protegidas por Authorization: <api-key>
//
// El browser no puede pedirlas directamente. Este endpoint las baja en el
// servidor con la api-key configurada y las pipea a la <img> con cache largo.
//
// Uso:  /api/ripley/media?path=%2Fmedia%2Fproduct%2Fimage%2F<uuid>
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path") || "";

  // Validación: solo paths /media/* del propio instance, sin esquema externo.
  if (!path.startsWith("/media/")) {
    return new Response("Bad path", { status: 400 });
  }

  const cred = await prisma.apiCredential.findUnique({ where: { platform: "ripley" } });
  const conf = cred?.config as Record<string, string> | undefined;
  if (!conf?.apiKey || !conf?.instanceUrl) {
    return new Response("Ripley no configurado", { status: 503 });
  }

  try {
    const upstream = await axios.get(`${conf.instanceUrl}${path}`, {
      headers: { Authorization: conf.apiKey },
      responseType: "arraybuffer",
      timeout: 15000,
      // Mirakl puede redirigir a un CDN público — seguimos hasta 3 redirects.
      maxRedirects: 3,
      validateStatus: (s) => s >= 200 && s < 400,
    });

    const contentType =
      (upstream.headers["content-type"] as string | undefined) || "image/jpeg";

    return new Response(upstream.data as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        // Las imágenes de productos cambian rara vez → cache agresivo.
        "Cache-Control": "public, max-age=604800, immutable",
      },
    });
  } catch (e) {
    const err = e as { response?: { status?: number }; message?: string };
    const status = err.response?.status ?? 502;
    return new Response(`Upstream ${status}: ${err.message || "error"}`, { status });
  }
}
