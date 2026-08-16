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
- **Notificaciones**, un solo canal (email, vía Gmail SMTP/`nodemailer`), sin opt-in — no depende de que nadie active nada en su navegador, y es no-op silencioso si `GMAIL_USER`/`GMAIL_APP_PASSWORD` no están configuradas (ver `.env.example`). Remitente fijo a `GMAIL_USER`; destinatario siempre el `notifyEmail` del Admin (panel de Usuarios, `getAdminEmail()` en `site-settings.ts`) — salvo el de comentario nuevo, que respeta `SiteSettings.commentNotifyTo` si un Admin lo seteó a mano. Ver `notify-email.ts` (`sendCommentNotification`/`sendAlertEmail`). Se dispara en: comentario nuevo, aprobación de "Jun" por checkbox o por resolver el último comentario pendiente (`updateProposal()`/`toggleCommentResolved()` en `proposals-actions.ts`), y los recordatorios de `/api/cron/reminders`. La Web Push que hubo antes (`notify-push.ts`, `push-client.ts`, `NotificationToggle.tsx`, `PushSubscription`, VAPID) sigue en el código pero temporalmente sin wiring — se está probando el mail-only antes de reactivarla, ver ficha de notificaciones.
- **Recordatorios de publicación** (1h antes + a la hora): un GitHub Action (`.github/workflows/reminders.yml`) llama a `/api/cron/reminders` cada 10 min — el cron nativo de Vercel en Hobby solo corre 1 vez por día, no alcanza. Autenticado con `CRON_SECRET` (bearer token), no con sesión — por eso `api/cron` está excluido del gate de login en `src/proxy.ts`. La hora de la propuesta (`Proposal.time`, texto libre tipo "6:30 PM") se parsea asumiendo siempre UTC-4 (`schedule-time.ts` — Santo Domingo no tiene horario de verano). Cada propuesta dispara cada recordatorio una sola vez (`reminderSentT60`/`reminderSentT0`).
- Alias de import `@/*` → `src/*`

Scripts: `npm run dev`, `npm run build` (migra primero, ver abajo), `npm start`, `npm run lint`, `npm run db:migrate`, `npm run db:seed`.

> **El build migra antes de compilar**, pero vía `scripts/migrate-deploy.mjs` y no llamando a `prisma migrate deploy` directo. Prisma toma un advisory lock de Postgres antes de migrar; si dos deploys de Vercel se solapan (alcanza con pushear dos veces seguidas) el segundo espera el lock y aborta a los 10s con `P1002`, tirando abajo un build que no tenía nada malo. El script reintenta **solo** ante ese error, con espera creciente; cualquier otra falla corta en el primer intento. No se desactiva el lock: existe para que dos migraciones simultáneas no dejen el esquema a medio aplicar.

> Ver [AGENTS.md](AGENTS.md): esta versión de Next.js tiene breaking changes respecto al conocimiento de entrenamiento — consultar `node_modules/next/dist/docs/` antes de escribir código nuevo.

## Design tokens
- Colores base (placeholder, se sobreescriben por `SiteSettings` vía variables CSS en `layout.tsx`): azul `#163F6B`, rojo `#E81F35`, tinta `#1A1A1A` (`--brand-ink`), fondo siempre blanco, `--panel-2` gris claro, hairlines 1px (`--line`).
- Tipografía: `--font-sans` = Arial (base); `--font-thin` = Scansky 300 (títulos/numerales).
- Radios 2–4px máx 8px (nada tipo píldora). Sombras suaves (`--sh-1`/`--sh-2`).
- Pills de estado: Aprobado = azul sólido; Cambios solicitados = contorno rojo; En revisión = contorno gris.

## Estado y comentarios
El estado de una propuesta se deriva automáticamente (no se elige a mano): **Pendiente de re-aprobación** cuando se aprobó y después se editó contenido (`approvalInvalidatedReason` seteado, ver más abajo) y todavía no se volvió a aprobar; **Aprobado** cuando la casilla de aprobación ("Jun") está marcada y los comentarios (si hay) están resueltos; **Cambios solicitados** cuando hay al menos un comentario; **En revisión** en cualquier otro caso. Ver `computeProposalStatus()` en `src/lib/dashboard/proposals.ts`.

