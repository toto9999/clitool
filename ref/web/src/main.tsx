import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import { App } from "./App";
import { appTheme } from "./theme";
import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("root element not found");
}

const RootApp = (): JSX.Element => {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const forceColorScheme = isDarkMode ? "dark" : "light";

  return (
    <MantineProvider theme={appTheme} forceColorScheme={forceColorScheme}>
      <App isDarkMode={isDarkMode} onToggleTheme={() => setIsDarkMode((prev) => !prev)} />
    </MantineProvider>
  );
};

createRoot(rootElement).render(
  <React.StrictMode>
    <RootApp />
  </React.StrictMode>
);
