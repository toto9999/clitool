#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultSettings, loadSettings, saveSettings } from "./settings.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const printHelp = (): void => {
  console.log("launcher cli");
  console.log("commands");
  console.log("- node dist/launcherCli.js init-settings");
  console.log("- node dist/launcherCli.js set-theme <dark|light>");
};

const main = (): void => {
  const args = process.argv.slice(2);
  const [command, arg1] = args;

  if (!command) {
    printHelp();
    return;
  }

  if (command === "init-settings") {
    const settings = saveSettings(projectRoot, defaultSettings());
    console.log("settings initialized");
    console.log(JSON.stringify(settings, null, 2));
    return;
  }

  if (command === "set-theme") {
    const theme = arg1 === "light" ? "light" : arg1 === "dark" ? "dark" : null;
    if (!theme) {
      console.log("theme must be dark or light");
      process.exitCode = 1;
      return;
    }
    const current = loadSettings(projectRoot);
    const settings = saveSettings(projectRoot, { ...current, theme });
    console.log("theme updated");
    console.log(JSON.stringify(settings, null, 2));
    return;
  }

  printHelp();
  process.exitCode = 1;
};

main();
