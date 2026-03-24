/// <reference types="vite/client" />

interface ClibaseDesktopPingResult {
  appMode: "development" | "production";
  platform: string;
  timestamp: string;
}

interface ClibaseDesktopBridge {
  isElectron: boolean;
  platform: string;
  ping: () => Promise<ClibaseDesktopPingResult>;
}

interface Window {
  clibaseDesktop?: ClibaseDesktopBridge;
}
