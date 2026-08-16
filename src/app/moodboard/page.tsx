import Link from "next/link";
import { auth } from "@/lib/auth";
import { listSessions } from "./actions";
import MoodboardWorkspace from "./MoodboardWorkspace";

/** Tablero personal del Admin — no es parte del flujo de aprobación que ve el
 * cliente. El gate se repite en cada server action (ver requireAdmin en
 * actions.ts): esto solo evita renderizar la pantalla al que no corresponde. */
export default async function MoodboardPage() {
  const session = await auth();

  if (!session) {
    return (
      <AccessMessage
        title="Necesitás iniciar sesión"
        message="Esta pantalla es solo para usuarios con sesión iniciada."
      />
    );
  }

  if (session.user.role !== "ADMIN") {
    return (
      <AccessMessage
        title="Acceso restringido"
        message="El Moodboard es un espacio de trabajo personal del Administrador."
      />
    );
  }

  const sessions = await listSessions();

  return <MoodboardWorkspace initialSessions={sessions} />;
}

function AccessMessage({ title, message }: { title: string; message: string }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-3 bg-[var(--bg)] px-4 text-center font-sans text-brand-ink">
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="text-sm text-tx-2">{message}</p>
      <Link href="/" className="text-sm font-bold text-brand-blue">
        Volver al panel
      </Link>
    </div>
  );
}
