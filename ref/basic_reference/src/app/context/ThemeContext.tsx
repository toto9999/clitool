import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type ColorScheme = "light" | "dark";

interface ThemeContextType {
  colorScheme: ColorScheme;
  toggleColorScheme: (value?: ColorScheme) => void;
  debugMode: boolean;
  toggleDebugMode: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [colorScheme, setColorScheme] = useState<ColorScheme>("dark");
  const [debugMode, setDebugMode] = useState<boolean>(true); // Default to true for development

  useEffect(() => {
    // Apply background color to body
    document.body.style.backgroundColor = colorScheme === "dark" ? "#0d0e11" : "#f8f9fa";
  }, [colorScheme]);

  const toggleColorScheme = (value?: ColorScheme) => {
    if (value) {
      setColorScheme(value);
    } else {
      setColorScheme((prev) => (prev === "dark" ? "light" : "dark"));
    }
  };

  const toggleDebugMode = () => {
    setDebugMode((prev) => !prev);
  };

  return (
    <ThemeContext.Provider value={{ colorScheme, toggleColorScheme, debugMode, toggleDebugMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}