**Editar una propuesta ya aprobada la invalida**: cambiar `date`/`caption`/`images`/`video` en `updateProposal()` sobre una propuesta con `departmentApprovals[0] === true` la desaprueba sola (vuelve `[false]`) y guarda un motivo legible en `approvalInvalidatedReason` — sin excepciones por tipo de campo. `updateProposal()` devuelve esos dos campos cuando los pisa, y los callers (`page.tsx`/`calendario/page.tsx`) reconcilian el estado optimista con `applyUpdateResult()` en vez de asumir que el patch que mandaron es lo que quedó guardado.

**Historial de versiones**: cada vez que se edita `date`/`caption`/`images`/`video`, `updateProposal()` guarda un snapshot del valor *anterior* en `ProposalVersion` (podado a las últimas `PROPOSAL_VERSION_LIMIT` = 8 por propuesta) — "Ver historial" en `CaptionPanel` abre `VersionHistoryModal` con Antes/Ahora en paralelo.

## Moodboard (solo Admin)
Espacio de trabajo **personal del Administrador**, previo al flujo de aprobación: el cliente no lo ve. Vive en `/moodboard` (`src/app/moodboard/`) y es un **canvas libre** tipo corcho — los elementos se posicionan en coordenadas x/y absolutas, se redimensionan, rotan y superponen; no es una grilla.

- **Permiso en tres capas**: el ítem del Topbar solo se arma si `session.user.role === "ADMIN"`; la página corta antes de renderizar; y cada server action pasa por `requireAdmin()` + `requireOwnedSession()`/`requireOwnedElement()` (`moodboard/actions.ts`), así un segundo Admin tampoco ve los tableros del primero. Ocultar un botón no es un permiso.
- **Sesiones**: cada tablero es una `MoodboardSession` con nombre editable. Se **archivan**, no se borran, salvo borrado explícito (el material de referencia sirve de contexto histórico).
- **Entrada de contenido**, sin formularios: ⌘V en cualquier parte de la página (listener en `window`, se ignora si el foco está en un input), drag & drop de archivos al punto donde se sueltan, el botón "Subir" (abre el buscador de archivos), y un campo "Link" que detecta Instagram/TikTok/YouTube (`detectEmbedProvider`/`toEmbedSrc` en `src/types/moodboard.ts`). Los reels de Instagram y YouTube se embeben por iframe; TikTok y cualquier otra URL caen a una tarjeta con link clicable.
- **Texto con formato**: dos tipos que comparten editor — `text-note` (post-it amarillo, rápido) y `text-panel` (ventana limpia). Doble clic abre un `contentEditable` con una barra de formato (negrita/cursiva/subrayado/tachado, listas, 4 tamaños, alineación y color de letra). El negrita/cursiva/listas es **inline** y vive en el HTML de `text`; el tamaño, la alineación y el color son del bloque entero y van en columnas (`fontSize`/`textAlign`/`textColor`) — el sanitizador borra todos los atributos, así que un `style=""` inline no sobreviviría.
  > **Seguridad**: `text` se vuelve a pintar con `dangerouslySetInnerHTML`. `sanitizeRichText()` (`src/lib/dashboard/rich-text.ts`) deja pasar solo un puñado de etiquetas de formato y **cero atributos**, y escapa como texto todo lo que no matchee. Corre en el cliente antes de guardar, en la server action antes de escribir, y al leer de la base — el cliente no es la frontera de confianza.
