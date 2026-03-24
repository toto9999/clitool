export default function App() {
  return (
    <main className="reset-shell">
      <section className="reset-card">
        <p className="reset-eyebrow">clibase rebuild baseline</p>
        <h1>Renderer prototype reset</h1>
        <p className="reset-copy">
          The previous mock workspace UI was intentionally removed. New UI and
          runtime code should be rebuilt from the architecture documents, not
          from old prototype screens.
        </p>
        <ul className="reset-list">
          <li>Current renderer keeps only a clean Vite + React bootstrap.</li>
          <li>Global CLI target remains a Textual host.</li>
          <li>Electron host, project runtime, and modules will be rebuilt next.</li>
        </ul>
      </section>
    </main>
  );
}
