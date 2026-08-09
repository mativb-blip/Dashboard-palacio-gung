import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// Ruta que Vercel Blob llama dos veces por cada subida: primero para pedir un
// token de cliente de corta duración (autorizado acá, ver onBeforeGenerateToken),
// y el archivo en sí viaja directo del navegador a Blob Storage — nunca pasa
// por esta función, así que no hay techo de tamaño de request de por medio.
// Ver ArtUploadZone.tsx (único consumidor del lado del navegador, vía
// upload() de @vercel/blob/client).

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

// El proyecto usa el store PÚBLICO "prototipo-contenido-public", conectado con
// el prefijo PUBLIC_BLOB. El viejo BLOB_READ_WRITE_TOKEN apunta a un store
// PRIVADO que rechaza access: "public" y devolvía 503 en cada PUT, así que hay
// que pasar el token bueno de forma explícita.
const BLOB_TOKEN = process.env.PUBLIC_BLOB_READ_WRITE_TOKEN ?? process.env.BLOB_READ_WRITE_TOKEN;

export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Necesitás iniciar sesión." }, { status: 401 });
  }

  if (!BLOB_TOKEN) {
    return NextResponse.json(
      { error: "Falta configurar PUBLIC_BLOB_READ_WRITE_TOKEN en el proyecto." },
      { status: 500 },
    );
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      token: BLOB_TOKEN,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["image/*", "video/*"],
        maximumSizeInBytes: MAX_UPLOAD_BYTES,
        // Los videos pueden pesar hasta 500MB; el token debe seguir vivo mientras dura el PUT.
        validUntil: Date.now() + 60 * 60 * 1000, // 1 hora de margen
      }),
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo procesar la subida." },
      { status: 400 },
    );
  }
}