- **Archivos**: mismo Vercel Blob que las propuestas, bajo `moodboard/<sessionId>/` (`uploadBlob()` en `ArtUploadZone.tsx`). Sin `PUBLIC_BLOB_READ_WRITE_TOKEN` la subida falla con un aviso — el resto del canvas sigue andando.
- **Rendimiento del arrastre**: mover/redimensionar/rotar escribe `transform`/`width`/`height` **directo en el nodo del DOM** y recién commitea a estado de React al soltar (ver `paint()` en `MoodboardCanvas.tsx`) — pasar por React en cada `pointermove` re-renderiza el canvas entero ~60 veces por segundo. La escritura a la base va con debounce de 700ms y todos los cambios pendientes salen en un solo `updateElements()`.
- **Selección múltiple**: Shift+clic en desktop, botón de modo multi en touch. Arrastrar cualquiera del grupo mueve todos con el mismo delta; las asas de tamaño y rotación aparecen solo con UN elemento elegido. El botón de alinear pone en fila los seleccionados **sin tocarles el tamaño**, centrados sobre la misma horizontal.
- **Portapapeles**: ⌘C/⌘X/⌘V/⌘A en desktop y un menú de mantener-apretado sobre el lienzo en mobile (no hay clic derecho). Copiar serializa la selección al portapapeles del sistema como texto con el prefijo `moodboard/v1:`, así funciona entre pestañas y sobrevive a un recargado; hay un respaldo en memoria para cuando el navegador niega el permiso (iOS). Pegar acepta, en orden: archivos, elementos propios, cualquier URL, HTML con formato y texto suelto.
  > Ojo con el orden de los gestos: la selección se limpia en el **pointerup** de un toque simple sobre el fondo, no en el pointerdown. Si se limpiara al apretar, el menú de mantener-apretado abriría siempre sin selección y "Copiar" nunca estaría disponible.
- **Puente al flujo normal**: clic derecho sobre un elemento con archivo → "Usar como base para una propuesta" crea una `Proposal` en revisión con ese arte ya cargado (video → Reel, imagen → Post simple). El elemento **no** se borra del tablero.
- **Exportar como imagen** (`export-image.ts`): botón al lado de Ajustar → se elige hoja (Carta 8.5×11 o Tabloide 11×17) y orientación → aparece un recuadro rojo fijo en pantalla con esa proporción y se encuadra moviendo/zoomeando el tablero por debajo → exporta un PNG del tamaño de la hoja a 150 ppp.
  > **Se exporta con `getDisplayMedia` (captura de la pestaña), no dibujando el tablero sobre un canvas.** El motivo es concreto: los reels son iframes de OTRO origen y ninguna página puede rasterizar el contenido de un iframe ajeno — es una barrera del navegador, no una limitación de la librería de turno. La captura sí los ve, porque los píxeles los compone el navegador con permiso explícito del usuario.
  > Consecuencias que hay que tener presentes: (1) **solo sirve capturando "Esta pestaña"** — de una ventana o del escritorio no se puede saber dónde cae el recuadro dentro de la imagen, así que se rechaza con un mensaje claro; (2) la resolución tope es la de pantalla, por eso el recuadro usa un margen chico (cada píxel que ocupa es resolución del archivo) y la barra muestra los **ppp reales**, que dependen del tamaño de la ventana y NO del zoom del tablero; (3) antes de leer el cuadro se esconden todas las barras flotantes y se limpia la selección (`capturing`), o saldrían impresas, y se esperan dos cuadros más `CAPTURE_SETTLE_MS` porque el flujo de captura tiene latencia propia.
- La página de estrategia que antes vivía acá se movió a `/estrategia` (mismo contenido, ver `src/app/estrategia/`).

## Modelo de datos (referencia)
```
Proposal: { id, date, time, network, format, status, title, caption, hashtags, artN,
            images[], video, departmentApprovals[1], comments[], aspect, dim,
            contentPillar?, approvalInvalidatedReason?,
            reminderSentT60/T0, approvalReminderSent }
ProposalVersion: { id, proposalId, caption, images[], video, editedBy, createdAt }
SiteSettings: { brandName, brandColorPrimary/Dark, brandColorAccent, instagramHandle,
                senderEmail, commentNotifyTo/Cc, loginBackgroundUrl, loginLogoUrl,
                contentPillars[] }
MoodboardSession: { id, name, ownerId, targetDate?, archivedAt?, elements[] }
MoodboardElement: { id, sessionId, type, x, y, width, height, zIndex, rotation,
                    url?, filename?, embedUrl?, text?, color?, notes?,
                    fontSize?, textAlign?, textColor? }
```

## Despliegue
Pensado para Vercel (Hobby, gratis) + Neon Postgres + Vercel Blob — las tres piezas se crean desde el mismo dashboard de Vercel. Ver `.env.example` para el checklist.
