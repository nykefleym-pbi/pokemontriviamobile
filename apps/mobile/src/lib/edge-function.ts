// The one way this app talks to an Edge Function.
//
// Both server-authoritative modes -- solo battles and Mega raids -- speak the
// same envelope, so the envelope is unwrapped in exactly one place. The reason
// that matters is the error path below: it is fiddly, easy to get subtly
// wrong, and a second copy would drift.
import { supabase } from "./supabase";

/** What every op returns. Errors are DATA, not exceptions: the functions answer
 *  4xx/409 with a machine-readable code for things the UI has to tell apart (a
 *  stale action vs. a dead session), and supabase-js turns a non-2xx into a
 *  thrown FunctionsHttpError rather than surfacing the body. */
type Envelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; msg: string } };

export class EdgeFunctionError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "EdgeFunctionError";
  }
}

export async function callEdgeFunction<T>(
  fn: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<Envelope<T>>(fn, { body });

  // A non-2xx arrives here as `error` with the parsed body out of reach, so
  // read it back off the response before falling back to the generic message.
  if (error) {
    const res = (error as { context?: Response }).context;
    if (res && typeof res.json === "function") {
      try {
        const parsed = (await res.json()) as Envelope<T>;
        if (parsed && parsed.ok === false) {
          throw new EdgeFunctionError(parsed.error.code, parsed.error.msg);
        }
      } catch (e) {
        if (e instanceof EdgeFunctionError) throw e;
        // fall through to the transport error below
      }
    }
    throw new EdgeFunctionError("transport", error.message);
  }

  if (!data) throw new EdgeFunctionError("empty_response", "the server returned nothing");
  if (!data.ok) throw new EdgeFunctionError(data.error.code, data.error.msg);
  return data.data;
}
