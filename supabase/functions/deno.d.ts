// The slice of the Deno global this project's Edge Functions actually use.
//
// Deno ships its own lib definitions, but pulling them in would mean a new
// dependency solely so `tsc` can read two symbols. Declaring the used surface
// by hand keeps the check honest AND doubles as documentation: if a function
// starts reaching for more of Deno, this file has to grow first.
declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};
