import { useEffect, useState } from "react";

type DesktopStatus =
  | {
      kind: "browser-preview";
      title: string;
      detail: string;
    }
  | {
      kind: "desktop-shell";
      title: string;
      detail: string;
      platform: string;
      timestamp: string;
      appMode: "development" | "production";
    }
  | {
      kind: "error";
      title: string;
      detail: string;
    };

const browserPreviewStatus: DesktopStatus = {
  kind: "browser-preview",
  title: "Renderer-only preview",
  detail:
    "The React renderer is running without the Electron desktop shell. Use npm run dev to boot the Electron skeleton.",
};

export default function App() {
  const [desktopStatus, setDesktopStatus] =
    useState<DesktopStatus>(browserPreviewStatus);

  useEffect(() => {
    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron) {
      setDesktopStatus(browserPreviewStatus);
      return;
    }

    void bridge
      .ping()
      .then((result) => {
        setDesktopStatus({
          kind: "desktop-shell",
          title: "Electron desktop shell connected",
          detail:
            "Main process and preload bridge are active. This is the first desktop skeleton for the rebuild.",
          platform: result.platform,
          timestamp: result.timestamp,
          appMode: result.appMode,
        });
      })
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : "Unknown bridge failure";

        setDesktopStatus({
          kind: "error",
          title: "Electron bridge failed",
          detail: message,
        });
      });
  }, []);

  return (
    <main className="reset-shell">
      <section className="reset-card">
        <p className="reset-eyebrow">clibase desktop skeleton</p>
        <h1>{desktopStatus.title}</h1>
        <p className="reset-copy">
          {desktopStatus.detail}
        </p>
        <dl className="reset-grid">
          <div className="reset-metric">
            <dt>Runtime surface</dt>
            <dd>{desktopStatus.kind === "desktop-shell" ? "Electron" : "Renderer only"}</dd>
          </div>
          <div className="reset-metric">
            <dt>Global CLI</dt>
            <dd>batcli</dd>
          </div>
          <div className="reset-metric">
            <dt>Bridge</dt>
            <dd>{desktopStatus.kind === "desktop-shell" ? "preload active" : "not attached"}</dd>
          </div>
          <div className="reset-metric">
            <dt>Next host milestone</dt>
            <dd>runtime host, terminal, browser surface</dd>
          </div>
        </dl>
        {desktopStatus.kind === "desktop-shell" ? (
          <dl className="reset-grid reset-grid--compact">
            <div className="reset-metric">
              <dt>App mode</dt>
              <dd>{desktopStatus.appMode}</dd>
            </div>
            <div className="reset-metric">
              <dt>Platform</dt>
              <dd>{desktopStatus.platform}</dd>
            </div>
            <div className="reset-metric">
              <dt>Ping timestamp</dt>
              <dd>{desktopStatus.timestamp}</dd>
            </div>
          </dl>
        ) : null}
        <ul className="reset-list">
          <li>Electron main and preload now own the desktop shell entry.</li>
          <li>Renderer remains intentionally minimal and rebuild-oriented.</li>
          <li>Global CLI stays anchored on batcli and the future Textual host.</li>
        </ul>
      </section>
    </main>
  );
}
