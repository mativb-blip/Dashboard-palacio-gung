import Link from "next/link";
import { auth } from "@/lib/auth";
import { listSessions } from "./actions";
import MoodboardWorkspace from "./MoodboardWorkspace";

/** Tablero de referencias del Admin. Lo EDITA solo él; el resto de los roles
 * lo ve en modo lectura, para tener a mano el material de referencia sin
 * poder tocarlo. El gate real de escritura vive en cada server action (ver
 * requireAdmin en actions.ts): esconder los controles no es un permiso. */
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

  const sessions = await listSessions();
  const canEdit = session.user.role === "ADMIN";

  return <MoodboardWorkspace initialSessions={sessions} canEdit={canEdit} />;
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
