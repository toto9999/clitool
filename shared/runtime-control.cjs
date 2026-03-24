const os = require("node:os");
const path = require("node:path");

const defaultRuntimeScope = "workspace-default";

function sanitizeScope(scope = defaultRuntimeScope) {
  return String(scope)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "") || defaultRuntimeScope;
}

function getRuntimeControlEndpoint(scope = defaultRuntimeScope) {
  const normalizedScope = sanitizeScope(scope);

  if (process.platform === "win32") {
    return `\\\\.\\pipe\\clibase-runtime-control-${normalizedScope}`;
  }

  return path.join(os.tmpdir(), `clibase-runtime-control-${normalizedScope}.sock`);
}

module.exports = {
  defaultRuntimeScope,
  getRuntimeControlEndpoint,
  sanitizeScope,
};
