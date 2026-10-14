import { createBrowserClient } from "@supabase/ssr";

type Client = ReturnType<typeof createBrowserClient>;

let client: Client | undefined;
let readOnly: Client | undefined;
let simulating = false;

export function supabase(): Client {
  client ??= createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
  if (!simulating) return client;
  readOnly ??= blockWrites(client);
  return readOnly;
}

/** Liga o modo "só ver" do "Ver como" (chamado pelo SessionProvider) */
export function setSimulating(on: boolean) {
  simulating = on;
}

export const SIMULATION_ERROR = "SIMULACAO";

const WRITES = new Set(["insert", "update", "upsert", "delete"]);
const WRITE_RPCS = new Set(["suggest"]);

/** Resposta falsa, encadeável (.eq().select()…), que resolve com erro sem chamar o banco */
function refused() {
  const result = { data: null, error: { message: SIMULATION_ERROR, code: SIMULATION_ERROR }, count: null, status: 403, statusText: "" };
  const chain: unknown = new Proxy(() => {}, {
    get: (_, key) =>
      key === "then"
        ? (ok?: (v: typeof result) => unknown, fail?: (e: unknown) => unknown) => Promise.resolve(result).then(ok, fail)
        : () => chain,
    apply: () => chain,
  });
  return chain;
}

function blockWrites(c: Client): Client {
  return new Proxy(c, {
    get(target, key, receiver) {
      if (key === "from")
        return (table: string) =>
          new Proxy(target.from(table), {
            get(builder, method) {
              if (typeof method === "string" && WRITES.has(method)) return () => refused();
              const v = Reflect.get(builder, method);
              return typeof v === "function" ? v.bind(builder) : v;
            },
          });
      if (key === "rpc")
        return (fn: string, ...args: unknown[]) => (WRITE_RPCS.has(fn) ? refused() : (target.rpc as (...a: unknown[]) => unknown)(fn, ...args));
      const v = Reflect.get(target, key, receiver);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}
