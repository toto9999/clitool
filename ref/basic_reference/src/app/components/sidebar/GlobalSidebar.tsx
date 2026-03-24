import { FolderKanban, Settings } from "lucide-react";
import { Tooltip } from "@mantine/core";
import { useState } from "react";
import { SettingsModal } from "../modals/SettingsModal";

interface Project {
  id: string;
  name: string;
  icon: string;
  color: string;
}

interface GlobalSidebarProps {
  projects: Project[];
  onProjectManagementClick: () => void;
  onProjectClick: (id: string) => void;
  activeProjectId?: string;
  isProjectManagementActive?: boolean;
  colorScheme: "light" | "dark";
  onToggleTheme: () => void;
}

export function GlobalSidebar({
  projects,
  onProjectManagementClick,
  onProjectClick,
  activeProjectId,
  isProjectManagementActive,
  colorScheme,
}: GlobalSidebarProps) {
  const [settingsOpened, setSettingsOpened] = useState(false);

  const bgColor = colorScheme === "dark" ? "#1a1b1e" : "#ffffff";
  const borderColor = colorScheme === "dark" ? "rgba(64,71,82,0.1)" : "#dee2e6";
  const dividerColor = colorScheme === "dark" ? "#373A40" : "#dee2e6";
  const buttonBg = colorScheme === "dark" ? "#25262b" : "#f1f3f5";
  const buttonHoverBg = colorScheme === "dark" ? "#2c2e33" : "#e9ecef";
  const textColor = colorScheme === "dark" ? "#909296" : "#868e96";
  const activeColor = "#228be6";

  return (
    <>
      <div
        className="flex flex-col items-center w-16 py-3 transition-colors"
        style={{ backgroundColor: bgColor, borderRight: `1px solid ${borderColor}` }}
      >
        {/* Project Management Icon */}
        <Tooltip label="프로젝트 관리" position="right" withArrow>
          <button
            onClick={onProjectManagementClick}
            className="w-11 h-11 rounded-md flex items-center justify-center mb-1.5 transition-all flex-shrink-0"
            style={{
              backgroundColor: isProjectManagementActive ? activeColor : buttonBg,
              color: isProjectManagementActive ? "#ffffff" : textColor,
            }}
            onMouseEnter={(e) => {
              if (!isProjectManagementActive) {
                e.currentTarget.style.backgroundColor = buttonHoverBg;
                e.currentTarget.style.color = colorScheme === "dark" ? "#ffffff" : "#212529";
              }
            }}
            onMouseLeave={(e) => {
              if (!isProjectManagementActive) {
                e.currentTarget.style.backgroundColor = buttonBg;
                e.currentTarget.style.color = textColor;
              }
            }}
          >
            <FolderKanban size={18} />
          </button>
        </Tooltip>

        {/* Divider */}
        <div
          className="w-9 h-px my-2 flex-shrink-0"
          style={{ backgroundColor: dividerColor }}
        />

        {/* Project Icons - 횡스크롤 제거 */}
        <div className="flex flex-col gap-1.5 flex-1 overflow-y-auto w-full px-2.5" style={{ overflowX: "hidden" }}>
          {projects.map((project) => (
            <Tooltip key={project.id} label={project.name} position="right" withArrow>
              <button
                onClick={() => onProjectClick(project.id)}
                className="w-11 h-11 rounded-md flex items-center justify-center font-semibold text-base transition-all mx-auto flex-shrink-0"
                style={{
                  backgroundColor: activeProjectId === project.id ? project.color : buttonBg,
                  color: activeProjectId === project.id ? "#ffffff" : textColor,
                  boxShadow: activeProjectId === project.id ? `0 0 0 2px ${activeColor}` : "none",
                }}
                onMouseEnter={(e) => {
                  if (activeProjectId !== project.id) {
                    e.currentTarget.style.boxShadow = `0 0 0 1px ${borderColor}`;
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeProjectId !== project.id) {
                    e.currentTarget.style.boxShadow = "none";
                  }
                }}
              >
                {project.icon}
              </button>
            </Tooltip>
          ))}
        </div>

        {/* Divider */}
        <div
          className="w-9 h-px my-2 flex-shrink-0"
          style={{ backgroundColor: dividerColor }}
        />

        {/* Settings Button */}
        <Tooltip label="설정" position="right" withArrow>
          <button
            onClick={() => setSettingsOpened(true)}
            className="w-11 h-11 rounded-md flex items-center justify-center transition-all flex-shrink-0"
            style={{
              backgroundColor: buttonBg,
              color: textColor,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = buttonHoverBg;
              e.currentTarget.style.color = colorScheme === "dark" ? "#ffffff" : "#212529";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = buttonBg;
              e.currentTarget.style.color = textColor;
            }}
          >
            <Settings size={18} />
          </button>
        </Tooltip>
      </div>

      <SettingsModal opened={settingsOpened} onClose={() => setSettingsOpened(false)} />
    </>
  );
}