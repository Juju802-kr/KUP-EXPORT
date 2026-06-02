import { readFile } from "fs/promises";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function storageClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET;
  if (!url || !key || !bucket) return null;
  return { bucket, client: createClient(url, key, { auth: { persistSession: false } }) };
}

function downloadHeaders(fileName: string, size?: number, mimeType?: string | null) {
  const asciiFileName = fileName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return {
    "Content-Type": mimeType || "application/octet-stream",
    ...(size !== undefined ? { "Content-Length": String(size) } : {}),
    "Content-Disposition": `attachment; filename="${asciiFileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    "X-Content-Type-Options": "nosniff"
  };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await params;
  const safeName = parts.join("/").replace(/\.\./g, "");
  const attachment = await prisma.attachment.findFirst({ where: { storedName: safeName } });
  const fileName = attachment?.originalName ?? path.basename(safeName);
  const storage = storageClient();

  if (storage) {
    const { data, error } = await storage.client.storage.from(storage.bucket).download(safeName);
    if (error || !data) return new NextResponse("File not found", { status: 404 });
    const body = Buffer.from(await data.arrayBuffer());
    return new NextResponse(body, { headers: downloadHeaders(fileName, body.byteLength, attachment?.mimeType) });
  }

  const body = await readFile(path.join(process.cwd(), "uploads", safeName));
  return new NextResponse(body, { headers: downloadHeaders(fileName, body.byteLength, attachment?.mimeType) });
}
