import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { Title, Text, TextInput, Button, Card, Badge, Checkbox, Tabs } from "@mantine/core";
import { ArrowLeft, Terminal, Globe, FileText, Bot, Network, TrendingUp, Check, Monitor, ArrowRight, Plus, X, LayoutGrid, Columns, Rows, Key, Settings, Cpu, Plug } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

interface Module {
  id: string;
  name: string;
  description: string;
  icon: any;
  size: string;
  tags?: string[];
  isBeta?: boolean;
}

interface PageTab {
  id: string;
  name: string;
  layout: "1x1" | "1x2" | "2x1" | "2x2" | "1x3" | "3x1";
  modules: { [key: string]: string };
}

// Draggable Module Item Component
function DraggableModule({ 
  module, 
  isAssigned, 
  colorScheme, 
  textColor, 
  mutedColor, 
  accentColor, 
  borderColor, 
  hoverBg, 
  selectedBg 
}: { 
  module: Module; 
  isAssigned: boolean; 
  colorScheme: string; 
  textColor: string; 
  mutedColor: string; 
  accentColor: string; 
  borderColor: string; 
  hoverBg: string; 
  selectedBg: string;
}) {
  const [{ isDragging }, drag] = useDrag({
    type: "MODULE",
    item: { id: module.id },
    canDrag: !isAssigned,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const ModuleIcon = module.icon;

  return (
    <div
      ref={drag}
      className="p-3 rounded-md transition-all"
      style={{
        backgroundColor: isDragging ? hoverBg : (isAssigned ? selectedBg : "transparent"),
        border: `1px solid ${borderColor}`,
        cursor: isAssigned ? "not-allowed" : "grab",
        opacity: isAssigned ? 0.6 : isDragging ? 0.5 : 1,
      }}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0"
          style={{
            backgroundColor: colorScheme === "dark" ? "#1e293b" : "#f1f5f9",
            color: accentColor,
          }}
        >
          <ModuleIcon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <Text size="xs" fw={600} style={{ color: textColor }} className="truncate">
            {module.name}
          </Text>
          {isAssigned && (
            <Text size="xs" style={{ color: mutedColor }}>
              In Use
            </Text>
          )}
        </div>
      </div>
    </div>
  );
}

// Droppable Grid Cell Component
function DroppableGridCell({
  position,
  tabId,
  assignedModule,
  colorScheme,
  textColor,
  mutedColor,
  accentColor,
  borderColor,
  hoverBg,
  assignModuleToGrid,
}: {
  position: string;
  tabId: string;
  assignedModule?: Module;
  colorScheme: string;
  textColor: string;
  mutedColor: string;
  accentColor: string;
  borderColor: string;
  hoverBg: string;
  assignModuleToGrid: (tabId: string, position: string, moduleId: string | null) => void;
}) {
  const [{ canDrop, isOver }, drop] = useDrop({
    accept: "MODULE",
    drop: (item: { id: string }) => assignModuleToGrid(tabId, position, item.id),
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  });

  const AssignedIcon = assignedModule?.icon;

  return (
    <div
      ref={drop}
      className="rounded-lg transition-all relative overflow-hidden"
      style={{
        backgroundColor: assignedModule 
          ? (colorScheme === "dark" ? "#1a2332" : "#f8fafc")
          : (canDrop && isOver ? hoverBg : (colorScheme === "dark" ? "#0a0e14" : "#fafbfc")),
        border: `2px dashed ${assignedModule ? accentColor : (canDrop && isOver ? accentColor : borderColor)}`,
        minHeight: "200px",
      }}
    >
      {assignedModule ? (
        <>
          {/* Module Header Bar */}
          <div 
            className="p-3 flex items-center justify-between"
            style={{
              backgroundColor: colorScheme === "dark" ? "#0f1419" : "#ffffff",
              borderBottom: `1px solid ${borderColor}`,
            }}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-6 h-6 rounded flex items-center justify-center"
                style={{
                  backgroundColor: accentColor + "20",
                  color: accentColor,
                }}
              >
                {AssignedIcon && <AssignedIcon size={14} />}
              </div>
              <Text size="xs" fw={600} style={{ color: textColor }}>
                {assignedModule.name}
              </Text>
            </div>
            <Button
              variant="subtle"
              size="xs"
              color="red"
              onClick={() => assignModuleToGrid(tabId, position, null)}
              style={{ padding: "4px 8px", height: "auto" }}
            >
              <X size={12} />
            </Button>
          </div>

          {/* Module Content Area */}
          <div 
            className="p-6 flex items-center justify-center h-full"
            style={{ minHeight: "150px" }}
          >
            <div className="text-center">
              <div
                className="w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-2"
                style={{
                  backgroundColor: accentColor + "10",
                  color: accentColor,
                }}
              >
                {AssignedIcon && <AssignedIcon size={24} />}
              </div>
              <Text size="xs" style={{ color: mutedColor }}>
                Module Content Area
              </Text>
            </div>
          </div>
        </>
      ) : (
        <div className="h-full flex items-center justify-center p-6">
          <div className="text-center">
            <div
              className="w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-3"
              style={{
                backgroundColor: borderColor,
              }}
            >
              <Plus size={24} style={{ color: mutedColor, opacity: 0.5 }} />
            </div>
            <Text size="sm" style={{ color: mutedColor }}>
              {canDrop && isOver ? "Drop here" : "Drop module here"}
            </Text>
          </div>
        </div>
      )}
    </div>
  );
}

export function ProjectEditor() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { colorScheme } = useTheme();

  const isNewProject = !projectId;

  // Multi-step configuration state
  const [currentStep, setCurrentStep] = useState<"modules" | "layout" | "network" | "review">("modules");

  // Module selection state
  const [selectedModules, setSelectedModules] = useState<string[]>(["1", "4", "6"]);
  const [expandedModuleId, setExpandedModuleId] = useState<string | null>(null);

  // Page/Tab configuration state
  const [pageTabs, setPageTabs] = useState<PageTab[]>([
    { id: "1", name: "Tab 1", layout: "2x2", modules: {} },
  ]);
  const [activeTabId, setActiveTabId] = useState("1");
  const [nextTabIdCounter, setNextTabIdCounter] = useState(2);

  // Right panel tab state
  const [rightPanelTab, setRightPanelTab] = useState<"modules" | "settings">("modules");

  // Inline editing state for tab names
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabName, setEditingTabName] = useState("");

  // AI Configuration state
  const [aiSection, setAiSection] = useState<"cli" | "global" | "skill" | "mcp">("cli");
  const [apiKey, setApiKey] = useState("");
  const [selectedModel, setSelectedModel] = useState("gpt-4");
  const [temperature, setTemperature] = useState("0.7");
  const [maxTokens, setMaxTokens] = useState("2048");
  const [enabledSkills, setEnabledSkills] = useState<string[]>(["code-gen", "debugging"]);
  const [mcpServers, setMcpServers] = useState<string[]>(["github", "linear"]);

  const availableProjects = [
    { id: "ANALYSIS_CORE_V2", name: "ANALYSIS_CORE_V2", status: "ACTIVE_CONTEXT" },
    { id: "PROJECT_ALPHA", name: "PROJECT ALPHA", status: "TARGET_PROJECT" },
    { id: "NOMINAL", name: "NOMINAL", status: "DEPLOYMENT_STATUS" },
  ];

  // Map project ID to name
  const projectMap: { [key: string]: string } = {
    "1": "PROJECT_ALPHA",
    "2": "ANALYSIS_CORE_V2",
    "3": "NOMINAL",
  };

  const currentProjectName = isNewProject 
    ? "NEW_PROJECT" 
    : projectMap[projectId || ""] || projectId?.toUpperCase().replace(/-/g, "_") || "PROJECT_ALPHA";

  const availableModules: Module[] = [
    {
      id: "1",
      name: "Python Terminal",
      description: "Integrated REPL with full standard library support and matplotlib rendering.",
      icon: Terminal,
      size: "48.2 MB",
      tags: ["MOD_001_PT"],
    },
    {
      id: "2",
      name: "Web Browser",
      description: "Sandboxed Chromium instance for documentation review and live testing.",
      icon: Globe,
      size: "102.4 MB",
      tags: ["MOD_002_WB3"],
    },
    {
      id: "3",
      name: "PDF Reader",
      description: "High-performance document rendering engine with OCR text extraction.",
      icon: FileText,
      size: "32.1 MB",
      tags: ["MOD_003_DOC"],
    },
    {
      id: "4",
      name: "AI Assistant",
      description: "LLM-powered code generator and context-aware project guide.",
      icon: Bot,
      size: "56.8 MB",
      tags: ["MOD_004_AI"],
      isBeta: true,
    },
    {
      id: "5",
      name: "Graph View",
      description: "Interactive 3D visualization of project dependencies and file nodes.",
      icon: Network,
      size: "24.5 MB",
      tags: ["MOD_005_GRH"],
    },
    {
      id: "6",
      name: "Data Flow Analyzer",
      description: "Real-time packet inspection and state transition monitoring engine.",
      icon: TrendingUp,
      size: "37.6 MB",
      tags: ["MOD_006_DT_AW"],
    },
  ];

  const bgColor = colorScheme === "dark" ? "#0a0e1a" : "#f8f9fa";
  const cardBg = colorScheme === "dark" ? "#0f1419" : "#ffffff";
  const borderColor = colorScheme === "dark" ? "#1a1f2e" : "#dee2e6";
  const textColor = colorScheme === "dark" ? "#E8E9ED" : "#212529";
  const mutedColor = colorScheme === "dark" ? "#6b7a99" : "#868e96";
  const accentColor = "#3b82f6";
  const selectedBg = colorScheme === "dark" ? "#1e293b" : "#eff6ff";
  const hoverBg = colorScheme === "dark" ? "#1a2332" : "#f1f5f9";

  const toggleModule = (moduleId: string) => {
    setSelectedModules(prev =>
      prev.includes(moduleId)
        ? prev.filter(id => id !== moduleId)
        : [...prev, moduleId]
    );
  };

  const totalSize = availableModules
    .filter(m => selectedModules.includes(m.id))
    .reduce((sum, m) => sum + parseFloat(m.size), 0);

  const stepTitles = {
    modules: "Module Selection",
    layout: "Page Configuration",
    network: "Network",
    review: "Review",
  };

  const availableLayouts = [
    { id: "1x1", name: "Single View", rows: 1, cols: 1, icon: LayoutGrid },
    { id: "1x2", name: "1 Row 2 Columns", rows: 1, cols: 2, icon: Columns },
    { id: "2x1", name: "2 Rows 1 Column", rows: 2, cols: 1, icon: Rows },
    { id: "2x2", name: "2x2 Grid", rows: 2, cols: 2, icon: LayoutGrid },
    { id: "1x3", name: "1 Row 3 Columns", rows: 1, cols: 3, icon: Columns },
    { id: "3x1", name: "3 Rows 1 Column", rows: 3, cols: 1, icon: Rows },
  ];

  const addNewTab = () => {
    const newTab: PageTab = {
      id: nextTabIdCounter.toString(),
      name: `Tab ${nextTabIdCounter}`,
      layout: "2x2",
      modules: {},
    };
    setPageTabs([...pageTabs, newTab]);
    setActiveTabId(newTab.id);
    setNextTabIdCounter(nextTabIdCounter + 1);
  };

  const deleteTab = (tabId: string) => {
    if (pageTabs.length === 1) return; // Don't delete the last tab
    const newTabs = pageTabs.filter(t => t.id !== tabId);
    setPageTabs(newTabs);
    if (activeTabId === tabId) {
      setActiveTabId(newTabs[0].id);
    }
  };

  const updateTabLayout = (tabId: string, layout: PageTab["layout"]) => {
    setPageTabs(pageTabs.map(t => t.id === tabId ? { ...t, layout, modules: {} } : t));
  };

  const updateTabName = (tabId: string, name: string) => {
    setPageTabs(pageTabs.map(t => t.id === tabId ? { ...t, name } : t));
  };

  const assignModuleToGrid = (tabId: string, gridPosition: string, moduleId: string | null) => {
    setPageTabs(pageTabs.map(t => {
      if (t.id === tabId) {
        const newModules = { ...t.modules };
        if (moduleId === null) {
          delete newModules[gridPosition];
        } else {
          newModules[gridPosition] = moduleId;
        }
        return { ...t, modules: newModules };
      }
      return t;
    }));
  };

  const getGridPositions = (layout: PageTab["layout"]) => {
    const layoutConfig = availableLayouts.find(l => l.id === layout);
    if (!layoutConfig) return [];
    const positions = [];
    for (let row = 0; row < layoutConfig.rows; row++) {
      for (let col = 0; col < layoutConfig.cols; col++) {
        positions.push(`${row}-${col}`);
      }
    }
    return positions;
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="flex-1 flex flex-col overflow-hidden" style={{ backgroundColor: bgColor }}>
        {/* Top Header */}
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{ borderBottom: `1px solid ${borderColor}` }}
        >
          <div className="flex items-center gap-4">
            <Button
              variant="subtle"
              size="sm"
              leftSection={<ArrowLeft size={16} />}
              onClick={() => navigate("/")}
              style={{ color: mutedColor }}
            >
              Back
            </Button>
            <Title
              order={1}
              style={{
                color: textColor,
                fontSize: "20px",
                fontWeight: 700,
                letterSpacing: "0.5px",
              }}
            >
              {currentProjectName}
            </Title>
          </div>

          <Button variant="filled" size="sm" style={{ backgroundColor: accentColor }}>
            DEPLOY_MODULES
          </Button>
        </div>

        {/* Tabs Navigation */}
        <div className="px-6 pt-4" style={{ borderBottom: `1px solid ${borderColor}` }}>
          <div className="flex gap-8">
            {(["modules", "layout", "network", "review"] as const).map((step) => (
              <button
                key={step}
                onClick={() => setCurrentStep(step)}
                className="pb-3 px-1 text-sm font-medium transition-all uppercase tracking-wider"
                style={{
                  color: currentStep === step ? accentColor : mutedColor,
                  borderBottom: currentStep === step ? `2px solid ${accentColor}` : "2px solid transparent",
                }}
              >
                {step}
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto">
          <div className="max-w-6xl mx-auto px-6 py-8">
            {/* Step Header */}
            <div className="mb-6">
              <Text size="xs" mb={4} style={{ color: mutedColor, textTransform: "uppercase", letterSpacing: "1px" }}>
                STEP 02 / 03
              </Text>
              <Title order={2} style={{ color: textColor, fontSize: "28px", fontWeight: 600 }}>
                {stepTitles[currentStep]}
              </Title>
            </div>

            {/* Progress Bar */}
            <div className="mb-8" style={{ height: "2px", backgroundColor: borderColor, borderRadius: "2px" }}>
              <div
                style={{
                  height: "100%",
                  width: "67%",
                  backgroundColor: accentColor,
                  borderRadius: "2px",
                  transition: "width 0.3s ease",
                }}
              />
            </div>

            {currentStep === "modules" && (
              <>
                {/* Module List */}
                <div className="space-y-3">
                  {availableModules.map((module) => {
                    const isSelected = selectedModules.includes(module.id);
                    const isExpanded = expandedModuleId === module.id;
                    const ModuleIcon = module.icon;
                    const isAIModule = module.id === "4"; // AI Assistant module

                    return (
                      <div key={module.id}>
                        <Card
                          padding="lg"
                          radius="md"
                          style={{
                            backgroundColor: isSelected ? selectedBg : cardBg,
                            border: `1px solid ${isSelected ? accentColor + "40" : borderColor}`,
                            cursor: "pointer",
                            transition: "all 0.2s",
                          }}
                          onClick={(e) => {
                            // If clicking the configure button, don't toggle selection
                            if ((e.target as HTMLElement).closest('[data-configure-button]')) {
                              return;
                            }
                            toggleModule(module.id);
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) {
                              e.currentTarget.style.backgroundColor = hoverBg;
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected) {
                              e.currentTarget.style.backgroundColor = cardBg;
                            }
                          }}
                        >
                          <div className="flex items-center gap-4">
                            {/* Icon */}
                            <div
                              className="w-12 h-12 rounded-lg flex items-center justify-center"
                              style={{
                                backgroundColor: colorScheme === "dark" ? "#1e293b" : "#f1f5f9",
                                color: accentColor,
                              }}
                            >
                              <ModuleIcon size={24} />
                            </div>

                            {/* Content */}
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Text size="md" fw={600} style={{ color: textColor }}>
                                  {module.name}
                                </Text>
                                {module.isBeta && (
                                  <Badge size="xs" variant="light" color="blue" style={{ textTransform: "uppercase" }}>
                                    BETA
                                  </Badge>
                                )}
                              </div>
                              <Text size="sm" style={{ color: mutedColor, lineHeight: 1.5 }}>
                                {module.description}
                              </Text>
                            </div>

                            {/* Size & Checkbox */}
                            <div className="flex items-center gap-4">
                              <Text size="xs" style={{ color: mutedColor, fontFamily: "monospace" }}>
                                {module.tags?.[0]}
                              </Text>
                              
                              {/* Configure Button for AI Module */}
                              {isAIModule && isSelected && (
                                <Button
                                  data-configure-button
                                  size="xs"
                                  variant="light"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedModuleId(isExpanded ? null : module.id);
                                  }}
                                  style={{
                                    backgroundColor: accentColor + "20",
                                    color: accentColor,
                                  }}
                                >
                                  {isExpanded ? "Close" : "Configure"}
                                </Button>
                              )}
                              
                              <Checkbox
                                checked={isSelected}
                                onChange={() => toggleModule(module.id)}
                                size="md"
                                styles={{
                                  input: {
                                    cursor: "pointer",
                                    borderColor: borderColor,
                                  },
                                }}
                              />
                            </div>
                          </div>
                        </Card>

                        {/* AI Configuration Accordion */}
                        {isAIModule && isSelected && isExpanded && (
                          <Card
                            padding="xl"
                            radius="md"
                            style={{
                              backgroundColor: cardBg,
                              border: `1px solid ${accentColor}40`,
                              marginTop: "8px",
                            }}
                          >
                            <div className="flex gap-6">
                              {/* Left - Section Menu */}
                              <div className="w-56 flex-shrink-0">
                                <div className="space-y-1">
                                  {[
                                    { id: "cli", label: "CLI Settings", icon: Terminal },
                                    { id: "global", label: "Global Settings", icon: Settings },
                                    { id: "skill", label: "Skills", icon: Cpu },
                                    { id: "mcp", label: "MCP Servers", icon: Plug },
                                  ].map((section) => {
                                    const SectionIcon = section.icon;
                                    const isActive = aiSection === section.id;
                                    
                                    return (
                                      <button
                                        key={section.id}
                                        onClick={() => setAiSection(section.id as typeof aiSection)}
                                        className="w-full flex items-center gap-3 px-4 py-3 rounded-md transition-all"
                                        style={{
                                          backgroundColor: isActive ? selectedBg : "transparent",
                                          border: `1px solid ${isActive ? accentColor + "40" : "transparent"}`,
                                          color: isActive ? accentColor : mutedColor,
                                        }}
                                      >
                                        <SectionIcon size={18} />
                                        <Text size="sm" fw={isActive ? 600 : 400} style={{ color: isActive ? textColor : mutedColor }}>
                                          {section.label}
                                        </Text>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* Right - Content Panel */}
                              <div className="flex-1">
                                <div style={{ minHeight: "400px" }}>
                                  {/* CLI Settings */}
                                  {aiSection === "cli" && (
                                    <div className="space-y-6">
                                      <div>
                                        <Text size="lg" fw={600} mb={2} style={{ color: textColor }}>
                                          CLI Configuration
                                        </Text>
                                        <Text size="sm" mb={6} style={{ color: mutedColor }}>
                                          Configure your AI Assistant's command-line interface settings
                                        </Text>
                                      </div>

                                      {/* API Key */}
                                      <div>
                                        <div className="flex items-center gap-2 mb-2">
                                          <Key size={16} style={{ color: accentColor }} />
                                          <Text size="sm" fw={500} style={{ color: textColor }}>
                                            API Key
                                          </Text>
                                        </div>
                                        <TextInput
                                          type="password"
                                          value={apiKey}
                                          onChange={(e) => setApiKey(e.target.value)}
                                          placeholder="sk-..."
                                          size="md"
                                          styles={{
                                            input: {
                                              backgroundColor: colorScheme === "dark" ? "#0a0e14" : "#f8f9fa",
                                              borderColor: borderColor,
                                              color: textColor,
                                              fontFamily: "monospace",
                                            },
                                          }}
                                        />
                                        <Text size="xs" mt={1} style={{ color: mutedColor }}>
                                          Your OpenAI API key will be stored securely
                                        </Text>
                                      </div>

                                      {/* Model Selection */}
                                      <div>
                                        <Text size="sm" fw={500} mb={2} style={{ color: textColor }}>
                                          Model
                                        </Text>
                                        <div className="grid grid-cols-2 gap-3">
                                          {["gpt-4", "gpt-4-turbo", "gpt-3.5-turbo", "claude-3"].map((model) => (
                                            <button
                                              key={model}
                                              onClick={() => setSelectedModel(model)}
                                              className="p-3 rounded-md transition-all text-left"
                                              style={{
                                                backgroundColor: selectedModel === model ? selectedBg : "transparent",
                                                border: `1px solid ${selectedModel === model ? accentColor : borderColor}`,
                                              }}
                                            >
                                              <Text size="sm" fw={600} style={{ color: selectedModel === model ? accentColor : textColor }}>
                                                {model}
                                              </Text>
                                            </button>
                                          ))}
                                        </div>
                                      </div>

                                      {/* Temperature */}
                                      <div>
                                        <Text size="sm" fw={500} mb={2} style={{ color: textColor }}>
                                          Temperature: {temperature}
                                        </Text>
                                        <input
                                          type="range"
                                          min="0"
                                          max="2"
                                          step="0.1"
                                          value={temperature}
                                          onChange={(e) => setTemperature(e.target.value)}
                                          className="w-full"
                                          style={{
                                            accentColor: accentColor,
                                          }}
                                        />
                                        <div className="flex justify-between mt-1">
                                          <Text size="xs" style={{ color: mutedColor }}>Precise</Text>
                                          <Text size="xs" style={{ color: mutedColor }}>Creative</Text>
                                        </div>
                                      </div>

                                      {/* Max Tokens */}
                                      <div>
                                        <Text size="sm" fw={500} mb={2} style={{ color: textColor }}>
                                          Max Tokens
                                        </Text>
                                        <TextInput
                                          type="number"
                                          value={maxTokens}
                                          onChange={(e) => setMaxTokens(e.target.value)}
                                          size="md"
                                          styles={{
                                            input: {
                                              backgroundColor: colorScheme === "dark" ? "#0a0e14" : "#f8f9fa",
                                              borderColor: borderColor,
                                              color: textColor,
                                            },
                                          }}
                                        />
                                      </div>
                                    </div>
                                  )}

                                  {/* Global Settings */}
                                  {aiSection === "global" && (
                                    <div className="space-y-6">
                                      <div>
                                        <Text size="lg" fw={600} mb={2} style={{ color: textColor }}>
                                          Global AI Settings
                                        </Text>
                                        <Text size="sm" mb={6} style={{ color: mutedColor }}>
                                          Project-wide AI configuration and preferences
                                        </Text>
                                      </div>

                                      <div className="space-y-4">
                                        <div 
                                          className="p-4 rounded-md"
                                          style={{ 
                                            backgroundColor: colorScheme === "dark" ? "#0a0e14" : "#f8f9fa",
                                            border: `1px solid ${borderColor}`,
                                          }}
                                        >
                                          <div className="flex items-start justify-between mb-2">
                                            <div>
                                              <Text size="sm" fw={600} style={{ color: textColor }}>
                                                Auto-completion
                                              </Text>
                                              <Text size="xs" style={{ color: mutedColor }}>
                                                Enable AI-powered code suggestions
                                              </Text>
                                            </div>
                                            <Checkbox defaultChecked size="md" />
                                          </div>
                                        </div>

                                        <div 
                                          className="p-4 rounded-md"
                                          style={{ 
                                            backgroundColor: colorScheme === "dark" ? "#0a0e14" : "#f8f9fa",
                                            border: `1px solid ${borderColor}`,
                                          }}
                                        >
                                          <div className="flex items-start justify-between mb-2">
                                            <div>
                                              <Text size="sm" fw={600} style={{ color: textColor }}>
                                                Context Awareness
                                              </Text>
                                              <Text size="xs" style={{ color: mutedColor }}>
                                                AI analyzes entire project context
                                              </Text>
                                            </div>
                                            <Checkbox defaultChecked size="md" />
                                          </div>
                                        </div>

                                        <div 
                                          className="p-4 rounded-md"
                                          style={{ 
                                            backgroundColor: colorScheme === "dark" ? "#0a0e14" : "#f8f9fa",
                                            border: `1px solid ${borderColor}`,
                                          }}
                                        >
                                          <div className="flex items-start justify-between mb-2">
                                            <div>
                                              <Text size="sm" fw={600} style={{ color: textColor }}>
                                                Error Detection
                                              </Text>
                                              <Text size="xs" style={{ color: mutedColor }}>
                                                Automatic bug detection and suggestions
                                              </Text>
                                            </div>
                                            <Checkbox defaultChecked size="md" />
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {/* Skills */}
                                  {aiSection === "skill" && (
                                    <div className="space-y-6">
                                      <div>
                                        <Text size="lg" fw={600} mb={2} style={{ color: textColor }}>
                                          AI Skills
                                        </Text>
                                        <Text size="sm" mb={6} style={{ color: mutedColor }}>
                                          Enable specific capabilities for your AI Assistant
                                        </Text>
                                      </div>

                                      <div className="grid grid-cols-2 gap-4">
                                        {[
                                          { id: "code-gen", name: "Code Generation", desc: "Generate code from natural language" },
                                          { id: "debugging", name: "Debugging", desc: "Analyze and fix code issues" },
                                          { id: "refactoring", name: "Refactoring", desc: "Improve code structure and quality" },
                                          { id: "testing", name: "Test Generation", desc: "Create unit and integration tests" },
                                          { id: "docs", name: "Documentation", desc: "Generate code documentation" },
                                          { id: "review", name: "Code Review", desc: "Review code for best practices" },
                                        ].map((skill) => {
                                          const isEnabled = enabledSkills.includes(skill.id);
                                          
                                          return (
                                            <div
                                              key={skill.id}
                                              onClick={() => {
                                                setEnabledSkills(prev =>
                                                  prev.includes(skill.id)
                                                    ? prev.filter(id => id !== skill.id)
                                                    : [...prev, skill.id]
                                                );
                                              }}
                                              className="p-4 rounded-md cursor-pointer transition-all"
                                              style={{
                                                backgroundColor: isEnabled ? selectedBg : (colorScheme === "dark" ? "#0a0e14" : "#f8f9fa"),
                                                border: `1px solid ${isEnabled ? accentColor + "40" : borderColor}`,
                                              }}
                                            >
                                              <div className="flex items-start justify-between mb-2">
                                                <Text size="sm" fw={600} style={{ color: isEnabled ? accentColor : textColor }}>
                                                  {skill.name}
                                                </Text>
                                                <Checkbox 
                                                  checked={isEnabled} 
                                                  onChange={() => {}}
                                                  size="sm"
                                                />
                                              </div>
                                              <Text size="xs" style={{ color: mutedColor }}>
                                                {skill.desc}
                                              </Text>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}

                                  {/* MCP Servers */}
                                  {aiSection === "mcp" && (
                                    <div className="space-y-6">
                                      <div>
                                        <Text size="lg" fw={600} mb={2} style={{ color: textColor }}>
                                          MCP Servers
                                        </Text>
                                        <Text size="sm" mb={6} style={{ color: mutedColor }}>
                                          Connect to Model Context Protocol servers for enhanced capabilities
                                        </Text>
                                      </div>

                                      <div className="space-y-3">
                                        {[
                                          { id: "github", name: "GitHub MCP", desc: "Access GitHub repositories and issues", icon: Globe },
                                          { id: "linear", name: "Linear MCP", desc: "Manage Linear issues and projects", icon: TrendingUp },
                                          { id: "notion", name: "Notion MCP", desc: "Read and write Notion pages", icon: FileText },
                                          { id: "slack", name: "Slack MCP", desc: "Send messages and read channels", icon: Bot },
                                        ].map((server) => {
                                          const isConnected = mcpServers.includes(server.id);
                                          const ServerIcon = server.icon;
                                          
                                          return (
                                            <div
                                              key={server.id}
                                              className="p-4 rounded-md transition-all"
                                              style={{
                                                backgroundColor: colorScheme === "dark" ? "#0a0e14" : "#f8f9fa",
                                                border: `1px solid ${borderColor}`,
                                              }}
                                            >
                                              <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3 flex-1">
                                                  <div
                                                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                                                    style={{
                                                      backgroundColor: isConnected ? accentColor + "20" : borderColor,
                                                      color: isConnected ? accentColor : mutedColor,
                                                    }}
                                                  >
                                                    <ServerIcon size={20} />
                                                  </div>
                                                  <div className="flex-1">
                                                    <Text size="sm" fw={600} style={{ color: textColor }}>
                                                      {server.name}
                                                    </Text>
                                                    <Text size="xs" style={{ color: mutedColor }}>
                                                      {server.desc}
                                                    </Text>
                                                  </div>
                                                </div>
                                                <Button
                                                  size="sm"
                                                  variant={isConnected ? "filled" : "outline"}
                                                  style={{
                                                    backgroundColor: isConnected ? accentColor : "transparent",
                                                    borderColor: accentColor,
                                                    color: isConnected ? "#ffffff" : accentColor,
                                                  }}
                                                  onClick={() => {
                                                    setMcpServers(prev =>
                                                      prev.includes(server.id)
                                                        ? prev.filter(id => id !== server.id)
                                                        : [...prev, server.id]
                                                    );
                                                  }}
                                                >
                                                  {isConnected ? "Connected" : "Connect"}
                                                </Button>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>

                                      <Button 
                                        variant="outline" 
                                        fullWidth 
                                        leftSection={<Plus size={16} />}
                                        style={{
                                          borderColor: borderColor,
                                          color: accentColor,
                                        }}
                                      >
                                        Add Custom MCP Server
                                      </Button>
                                    </div>
                                  )}
                                </div>

                                {/* Save Button */}
                                <div className="mt-6 pt-6" style={{ borderTop: `1px solid ${borderColor}` }}>
                                  <Button
                                    fullWidth
                                    variant="filled"
                                    size="md"
                                    style={{ backgroundColor: accentColor }}
                                    onClick={() => {
                                      setExpandedModuleId(null);
                                    }}
                                  >
                                    Save Configuration
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </Card>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {currentStep === "layout" && (
              <>
                {/* Full Screen Layout Editor */}
                <div className="fixed inset-0 flex" style={{ top: "120px", backgroundColor: bgColor }}>
                  {/* Left Side - Sidebar Preview */}
                  <div className="flex" style={{ width: "320px", flexShrink: 0 }}>
                    {/* Global Sidebar Preview */}
                    <div 
                      className="flex flex-col items-center py-4"
                      style={{ 
                        width: "64px", 
                        backgroundColor: colorScheme === "dark" ? "#000000" : "#1a1f2e",
                        borderRight: `1px solid ${borderColor}`,
                      }}
                    >
                      <div 
                        className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
                        style={{ backgroundColor: accentColor }}
                      >
                        <Monitor size={20} style={{ color: "#ffffff" }} />
                      </div>
                      <div style={{ width: "32px", height: "1px", backgroundColor: borderColor, margin: "8px 0" }} />
                      
                      {/* Project Icons */}
                      <div className="flex flex-col gap-2">
                        {[1, 2, 3].map((i) => (
                          <div
                            key={i}
                            className="w-10 h-10 rounded-lg flex items-center justify-center"
                            style={{
                              backgroundColor: i === 1 ? accentColor + "40" : "transparent",
                              border: `1px solid ${i === 1 ? accentColor : borderColor}`,
                              color: i === 1 ? accentColor : mutedColor,
                            }}
                          >
                            {i}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Project Tab Sidebar Preview */}
                    <div 
                      className="flex-1 flex flex-col"
                      style={{ 
                        backgroundColor: cardBg,
                        borderRight: `1px solid ${borderColor}`,
                      }}
                    >
                      {/* Tab Header */}
                      <div className="p-4" style={{ borderBottom: `1px solid ${borderColor}` }}>
                        <Text size="xs" fw={700} style={{ color: textColor, letterSpacing: "1px" }}>
                          {currentProjectName}
                        </Text>
                      </div>

                      {/* Tabs List */}
                      <div className="flex-1 p-3 space-y-1">
                        {pageTabs.map((tab, index) => (
                          <div
                            key={tab.id}
                            className="flex items-center gap-2 px-3 py-2 rounded-md group relative"
                            style={{
                              backgroundColor: activeTabId === tab.id ? selectedBg : "transparent",
                              border: `1px solid ${activeTabId === tab.id ? accentColor + "40" : "transparent"}`,
                              cursor: "pointer",
                            }}
                            onClick={() => setActiveTabId(tab.id)}
                          >
                            <LayoutGrid size={14} style={{ color: activeTabId === tab.id ? accentColor : mutedColor }} />
                            
                            {/* Tab Name - Editable on Double Click */}
                            {editingTabId === tab.id ? (
                              <input
                                type="text"
                                value={editingTabName}
                                onChange={(e) => setEditingTabName(e.target.value)}
                                onBlur={() => {
                                  updateTabName(tab.id, editingTabName);
                                  setEditingTabId(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    updateTabName(tab.id, editingTabName);
                                    setEditingTabId(null);
                                  } else if (e.key === "Escape") {
                                    setEditingTabId(null);
                                  }
                                }}
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                                className="flex-1 px-1 py-0 rounded"
                                style={{
                                  backgroundColor: colorScheme === "dark" ? "#0a0e14" : "#ffffff",
                                  border: `1px solid ${accentColor}`,
                                  color: textColor,
                                  fontSize: "12px",
                                  outline: "none",
                                }}
                              />
                            ) : (
                              <Text 
                                size="xs" 
                                style={{ color: activeTabId === tab.id ? textColor : mutedColor, flex: 1 }}
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  setEditingTabId(tab.id);
                                  setEditingTabName(tab.name);
                                }}
                              >
                                {tab.name}
                              </Text>
                            )}

                            {pageTabs.length > 1 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm(`Are you sure you want to delete "${tab.name}"?`)) {
                                    deleteTab(tab.id);
                                  }
                                }}
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-500/20"
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                <X
                                  size={12}
                                  style={{ 
                                    color: colorScheme === "dark" ? "#ef4444" : "#dc2626",
                                  }}
                                />
                              </button>
                            )}
                          </div>
                        ))}
                        
                        {/* Add Tab Button */}
                        <button
                          onClick={addNewTab}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-md transition-all"
                          style={{
                            border: `1px dashed ${borderColor}`,
                            color: mutedColor,
                          }}
                        >
                          <Plus size={14} />
                          <Text size="xs">Add Tab</Text>
                        </button>
                      </div>

                      {/* Layout Selector at Bottom */}
                      <div className="p-3" style={{ borderTop: `1px solid ${borderColor}` }}>
                        <Text size="xs" mb={2} style={{ color: mutedColor, textTransform: "uppercase" }}>
                          Layout
                        </Text>
                        <div className="grid grid-cols-3 gap-2">
                          {availableLayouts.map((layout) => {
                            const LayoutIcon = layout.icon;
                            const activeTab = pageTabs.find(t => t.id === activeTabId);
                            const isSelected = activeTab?.layout === layout.id;

                            return (
                              <button
                                key={layout.id}
                                onClick={() => updateTabLayout(activeTabId, layout.id as PageTab["layout"])}
                                className="p-2 rounded transition-all"
                                style={{
                                  backgroundColor: isSelected ? selectedBg : "transparent",
                                  border: `1px solid ${isSelected ? accentColor : borderColor}`,
                                  color: isSelected ? accentColor : mutedColor,
                                }}
                                title={layout.name}
                              >
                                <LayoutIcon size={14} />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Center - Main Preview Area */}
                  <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Preview Toolbar */}
                    <div 
                      className="px-4 py-3 flex items-center justify-between"
                      style={{ 
                        backgroundColor: cardBg,
                        borderBottom: `1px solid ${borderColor}`,
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <Badge size="sm" variant="light" style={{ textTransform: "none" }}>
                          {pageTabs.find(t => t.id === activeTabId)?.name}
                        </Badge>
                        <Text size="xs" style={{ color: mutedColor }}>
                          {availableLayouts.find(l => l.id === pageTabs.find(t => t.id === activeTabId)?.layout)?.name}
                        </Text>
                      </div>
                      <Text size="xs" style={{ color: mutedColor }}>
                        Live Preview
                      </Text>
                    </div>

                    {/* Main Grid Preview */}
                    <div className="flex-1 p-4 overflow-auto" style={{ backgroundColor: bgColor }}>
                      {pageTabs.map((tab) => {
                        if (tab.id !== activeTabId) return null;

                        return (
                          <div
                            key={tab.id}
                            className="grid gap-3 h-full"
                            style={{
                              gridTemplateColumns: `repeat(${availableLayouts.find(l => l.id === tab.layout)?.cols || 1}, 1fr)`,
                              gridTemplateRows: `repeat(${availableLayouts.find(l => l.id === tab.layout)?.rows || 1}, 1fr)`,
                            }}
                          >
                            {getGridPositions(tab.layout).map((position) => {
                              const assignedModuleId = tab.modules[position];
                              const assignedModule = availableModules.find(m => m.id === assignedModuleId);

                              return (
                                <DroppableGridCell
                                  key={position}
                                  position={position}
                                  tabId={tab.id}
                                  assignedModule={assignedModule}
                                  colorScheme={colorScheme}
                                  textColor={textColor}
                                  mutedColor={mutedColor}
                                  accentColor={accentColor}
                                  borderColor={borderColor}
                                  hoverBg={hoverBg}
                                  assignModuleToGrid={assignModuleToGrid}
                                />
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right Panel - Tabs for Modules & Settings */}
                  <div 
                    className="flex flex-col"
                    style={{ 
                      width: "320px", 
                      backgroundColor: cardBg,
                      borderLeft: `1px solid ${borderColor}`,
                    }}
                  >
                    {/* Panel Tabs */}
                    <div className="flex" style={{ borderBottom: `1px solid ${borderColor}` }}>
                      <button
                        className="flex-1 px-4 py-3 text-sm font-medium transition-all"
                        style={{
                          color: rightPanelTab === "modules" ? accentColor : mutedColor,
                          borderBottom: `2px solid ${rightPanelTab === "modules" ? accentColor : "transparent"}`,
                        }}
                        onClick={() => setRightPanelTab("modules")}
                      >
                        Modules
                      </button>
                      <button
                        className="flex-1 px-4 py-3 text-sm font-medium transition-all"
                        style={{
                          color: rightPanelTab === "settings" ? accentColor : mutedColor,
                          borderBottom: `2px solid ${rightPanelTab === "settings" ? accentColor : "transparent"}`,
                        }}
                        onClick={() => setRightPanelTab("settings")}
                      >
                        Settings
                      </button>
                    </div>

                    {/* Panel Content */}
                    <div className="flex-1 overflow-auto p-4">
                      {/* Modules Tab Content */}
                      {rightPanelTab === "modules" && (
                        <div>
                          <Text size="sm" fw={600} mb={2} style={{ color: textColor }}>
                            Available Modules
                          </Text>
                          <Text size="xs" mb={4} style={{ color: mutedColor }}>
                            Drag modules to the layout grid
                          </Text>
                          
                          <div className="space-y-2">
                            {availableModules
                              .filter((m) => selectedModules.includes(m.id))
                              .map((module) => {
                                const tab = pageTabs.find(t => t.id === activeTabId);
                                const isAssigned = Object.values(tab?.modules || {}).includes(module.id);

                                return (
                                  <DraggableModule
                                    key={module.id}
                                    module={module}
                                    isAssigned={isAssigned}
                                    colorScheme={colorScheme}
                                    textColor={textColor}
                                    mutedColor={mutedColor}
                                    accentColor={accentColor}
                                    borderColor={borderColor}
                                    hoverBg={hoverBg}
                                    selectedBg={selectedBg}
                                  />
                                );
                              })}
                          </div>

                          {selectedModules.length === 0 && (
                            <div className="text-center py-8">
                              <Text size="sm" style={{ color: mutedColor }}>
                                No modules selected. Go to the Modules step to select modules.
                              </Text>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Settings Tab Content */}
                      {rightPanelTab === "settings" && (
                        <div>
                          <Text size="sm" fw={600} mb={2} style={{ color: textColor }}>
                            Tab Settings
                          </Text>
                          <Text size="xs" mb={4} style={{ color: mutedColor }}>
                            Configure the current tab
                          </Text>
                          
                          <div className="space-y-4">
                            {/* Tab Name */}
                            <div>
                              <Text size="xs" fw={500} mb={2} style={{ color: textColor }}>
                                Tab Name
                              </Text>
                              <TextInput
                                value={pageTabs.find(t => t.id === activeTabId)?.name || ""}
                                onChange={(e) => updateTabName(activeTabId, e.target.value)}
                                size="sm"
                                placeholder="Enter tab name"
                                styles={{
                                  input: {
                                    backgroundColor: colorScheme === "dark" ? "#0a0e14" : "#f8f9fa",
                                    borderColor: borderColor,
                                    color: textColor,
                                  },
                                }}
                              />
                            </div>

                            {/* Layout Selection */}
                            <div>
                              <Text size="xs" fw={500} mb={2} style={{ color: textColor }}>
                                Layout Type
                              </Text>
                              <div className="grid grid-cols-2 gap-2">
                                {availableLayouts.map((layout) => {
                                  const LayoutIcon = layout.icon;
                                  const activeTab = pageTabs.find(t => t.id === activeTabId);
                                  const isSelected = activeTab?.layout === layout.id;

                                  return (
                                    <button
                                      key={layout.id}
                                      onClick={() => updateTabLayout(activeTabId, layout.id as PageTab["layout"])}
                                      className="p-3 rounded transition-all flex flex-col items-center gap-1"
                                      style={{
                                        backgroundColor: isSelected ? selectedBg : "transparent",
                                        border: `1px solid ${isSelected ? accentColor : borderColor}`,
                                      }}
                                    >
                                      <LayoutIcon size={16} style={{ color: isSelected ? accentColor : mutedColor }} />
                                      <Text size="xs" style={{ color: isSelected ? accentColor : mutedColor, textAlign: "center" }}>
                                        {layout.id}
                                      </Text>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Tab Info */}
                            <div>
                              <Text size="xs" fw={500} mb={2} style={{ color: textColor }}>
                                Tab Information
                              </Text>
                              <div 
                                className="p-3 rounded"
                                style={{ 
                                  backgroundColor: colorScheme === "dark" ? "#0a0e14" : "#f8f9fa",
                                  border: `1px solid ${borderColor}`,
                                }}
                              >
                                <div className="flex justify-between mb-2">
                                  <Text size="xs" style={{ color: mutedColor }}>
                                    Modules Assigned:
                                  </Text>
                                  <Text size="xs" fw={600} style={{ color: textColor }}>
                                    {Object.keys(pageTabs.find(t => t.id === activeTabId)?.modules || {}).length}
                                  </Text>
                                </div>
                                <div className="flex justify-between">
                                  <Text size="xs" style={{ color: mutedColor }}>
                                    Layout:
                                  </Text>
                                  <Text size="xs" fw={600} style={{ color: textColor }}>
                                    {pageTabs.find(t => t.id === activeTabId)?.layout}
                                  </Text>
                                </div>
                              </div>
                            </div>

                            {/* Delete Tab */}
                            {pageTabs.length > 1 && (
                              <div>
                                <Text size="xs" fw={500} mb={2} style={{ color: textColor }}>
                                  Danger Zone
                                </Text>
                                <Button
                                  variant="outline"
                                  color="red"
                                  size="sm"
                                  fullWidth
                                  leftSection={<X size={14} />}
                                  onClick={() => {
                                    if (confirm(`Are you sure you want to delete "${pageTabs.find(t => t.id === activeTabId)?.name}"?`)) {
                                      deleteTab(activeTabId);
                                    }
                                  }}
                                >
                                  Delete This Tab
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

            {currentStep === "network" && (
              <div className="py-12 text-center">
                <Text size="lg" style={{ color: mutedColor }}>
                  Network configuration coming soon...
                </Text>
              </div>
            )}

            {currentStep === "review" && (
              <div className="py-12 text-center">
                <Text size="lg" style={{ color: mutedColor }}>
                  Review configuration coming soon...
                </Text>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Navigation */}
        <div
          className="px-6 py-4 flex items-center justify-end"
          style={{ borderTop: `1px solid ${borderColor}` }}
        >
          <div className="flex gap-3">
            <Button variant="subtle" size="md" style={{ color: mutedColor }}>
              BACK
            </Button>
            <Button
              variant="filled"
              size="md"
              rightSection={<ArrowRight size={16} />}
              style={{ backgroundColor: accentColor }}
              onClick={() => {
                const steps: Array<typeof currentStep> = ["modules", "layout", "network", "review"];
                const currentIndex = steps.indexOf(currentStep);
                if (currentIndex < steps.length - 1) {
                  setCurrentStep(steps[currentIndex + 1]);
                }
              }}
            >
              NEXT_STEP
            </Button>
          </div>
        </div>
      </div>
    </DndProvider>
  );
}