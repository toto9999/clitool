/**
 * Ensures dist-electron/host-services/uia-macro/uia-macro-service.cjs exists (runs npm run build:electron once if missing).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export function getUiaMacroServiceCjsPath(repoRoot) {
  return path.join(repoRoot, "dist-electron", "host-services", "uia-macro", "uia-macro-service.cjs");
}

/**
 * @returns {boolean} true if artifact exists or build succeeded
 */
export function ensureUiaMacroServiceArtifact(repoRoot) {
  const serviceCjs = getUiaMacroServiceCjsPath(repoRoot);
  if (fs.existsSync(serviceCjs)) {
    return true;
  }

  console.log("Missing dist-electron uia-macro-service; running npm run build:electron …");
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const r = spawnSync(npm, ["run", "build:electron"], {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
    shell: false,
  });

  if (r.error) {
    console.error(r.error.message);
    return false;
  }

  if (!fs.existsSync(serviceCjs)) {
    console.error("build:electron finished but uia-macro-service.cjs is still missing.");
    return false;
  }

  return (r.status ?? 1) === 0;
}
