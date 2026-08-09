import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Los artes/video ya no viajan como data URL por Server Actions (ver
  // ArtUploadZone.tsx — suben directo a Vercel Blob), así que no hace falta
  // el bodySizeLimit ampliado que este proyecto tuvo antes.
  //
  // Sin "output: standalone" a propósito: es para self-hosting/Docker: en
  // Vercel el propio build pipeline arma su bundle optimizado, no hace falta.
};

export default nextConfig;
