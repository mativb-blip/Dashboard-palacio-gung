@AGENTS.md

# Prototipo Aprobación de Contenidos

## Qué es
Dashboard web para que un cliente revise y apruebe propuestas de contenido para redes sociales: ve los artes (imágenes/video), el caption con hashtags, fecha/hora/red/formato, y un calendario editorial (vistas Semana/Mes). Puede navegar los artes en Slider o Grilla, descargar imágenes/video, copiar el caption y dejar comentarios (generales o por arte).

Vista única, responsive, alta fidelidad. Idioma: español (RD).

**Producto white-label**: el branding (nombre, colores, handle de Instagram, remitente/destinatarios de notificación) no está fijo en el código — sale de la tabla `SiteSettings` (una fila por deployment), con fallback a los valores de `DEFAULT_BRAND` en `src/lib/dashboard/brand-defaults.ts`. Modelo de despliegue: una instancia + una base de datos por cliente.

## Stack
- **Next.js 16.2.10** (App Router, Turbopack en dev)
- **React 19.2.4** / **TypeScript 5** (strict)
- **Tailwind CSS 4** (vía `@tailwindcss/postcss`)
- **Prisma ORM v7** (`@prisma/adapter-pg`) + PostgreSQL
- **Auth.js v5** (email/contraseña — único método de login en este prototipo)
- **Vercel Blob** para artes/video/capturas — subida directa desde el navegador (`@vercel/blob/client`), sin pasar por el servidor (ver `src/app/api/blob/upload/route.ts`)
- **Notificaciones**, doble canal (email + push), ninguno bloqueante, no-op silencioso si sus variables de entorno no están configuradas (ver `.env.example`):
  - Email vía Gmail SMTP (`nodemailer` + contraseña de aplicación, ver `notify-email.ts`) — remitente fijo a `GMAIL_USER`, destinatario sale de `SiteSettings`. Se dispara solo en comentarios nuevos (`addComment()` en `proposals-actions.ts`).
  - Web Push (PWA, `web-push` + claves VAPID, ver `notify-push.ts` y `NotificationToggle.tsx`) — en iPhone requiere instalar el dashboard a Inicio primero (Safari → Compartir → Agregar a Inicio), Safari sin instalar no recibe push. Se dispara en: comentario nuevo, aprobación de "Jun" (`updateProposal()`), y los recordatorios de publicación de `/api/cron/reminders`.
- **Recordatorios de publicación** (1h antes + a la hora): un GitHub Action (`.github/workflows/reminders.yml`) llama a `/api/cron/reminders` cada 10 min — el cron nativo de Vercel en Hobby solo corre 1 vez por día, no alcanza. Autenticado con `CRON_SECRET` (bearer token), no con sesión — por eso `api/cron` está excluido del gate de login en `src/proxy.ts`. La hora de la propuesta (`Proposal.time`, texto libre tipo "6:30 PM") se parsea asumiendo siempre UTC-4 (`schedule-time.ts` — Santo Domingo no tiene horario de verano). Cada propuesta dispara cada recordatorio una sola vez (`reminderSentT60`/`reminderSentT0`).
- Alias de import `@/*` → `src/*`

Scripts: `npm run dev`, `npm run build` (corre `prisma migrate deploy` primero), `npm start`, `npm run lint`, `npm run db:migrate`, `npm run db:seed`.

> Ver [AGENTS.md](AGENTS.md): esta versión de Next.js tiene breaking changes respecto al conocimiento de entrenamiento — consultar `node_modules/next/dist/docs/` antes de escribir código nuevo.

## Design tokens
- Colores base (placeholder, se sobreescriben por `SiteSettings` vía variables CSS en `layout.tsx`): azul `#163F6B`, rojo `#E81F35`, tinta `#1A1A1A` (`--brand-ink`), fondo siempre blanco, `--panel-2` gris claro, hairlines 1px (`--line`).
- Tipografía: `--font-sans` = Arial (base); `--font-thin` = Scansky 300 (títulos/numerales).
- Radios 2–4px máx 8px (nada tipo píldora). Sombras suaves (`--sh-1`/`--sh-2`).
- Pills de estado: Aprobado = azul sólido; Cambios solicitados = contorno rojo; En revisión = contorno gris.

## Estado y comentarios
El estado de una propuesta se deriva automáticamente (no se elige a mano): **Aprobado** cuando la casilla de aprobación ("Jun") está marcada y los comentarios (si hay) están resueltos; **Cambios solicitados** cuando hay al menos un comentario; **En revisión** en cualquier otro caso. Ver `computeProposalStatus()` en `src/lib/dashboard/proposals.ts`.

## Modelo de datos (referencia)
```
Proposal: { id, date, time, network, format, status, title, caption, hashtags, artN,
            images[], video, departmentApprovals[1], comments[], aspect, dim }
SiteSettings: { brandName, brandColorPrimary/Dark, brandColorAccent, instagramHandle,
                senderEmail, commentNotifyTo/Cc, loginBackgroundUrl, loginLogoUrl }
```

## Despliegue
Pensado para Vercel (Hobby, gratis) + Neon Postgres + Vercel Blob — las tres piezas se crean desde el mismo dashboard de Vercel. Ver `.env.example` para el checklist.
