import type { Metadata, Viewport } from "next";
import { Outfit, Sora } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/lib/auth";
import { BrandProvider } from "@/lib/dashboard/BrandContext";
import { getSiteSettings, resolveBrand } from "@/lib/dashboard/site-settings";
import PushRegister from "@/components/dashboard/PushRegister";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#163f6b",
};

// Sustitutos gratuitos de Scansky (fuente de pago del cliente, no incluida
// en este repo — ver Desing/README.md). Outfit es la principal por venir
// etiquetada como "Geometric" en Google Fonts, igual que Scansky; Sora queda
// de fallback en --font-thin (globals.css) si Outfit no estuviera disponible.
const outfit = Outfit({
  subsets: ["latin"],
  weight: "variable",
  variable: "--font-outfit",
  display: "swap",
});

const sora = Sora({
  subsets: ["latin"],
  weight: "variable",
  variable: "--font-sora",
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
    <html lang="es" className={`antialiased ${outfit.variable} ${sora.variable}`} style={brandStyle}>
      <body>
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
