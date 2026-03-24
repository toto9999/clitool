import { RouterProvider } from "react-router";
import { MantineProvider, createTheme } from "@mantine/core";
import { router } from "./routes";
import { ThemeProvider, useTheme } from "./context/ThemeContext";

const lightTheme = createTheme({
  primaryColor: "blue",
  defaultRadius: "md",
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
});

const darkTheme = createTheme({
  primaryColor: "blue",
  defaultRadius: "md",
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
});

function AppContent() {
  const { colorScheme } = useTheme();
  
  return (
    <MantineProvider theme={colorScheme === "dark" ? darkTheme : lightTheme}>
      <RouterProvider router={router} />
    </MantineProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}