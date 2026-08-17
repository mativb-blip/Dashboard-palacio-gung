import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/lib/auth";
import { BrandProvider } from "@/lib/dashboard/BrandContext";
import { getSiteSettings, resolveBrand } from "@/lib/dashboard/site-settings";
import AmbientBackground from "@/components/dashboard/AmbientBackground";
import PushRegister from "@/components/dashboard/PushRegister";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#08090b",
};

// Tema oscuro (clevante.cz, plan del 2026-08-09): Montserrat Variable
// reemplaza tanto Arial (--font-sans) como el par Outfit/Sora que hacía de
// --font-thin — clevante usa una sola fuente variable para todo, el peso
// hace el trabajo que antes hacían dos familias. self-hosted vía
// next/font/google, igual patrón que ya usaba el proyecto con Outfit/Sora.
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: "variable",
  variable: "--font-montserrat",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const brand = resolveBrand(await getSiteSettings());
  return {
    title: `Dashboard de Propuestas — ${brand.brandName}`,
    description: `Revisión y aprobación de propuestas de contenido para redes sociales de ${brand.brandName}: artes, caption, calendario editorial y comentarios.`,
    manifest: "/manifest.json",
    icons: {
      icon: "/icon-192.png",
      apple: "/icon-180.png",
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  const brand = resolveBrand(await getSiteSettings());
  const brandStyle = {
    "--color-brand-blue": brand.brandColorPrimary,
    "--color-brand-blue-700": brand.brandColorPrimaryDark,
    "--color-brand-red": brand.brandColorAccent,
  } as React.CSSProperties;

  return (
    <html lang="es" className={`antialiased ${montserrat.variable}`} style={brandStyle}>
      <body>
        {/* Fondo de toda la app: es lo que dejan ver las superficies de
            vidrio. Va acá y no en cada página para que el ambiente sea
            continuo al navegar. El login monta el suyo encima, porque ahí
            puede ser una foto que sube un Admin. */}
        <AmbientBackground />
        <BrandProvider brand={brand}>
          <SessionProvider session={session}>
            <PushRegister />
            {children}
          </SessionProvider>
        </BrandProvider>
      </body>
    </html>
  );
}
