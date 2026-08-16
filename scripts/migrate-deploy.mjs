// Corre `prisma migrate deploy` reintentando SOLO cuando el motivo del fallo
// es la disputa por el lock de migraciones.
//
// Por qué hace falta: Prisma toma un advisory lock de Postgres antes de
// migrar, para que dos procesos no apliquen migraciones a la vez. Cuando dos
// deploys de Vercel se solapan —basta con pushear dos veces seguidas— los dos
// corren este paso, el segundo espera el lock, y a los 10 segundos aborta con
// P1002 y tira abajo el build. El código estaba bien; era una carrera.
//
// Esperar y reintentar es la salida correcta: el otro build termina, suelta el
// lock, y este encuentra las migraciones ya aplicadas y sigue de largo. NO se
// desactiva el lock (PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK): existe justamente
// para que dos migraciones simultáneas no dejen el esquema a medio aplicar.
//
// Cualquier otro error —una migración rota de verdad— falla en el primer
// intento, sin reintentos que lo disimulen.

import { spawn } from "node:child_process";

const MAX_ATTEMPTS = 4;
/** Espera antes de cada reintento. Creciente: un build ajeno puede tardar. */
const BACKOFF_MS = [8_000, 20_000, 40_000];

/** El fallo es "el lock está ocupado", no "la migración está mal". */
const LOCK_CONTENTION = /P1002|advisory lock/i;

function runMigrateDeploy() {
  return new Promise((resolve) => {
    const child = spawn("npx", ["prisma", "migrate", "deploy"], {
      shell: process.platform === "win32",
    });

    let output = "";
    const capture = (stream, target) => {
      stream.on("data", (chunk) => {
        output += chunk;
        target.write(chunk);
      });
    };
    capture(child.stdout, process.stdout);
    capture(child.stderr, process.stderr);

    child.on("close", (code) => resolve({ code: code ?? 1, output }));
    child.on("error", (error) => resolve({ code: 1, output: String(error) }));
  });
}

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  const { code, output } = await runMigrateDeploy();
  if (code === 0) process.exit(0);

  const contended = LOCK_CONTENTION.test(output);
  if (!contended || attempt === MAX_ATTEMPTS) {
    if (contended) {
      console.error(
        `\n[migrate-deploy] El lock de migraciones siguió ocupado tras ${MAX_ATTEMPTS} intentos.`,
      );
    }
    process.exit(code);
  }

  const wait = BACKOFF_MS[attempt - 1];
  console.error(
    `\n[migrate-deploy] Otro deploy tiene el lock de migraciones. Reintento ${attempt + 1}/${MAX_ATTEMPTS} en ${wait / 1000}s…\n`,
  );
  await new Promise((resolve) => setTimeout(resolve, wait));
}
