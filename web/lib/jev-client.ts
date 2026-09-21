import { TypeSafeClient } from "@typesafe-ai/sdk";
import { Agent, fetch as undiciFetch } from "undici";

/**
 * A TypeSafe client that does not use Node's global fetch dispatcher.
 *
 * The global one collapses under concurrent POSTs to a single origin. Measured
 * against this API with no inference involved, 100 rejected POSTs from one Node
 * process:
 *
 *   1 in flight     p50   100ms
 *   4 in flight     p50    94ms    2300/min
 *   16 in flight    p50  1660ms     698/min
 *   16 in flight, through the agent below, same process, same endpoint:
 *                   p50   163ms    5476/min
 *
 * GETs are unaffected, and Bun's fetch has none of it, which is why the eval
 * script never showed it. The browser's six-connection cap kept the old
 * client-side pool under the knee, so moving the pool here is what exposed it.
 *
 * The agent is module scope so its connections outlive one request. The client
 * is not: it reads the key at construction, and the key is loaded lazily.
 */
const dispatcher = new Agent({ allowH2: true });

type Fetch = ConstructorParameters<typeof TypeSafeClient>[0] extends { fetch?: infer F } ? F : never;

const pooledFetch = ((input: string | URL | Request, init?: RequestInit) =>
  undiciFetch(input as string, { ...init, dispatcher } as never)) as Fetch;

export const jevClient = (): TypeSafeClient => new TypeSafeClient({ fetch: pooledFetch });
