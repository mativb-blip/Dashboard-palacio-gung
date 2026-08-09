import { auth } from "@/lib/auth";
import { getLoginAppearance } from "./actions";
import LoginForm from "./LoginForm";

interface LoginPageProps {
  searchParams: Promise<{ callbackUrl?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const [session, appearance, params] = await Promise.all([auth(), getLoginAppearance(), searchParams]);
  const isAdmin = session?.user.role === "ADMIN";

  return (
    <LoginForm
      isAdmin={isAdmin}
      backgroundUrl={appearance.backgroundUrl}
      logoUrl={appearance.logoUrl}
      callbackUrl={params.callbackUrl}
    />
  );
}
