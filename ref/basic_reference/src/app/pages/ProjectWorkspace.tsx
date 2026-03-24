import { useState } from "react";
import { useParams } from "react-router";
import { ProjectTabSidebar } from "../components/sidebar/ProjectTabSidebar";
import { useTheme } from "../context/ThemeContext";

export function ProjectWorkspace() {
  const { projectId } = useParams();
  const { colorScheme } = useTheme();

  // Mock tabs for the selected project
  const [tabs] = useState([
    { id: "overview", name: "Overview", icon: "📊" },
    { id: "analysis", name: "Analysis", icon: "🔍" },
    { id: "modeling", name: "Modeling", icon: "🤖" },
    { id: "documentation", name: "Documentation", icon: "📝" },
  ]);

  const [activeTab, setActiveTab] = useState("overview");

  // Get project info (mock)
  const projectInfo = {
    "1": { name: "Workspace Alpha", color: "#228be6" },
    "2": { name: "Analysis Project", color: "#40c057" },
    "3": { name: "Data Dashboard", color: "#fd7e14" },
  }[projectId || "1"] || { name: "Unknown", color: "#868e96" };

  const bgColor = colorScheme === "dark" ? "#0d0e11" : "#f8f9fa";
  const borderColor = colorScheme === "dark" ? "rgba(64,71,82,0.1)" : "#dee2e6";
  const textColor = colorScheme === "dark" ? "#e3e2e6" : "#212529";
  const mutedColor = colorScheme === "dark" ? "#c0c7d4" : "#868e96";
  const cardBg = colorScheme === "dark" ? "#1a1b1e" : "#ffffff";

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Project Tab Sidebar */}
      <ProjectTabSidebar
        projectName={projectInfo.name}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        colorScheme={colorScheme}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col" style={{ backgroundColor: bgColor }}>
        {/* Top Bar */}
        <div 
          className="h-12 px-6 flex items-center"
          style={{ borderBottom: `1px solid ${borderColor}` }}
        >
          <div className="text-xs" style={{ color: mutedColor }}>
            {projectInfo.name} / {tabs.find((t) => t.id === activeTab)?.name}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-6">
          <div>
            <h2 className="text-xl font-semibold mb-3" style={{ color: textColor }}>
              {tabs.find((t) => t.id === activeTab)?.name}
            </h2>
            <p style={{ color: mutedColor, fontSize: "13px" }}>
              여기에 선택한 탭의 모듈 구성이 표시됩니다.
            </p>
            <div 
              className="mt-8 p-8 rounded-lg text-center"
              style={{ 
                backgroundColor: cardBg,
                border: `1px solid ${borderColor}`,
              }}
            >
              <div className="text-6xl mb-4">{tabs.find((t) => t.id === activeTab)?.icon}</div>
              <p style={{ color: mutedColor, fontSize: "13px" }}>
                탭별 레이아웃과 모듈이 여기에 렌더링됩니다.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
