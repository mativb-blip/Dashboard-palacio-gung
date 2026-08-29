import { cookies, headers } from "next/headers";
import packageJson from "../../../package.json";
import DiagnosticoChecks from "./DiagnosticoChecks";

// Esta parte se renderiza en el SERVIDOR y por eso es la que importa.
//
// La versión anterior era toda cliente, y tenía un agujero que se vio en el
// peor momento: cuando el navegador no ejecuta el JavaScript de la página, no
// corre ninguna comprobación PERO tampoco corre el mensaje que avisa "no se
// pudo ejecutar ninguna comprobación" — ese mensaje también era JavaScript.
// La página quedaba congelada en "Ejecutando comprobaciones…" para siempre,
// que es justo el caso que había que diagnosticar. Una herramienta de
// diagnóstico no puede depender de lo mismo que está fallando.
//
// Lo de abajo llega al navegador ya escrito en el HTML, así que se lee aunque
// no corra una sola línea de JavaScript. El User-Agent es lo más valioso: lo
// reporta el servidor a partir de la petición, y dice qué versión de
// iOS/Safari es — que es lo que decide si este navegador puede siquiera
// ejecutar el código que sirve Next.

// El mínimo se LEE del browserslist del package.json, que es lo que
// realmente decide para qué navegadores compila Next. Escribirlo a mano acá
// fue un error concreto: al bajar el objetivo a 15.4 esta constante quedó en
// 16.4, y la página siguió diciéndole "tu navegador es demasiado viejo" a un
// iPad donde la app ya funcionaba perfectamente. Un diagnóstico que miente es
// peor que no tenerlo, así que ahora no puede desincronizarse.
const SAFARI_MINIMO =
  packageJson.browserslist.find((b) => b.startsWith("safari "))?.split(" ")[1] ?? "16.4";

export const dynamic = "force-dynamic";

/** Versión de Safari/iOS que declara el User-Agent, o null si no se puede
 * leer. En iPhone/iPad el UA trae "Version/17.4" y "OS 17_4". */
function versionDeSafari(ua: string): string | null {
  const version = /Version\/(\d+\.\d+)/.exec(ua)?.[1];
  if (version) return version;
  const os = /OS (\d+)[_.](\d+)/.exec(ua);
  return os ? `${os[1]}.${os[2]}` : null;
}

function esDemasiadoViejo(version: string | null): boolean {
  if (!version) return false;
  const [may, men] = version.split(".").map(Number);
  const [minMay, minMen] = SAFARI_MINIMO.split(".").map(Number);
  return may < minMay || (may === minMay && men < minMen);
}

export default async function DiagnosticoPage() {
  const [jar, head] = await Promise.all([cookies(), headers()]);
  const ua = head.get("user-agent") ?? "(no informado)";
  const version = versionDeSafari(ua);
  const viejo = esDemasiadoViejo(version);
  const cookiesDeSesion = jar.getAll().filter((c) => c.name.includes("authjs.session-token"));

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-4 px-4 py-8 font-sans text-brand-ink">
      <div>
        <h1 className="text-lg font-bold">Diagnóstico de acceso</h1>
        <p className="mt-1 text-xs leading-relaxed text-tx-3">
          Si al iniciar sesión volvés siempre a la pantalla de login, o la pantalla se queda quieta,
          esta página dice en qué paso se corta.
        </p>
      </div>

      <div className="rounded border border-line-2 bg-panel-2 p-3">
        <p className="text-sm font-bold">Lo que ve el servidor</p>
        <p className="mt-0.5 text-xs leading-relaxed text-tx-3">
          Escrito directamente en el HTML: esto se lee aunque el navegador no ejecute JavaScript.
        </p>

        <dl className="mt-2.5 flex flex-col gap-2">
          <div>
            <dt className="text-xs font-bold text-tx-2">Cookie de sesión</dt>
            <dd className="text-xs leading-relaxed break-words text-tx-3">
              {cookiesDeSesion.length > 0
                ? `Llegó: ${cookiesDeSesion.map((c) => c.name).join(", ")}`
                : "No llegó ninguna. Es normal si todavía no iniciaste sesión."}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold text-tx-2">Navegador</dt>
            <dd className="text-xs leading-relaxed break-words text-tx-3">{ua}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold text-tx-2">Versión detectada</dt>
            <dd className="text-xs leading-relaxed text-tx-3">
              {version ?? "no se pudo leer del User-Agent"}
              {version ? ` · mínimo que necesita esta app: Safari ${SAFARI_MINIMO}` : ""}
            </dd>
          </div>
        </dl>
      </div>

      {viejo && (
        <div className="rounded border border-brand-red bg-panel-2 p-3">
          <p className="text-sm font-bold text-brand-red">Este navegador es demasiado viejo</p>
          <p className="mt-1 text-xs leading-relaxed text-tx-2">
            Safari {version} no puede ejecutar el código que sirve esta app, que necesita{" "}
            {SAFARI_MINIMO} o superior. No es un problema de tu usuario ni de las cookies: la página
            carga pero nada responde, porque el JavaScript no llega a arrancar. Actualizá el sistema
            desde Ajustes → General → Actualización de software, o entrá desde otro dispositivo.
          </p>
        </div>
      )}

      <noscript>
        <div className="rounded border border-brand-red bg-panel-2 p-3">
          <p className="text-sm font-bold text-brand-red">JavaScript está desactivado</p>
          <p className="mt-1 text-xs leading-relaxed text-tx-2">
            Sin JavaScript esta app no puede funcionar. En iPhone/iPad: Ajustes → Safari → Avanzado →
            activá JavaScript.
          </p>
        </div>
      </noscript>

      <DiagnosticoChecks />
    </main>
  );
}
