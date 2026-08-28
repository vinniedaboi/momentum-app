// Lets plain `node` run the lib modules, which use extensionless relative
// imports that bundlers resolve but Node's ESM resolver does not.
//   node --import ./scripts/ts-resolve.mjs script.ts
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith(".") && context.parentURL) {
        for (const extension of [".ts", ".tsx", "/index.ts"]) {
          const candidate = new URL(specifier + extension, context.parentURL);
          if (existsSync(fileURLToPath(candidate))) {
            return { url: candidate.href, format: "module-typescript", shortCircuit: true };
          }
        }
      }
      throw error;
    }
  },
});
