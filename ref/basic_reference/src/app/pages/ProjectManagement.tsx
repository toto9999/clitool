import { useState } from "react";
import { useNavigate } from "react-router";
import { Grid, Card, Text, Badge, Title } from "@mantine/core";
import { Plus, LayoutGrid, List, Code, Database, Globe, Shield, Terminal, Lock, FileCode, Box } from "lucide-react";
import { useTheme } from "../context/ThemeContext";

export function ProjectManagement() {
  const { colorScheme } = useTheme();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<"card" | "list">("card");

  // Mock project data
  const mockProjects = [
    {
      id: "1",
      name: "Project Alpha",
      description: "Primary cloud infrastructure and orchestration engine for next-gen...",
      icon: Code,
      color: "#4C6EF5",
      status: "ACTIVE",
      statusColor: "#00C853",
      date: "OCT 12, 2023",
      tools: [FileCode, Terminal, Code, Box, Globe],
    },
    {
      id: "2",
      name: "Nexus Core",
      description: "Central messaging bus and data synchronization layer for distributed...",
      icon: Database,
      color: "#7C3AED",
      status: "SYNCING",
      statusColor: "#2196F3",
      date: "OCT 10, 2023",
      tools: [Terminal, Globe, Shield],
    },
    {
      id: "3",
      name: "Sentinel API",
      description: "Security gateway and rate limiting and identity management for public...",
      icon: Shield,
      color: "#F59E0B",
      status: "STABLE",
      statusColor: "#64748B",
      date: "SEP 28, 2023",
      tools: [FileCode, Database, Globe, Lock],
    },
  ];

  const bgColor = colorScheme === "dark" ? "#0B0D12" : "#f8f9fa";
  const cardBg = colorScheme === "dark" ? "rgba(26, 27, 30, 0.8)" : "#ffffff";
  const borderColor = colorScheme === "dark" ? "rgba(64,71,82,0.15)" : "#dee2e6";
  const textColor = colorScheme === "dark" ? "#E8E9ED" : "#212529";
  const mutedColor = colorScheme === "dark" ? "#94A3B8" : "#868e96";
  const hoverBorderColor = colorScheme === "dark" ? "#4C6EF5" : "#228be6";
  const toolIconBg = colorScheme === "dark" ? "rgba(255,255,255,0.05)" : "#f1f3f5";
  const toolIconColor = colorScheme === "dark" ? "#94A3B8" : "#495057";

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ backgroundColor: bgColor }}>
      {/* Header */}
      <div className="px-6 py-5 flex justify-between items-start" style={{ borderBottom: `1px solid ${borderColor}` }}>
        <div>
          <Title order={2} style={{ color: textColor, fontSize: "22px", fontWeight: 600, marginBottom: "6px" }}>
            Project Architecture
          </Title>
          <Text size="sm" style={{ color: mutedColor, fontSize: "13px" }}>
            Configure core workspace nodes.
          </Text>
        </div>
        <div className="flex gap-3 items-center">
          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 rounded-md p-1" style={{ backgroundColor: colorScheme === "dark" ? "rgba(255,255,255,0.05)" : "#f1f3f5" }}>
            <button
              onClick={() => setViewMode("card")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded transition-all"
              style={{
                backgroundColor: viewMode === "card" ? (colorScheme === "dark" ? "#4C6EF5" : "#228be6") : "transparent",
                color: viewMode === "card" ? "#ffffff" : mutedColor,
                fontSize: "11px",
                fontWeight: 500,
                letterSpacing: "0.5px",
              }}
            >
              <LayoutGrid size={12} />
              CARD
            </button>
            <button
              onClick={() => setViewMode("list")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded transition-all"
              style={{
                backgroundColor: viewMode === "list" ? (colorScheme === "dark" ? "#4C6EF5" : "#228be6") : "transparent",
                color: viewMode === "list" ? "#ffffff" : mutedColor,
                fontSize: "11px",
                fontWeight: 500,
                letterSpacing: "0.5px",
              }}
            >
              <List size={12} />
              LIST
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {viewMode === "card" ? (
          <Grid gutter="lg">
            {mockProjects.map((project) => (
              <Grid.Col key={project.id} span={{ base: 12, sm: 6, lg: 4 }}>
                <Card
                  padding="lg"
                  radius="md"
                  withBorder
                  className="cursor-pointer transition-all"
                  style={{
                    backgroundColor: cardBg,
                    borderColor: borderColor,
                    height: "100%",
                    backdropFilter: "blur(10px)",
                  }}
                  onClick={() => navigate(`/project/${project.id}/edit`)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = hoverBorderColor;
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow = colorScheme === "dark" 
                      ? "0 8px 24px rgba(0,0,0,0.4)"
                      : "0 8px 24px rgba(0,0,0,0.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = borderColor;
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <div className="flex flex-col gap-4">
                    {/* Header: Icon & Status */}
                    <div className="flex justify-between items-start">
                      <div
                        className="w-12 h-12 rounded-lg flex items-center justify-center text-white shadow-lg"
                        style={{ 
                          backgroundColor: project.color,
                          boxShadow: `0 4px 12px ${project.color}40`
                        }}
                      >
                        <project.icon size={24} strokeWidth={2} />
                      </div>
                      <Badge
                        variant="light"
                        size="sm"
                        style={{ 
                          fontSize: "9px", 
                          fontWeight: 600,
                          letterSpacing: "0.5px",
                          backgroundColor: `${project.statusColor}15`,
                          color: project.statusColor,
                          border: "none",
                          paddingLeft: "8px",
                          paddingRight: "8px",
                        }}
                      >
                        {project.status}
                      </Badge>
                    </div>

                    {/* Date */}
                    <Text size="xs" style={{ color: mutedColor, fontSize: "10px", fontWeight: 500, letterSpacing: "0.3px" }}>
                      {project.date}
                    </Text>

                    {/* Title & Description */}
                    <div>
                      <Text fw={600} size="lg" mb={6} style={{ color: textColor, fontSize: "16px" }}>
                        {project.name}
                      </Text>
                      <Text size="sm" lineClamp={2} style={{ color: mutedColor, fontSize: "13px", lineHeight: "1.5" }}>
                        {project.description}
                      </Text>
                    </div>

                    {/* Tool Icons */}
                    <div className="flex gap-2 mt-2">
                      {project.tools.map((Tool, idx) => (
                        <div
                          key={idx}
                          className="w-7 h-7 rounded flex items-center justify-center"
                          style={{ 
                            backgroundColor: toolIconBg,
                            color: toolIconColor,
                          }}
                        >
                          <Tool size={14} strokeWidth={2} />
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
              </Grid.Col>
            ))}

            {/* Add New Workspace Card */}
            <Grid.Col span={{ base: 12, sm: 6, lg: 4 }}>
              <button
                className="w-full h-full min-h-[280px] rounded-md transition-all cursor-pointer flex flex-col items-center justify-center gap-3"
                style={{
                  backgroundColor: "transparent",
                  border: `2px dashed ${borderColor}`,
                }}
                onClick={() => navigate("/new-workspace")}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = hoverBorderColor;
                  e.currentTarget.style.backgroundColor = colorScheme === "dark" ? "rgba(76,110,245,0.05)" : "rgba(34,139,230,0.03)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = borderColor;
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center"
                  style={{
                    backgroundColor: colorScheme === "dark" ? "rgba(255,255,255,0.05)" : "#f1f3f5",
                    color: mutedColor,
                  }}
                >
                  <Plus size={24} strokeWidth={2} />
                </div>
                <Text fw={500} style={{ color: mutedColor, fontSize: "14px" }}>
                  New Workspace
                </Text>
              </button>
            </Grid.Col>
          </Grid>
        ) : (
          <div className="space-y-3">
            {mockProjects.map((project) => (
              <Card
                key={project.id}
                padding="lg"
                radius="md"
                withBorder
                className="cursor-pointer transition-all"
                style={{
                  backgroundColor: cardBg,
                  borderColor: borderColor,
                  backdropFilter: "blur(10px)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = hoverBorderColor;
                  e.currentTarget.style.boxShadow = colorScheme === "dark" 
                    ? "0 4px 16px rgba(0,0,0,0.3)"
                    : "0 4px 16px rgba(0,0,0,0.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = borderColor;
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <div
                      className="w-11 h-11 rounded-lg flex items-center justify-center text-white shadow-md"
                      style={{ 
                        backgroundColor: project.color,
                        boxShadow: `0 4px 12px ${project.color}40`
                      }}
                    >
                      <project.icon size={20} strokeWidth={2} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-3">
                        <Text fw={600} style={{ color: textColor, fontSize: "15px" }}>
                          {project.name}
                        </Text>
                        <Badge
                          variant="light"
                          size="sm"
                          style={{ 
                            fontSize: "9px", 
                            fontWeight: 600,
                            letterSpacing: "0.5px",
                            backgroundColor: `${project.statusColor}15`,
                            color: project.statusColor,
                            border: "none",
                          }}
                        >
                          {project.status}
                        </Badge>
                      </div>
                      <Text size="sm" style={{ color: mutedColor, fontSize: "13px" }}>
                        {project.description}
                      </Text>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <Text size="xs" style={{ color: mutedColor, fontSize: "11px", fontWeight: 500 }}>
                      {project.date}
                    </Text>
                    <div className="flex gap-2">
                      {project.tools.map((Tool, idx) => (
                        <div
                          key={idx}
                          className="w-7 h-7 rounded flex items-center justify-center"
                          style={{ 
                            backgroundColor: toolIconBg,
                            color: toolIconColor,
                          }}
                        >
                          <Tool size={14} strokeWidth={2} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}