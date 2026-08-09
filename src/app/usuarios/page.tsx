import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSiteSettings, resolveBrand } from "@/lib/dashboard/site-settings";
import AddUserPanel from "./AddUserPanel";
import BrandListsPanel from "./BrandListsPanel";
import UsersTable from "./UsersTable";

const ROLE_OPTIONS = [
  { value: "ADMIN", label: "Administrador" },
  { value: "EDITOR", label: "Editor" },
  { value: "COMMENTER", label: "Comentarista" },
];

export default async function UsuariosPage() {
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
        message="Solo un Administrador puede crear y administrar usuarios."
      />
    );
  }

  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  const brand = resolveBrand(await getSiteSettings());

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 bg-white px-4 py-8 font-sans text-brand-ink">
      <AddUserPanel email={session.user.email ?? ""} roleOptions={ROLE_OPTIONS} />

      <UsersTable users={users} currentUserId={session.user.id} roleOptions={ROLE_OPTIONS} />

      <div className="h-px bg-line" />
      <BrandListsPanel contentPillars={brand.contentPillars} />
    </div>
  );
}

function AccessMessage({ title, message }: { title: string; message: string }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-3 bg-white px-4 text-center font-sans text-brand-ink">
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="text-sm text-tx-2">{message}</p>
      <Link href="/login" className="text-sm font-bold text-brand-blue">
        Ir a iniciar sesión
      </Link>
    </div>
  );
}
