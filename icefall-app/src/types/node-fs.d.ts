/**
 * The two node calls the test files need, and nothing else.
 *
 * This project has no `@types/node` on purpose — the app is a browser bundle
 * and nothing in `src/` outside a `*.test.ts` may reach for node. Declaring the
 * whole of node here would quietly make `fs`, `child_process` and the rest
 * legal to import from a screen.
 *
 * If `@types/node` is ever added as a devDependency, DELETE THIS FILE in the
 * same change: two declarations of `node:fs` are a duplicate-identifier error,
 * and the message does not say which file to remove.
 */
declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function readdirSync(path: string): string[];
  export function statSync(path: string): { isDirectory(): boolean };
}
