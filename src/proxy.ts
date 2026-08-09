// Gate de acceso de toda la app — Next.js 16 renombró "middleware" a "proxy"
// (mismo archivo, misma función, distinto nombre). Corre en runtime Node.js
// por defecto, así que puede usar el `auth` completo (con Prisma adapter)
// sin el split edge/node que pedían versiones anteriores.
// La decisión real (qué rutas son públicas) vive en el callback
// `authorized` de src/lib/auth.ts, para no duplicarla acá.
//
// OJO: Next.js exige un `export default` real acá — el re-export
// `export { auth as default } from "..."` no lo detecta como válido
// para este archivo (falla en build/dev con "must export a function").
import { auth } from "@/lib/auth";

export default auth;

export const config = {
  matcher: [
    "/((?!api/auth|api/cron|_next/static|_next/image|favicon.ico|manifest.json|sw.js|icon-192.png|icon-512.png|icon-180.png).*)",
  ],
};
