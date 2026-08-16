import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import type { Role } from "@/generated/prisma/client";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    // Email + contraseña — único método de login. La contraseña es
    // obligatoria por usuario (ver /usuarios): sin una cargada, este
    // proveedor rechaza el login sin importar qué se envíe.
    Credentials({
      id: "credentials",
      name: "Email y contraseña",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === "string" ? credentials.email.trim().toLowerCase() : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.password) return null;

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return null;

        return user;
      },
    }),
  ],
  callbacks: {
    // Gate de acceso centralizado — corre en src/proxy.ts para toda la app.
    // /login queda siempre público (ahí se inicia sesión, y un Admin ya
    // logueado también puede entrar para personalizar el fondo/logo).
    // /diagnostico también: existe para cuando NO se puede iniciar sesión, así
    // que gatearlo lo volvería inútil. No expone datos de nadie — ver
    // src/app/api/diagnostico/route.ts.
    authorized({ request, auth }) {
      const { pathname } = request.nextUrl;
      if (pathname === "/login" || pathname === "/diagnostico" || pathname === "/api/diagnostico") {
        return true;
      }
      return Boolean(auth?.user);
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
      }
      return session;
    },
  },
});
