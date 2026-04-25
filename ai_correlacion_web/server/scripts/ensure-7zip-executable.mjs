/**
 * pnpm/npm postinstall: 7zip-bin ships Linux binaries often without the +x bit;
 * Render/Heroku-style Linux then gets spawn EACCES. Fix once after install.
 */
import { chmodSync, existsSync } from "node:fs";

async function main() {
  if (process.platform === "win32") return;
  const { path7za } = await import("7zip-bin");
  if (path7za && existsSync(path7za)) {
    try {
      chmodSync(path7za, 0o755);
    } catch (e) {
      console.warn("[postinstall] ensure-7zip-executable: chmod failed", e);
    }
  }
}

main().catch((e) => {
  console.warn("[postinstall] ensure-7zip-executable", e);
});
