/**
 * Vercel's file-based function entry. Everything real lives in
 * `src/serverless.ts`; this is a one-line shim, and it is a shim for a reason.
 *
 * tsconfig.json sets `rootDir: "./src"`, so any .ts file at the project root
 * is OUTSIDE the compiler's root and putting real code here would fail
 * `nest build` and `npm run typecheck` with TS6059 — the exact trap already
 * documented for `jest.setup.ts` and `prisma/` ([F23]). `api` is therefore in
 * tsconfig's `exclude` list alongside them, which means THIS FILE IS NOT
 * TYPE-CHECKED. Keeping it to a single re-export is what makes that safe:
 * there is nothing here to get wrong. Vercel compiles it with its own
 * toolchain and follows the import into src/, which IS type-checked.
 *
 * Do not add logic to this file. Add it to src/serverless.ts.
 */
export { default } from '../src/serverless';
