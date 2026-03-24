import { ScrollArea, NavLink } from "@mantine/core";

interface Tab {
  id: string;
  name: string;
  icon: string;
}

interface ProjectTabSidebarProps {
  projectName: string;
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  colorScheme: "light" | "dark";
}

export function ProjectTabSidebar({
  projectName,
  tabs,
  activeTab,
  onTabChange,
  colorScheme,
}: ProjectTabSidebarProps) {
  const bgColor = colorScheme === "dark" ? "#1a1b1e" : "#ffffff";
  const borderColor = colorScheme === "dark" ? "rgba(64,71,82,0.1)" : "#dee2e6";
  const textColor = colorScheme === "dark" ? "#e3e2e6" : "#212529";
  const mutedColor = colorScheme === "dark" ? "#c0c7d4" : "#868e96";
  const activeBg = "#228be6";
  const hoverBg = colorScheme === "dark" ? "#25262b" : "#f1f3f5";

  return (
    <div
      className="w-56 flex flex-col"
      style={{
        backgroundColor: bgColor,
        borderRight: `1px solid ${borderColor}`,
      }}
    >
      {/* Project Header */}
      <div
        className="h-12 px-4 flex items-center"
        style={{ borderBottom: `1px solid ${borderColor}` }}
      >
        <div
          className="text-sm font-semibold truncate"
          style={{ color: textColor }}
        >
          {projectName}
        </div>
      </div>

      {/* Tabs List */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {tabs.map((tab) => (
            <NavLink
              key={tab.id}
              label={tab.name}
              leftSection={<span className="text-base">{tab.icon}</span>}
              active={activeTab === tab.id}
              onClick={() => onTabChange(tab.id)}
              className="rounded-md mb-1"
              styles={{
                root: {
                  backgroundColor:
                    activeTab === tab.id ? activeBg : "transparent",
                  color: activeTab === tab.id ? "#ffffff" : textColor,
                  fontSize: "13px",
                  padding: "8px 12px",
                  "&:hover": {
                    backgroundColor: activeTab === tab.id ? activeBg : hoverBg,
                  },
                },
                label: {
                  color: activeTab === tab.id ? "#ffffff" : textColor,
                  fontSize: "13px",
                },
              }}
            />
          ))}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div
        className="h-12 px-4 flex items-center"
        style={{ borderTop: `1px solid ${borderColor}` }}
      >
        <div className="text-xs" style={{ color: mutedColor }}>
          {tabs.length}개의 탭
        </div>
      </div>
    </div>
  );
}