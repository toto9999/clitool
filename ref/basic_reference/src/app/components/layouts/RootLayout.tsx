import { Outlet, useLocation, useNavigate } from "react-router";
import { GlobalSidebar } from "../sidebar/GlobalSidebar";
import { GlobalCLIPanel } from "../panels/GlobalCLIPanel";
import { useState } from "react";
import { useTheme } from "../../context/ThemeContext";

export function RootLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { colorScheme, toggleColorScheme, debugMode } = useTheme();

  // Mock data for projects (will be replaced with state management later)
  const [projects] = useState([
    { id: "1", name: "Workspace Alpha", icon: "M", color: "#228be6" },
    { id: "2", name: "Analysis Project", icon: "A", color: "#40c057" },
    { id: "3", name: "Data Dashboard", icon: "D", color: "#fd7e14" },
  ]);

  const isProjectManagement = location.pathname === "/" || location.pathname === "/new-workspace" || location.pathname.includes("/edit");

  return (
    <div 
      className="flex h-screen w-screen overflow-hidden transition-colors"
      style={{
        backgroundColor: colorScheme === "dark" ? "#0d0e11" : "#f8f9fa",
        color: colorScheme === "dark" ? "#C1C2C5" : "#212529",
      }}
    >
      <GlobalSidebar
        projects={projects}
        onProjectManagementClick={() => navigate("/")}
        onProjectClick={(id) => navigate(`/project/${id}`)}
        activeProjectId={!isProjectManagement ? location.pathname.split("/")[2] : undefined}
        isProjectManagementActive={isProjectManagement}
        colorScheme={colorScheme}
        onToggleTheme={toggleColorScheme}
      />
      <Outlet />
      {debugMode && <GlobalCLIPanel />}
    </div>
  );
}