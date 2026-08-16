import { cookies } from "next/headers";
import { NextResponse } from "next/server";

// Qué ve el SERVIDOR de la petición. Sirve para el caso "inicio sesión y me
// rebota al login": dice si la cookie de sesión llegó o no, que es lo que
// separa "el navegador no la guardó" de cualquier otra causa.
//
// Deliberadamente no devuelve el VALOR de ninguna cookie ni datos del
// usuario: solo nombres y booleanos. Es una ruta abierta (ver el callback
// `authorized` en src/lib/auth.ts) porque tiene que poder consultarse
// justamente cuando no hay sesión.

export async function GET(): Promise<NextResponse> {
  const jar = await cookies();
  const names = jar.getAll().map((c) => c.name);

  // Auth.js nombra la cookie `authjs.session-token`, y en HTTPS le antepone
  // `__Secure-`. Si viene troceada por tamaño, agrega `.0`, `.1`, etc.
  const sessionCookies = names.filter((name) => name.includes("authjs.session-token"));

  return NextResponse.json(
    {
      horaDelServidor: new Date().toISOString(),
      llegoCookieDeSesion: sessionCookies.length > 0,
      cookiesDeSesion: sessionCookies,
      totalDeCookies: names.length,
      nombresDeCookies: names,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
