import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

// WebStorm sometimes runs npm scripts with a different working directory (repo root),
// which breaks module resolution for PostCSS/Tailwind. Force cwd to this package.
const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, "..");

// Ensure this process (and any child tools that read process.cwd()) runs from package root,
// even if the caller started in a different working directory (e.g. IDE run configs).
process.chdir(pkgRoot);

const nextBin = path.join(pkgRoot, "node_modules", "next", "dist", "bin", "next");

// Forward any args passed after `--` from npm, e.g. `npm run dev -- --port 3005`.
const extraArgs = process.argv.slice(2);
const child = spawn(process.execPath, [nextBin, "dev", ...extraArgs], {
  cwd: pkgRoot,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
