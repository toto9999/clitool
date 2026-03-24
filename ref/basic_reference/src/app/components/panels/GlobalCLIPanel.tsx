import { Text, Badge, ScrollArea } from "@mantine/core";
import { useTheme } from "../../context/ThemeContext";
import { Terminal, ChevronRight, Folder, Box, Settings2, Database, FileCode, Server, ChevronLeft, ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";

interface TerminalLine {
  type: "command" | "output" | "error" | "success";
  content: string;
  timestamp: Date;
}

interface CommandItem {
  command: string;
  description: string;
  category: string;
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
}

export function GlobalCLIPanel() {
  const { colorScheme } = useTheme();
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([
    { type: "output", content: "Welcome to Global CLI v1.0.0", timestamp: new Date() },
    { type: "output", content: "Type a command or click a command button below", timestamp: new Date() },
    { type: "output", content: "", timestamp: new Date() },
  ]);
  const [currentInput, setCurrentInput] = useState("");
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [expandedCategory, setExpandedCategory] = useState<string | null>("Project");
  const inputRef = useRef<HTMLInputElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  const cardBg = colorScheme === "dark" ? "#1a1b1e" : "#ffffff";
  const borderColor = colorScheme === "dark" ? "rgba(64,71,82,0.2)" : "#dee2e6";
  const textColor = colorScheme === "dark" ? "#C1C2C5" : "#212529";
  const mutedColor = colorScheme === "dark" ? "#909296" : "#868e96";
  const accentColor = "#228be6";
  const terminalBg = colorScheme === "dark" ? "#0a0e14" : "#1e1e1e";
  const successColor = "#51cf66";
  const errorColor = "#ff6b6b";
  const promptColor = colorScheme === "dark" ? "#ffd43b" : "#fab005";
  const hoverBg = colorScheme === "dark" ? "rgba(34, 139, 230, 0.1)" : "rgba(34, 139, 230, 0.05)";

  const commands: CommandItem[] = [
    // Project Commands
    { command: "app project create <name>", description: "새 프로젝트 생성", category: "Project", icon: Folder },
    { command: "app project list", description: "프로젝트 목록", category: "Project", icon: Folder },
    { command: "app project delete <id>", description: "프로젝트 삭제", category: "Project", icon: Folder },
    { command: "app use <project>", description: "프로젝트 전환", category: "Project", icon: Folder },
    
    // Module Commands
    { command: "app module list", description: "모듈 목록", category: "Module", icon: Box },
    { command: "app module install <module>", description: "모듈 설치", category: "Module", icon: Box },
    { command: "app module add <module> --tab <name>", description: "탭에 모듈 추가", category: "Module", icon: Box },
    
    // Tab Commands
    { command: "app tab add <name>", description: "새 탭 추가", category: "Tab", icon: FileCode },
    { command: "app tab rename <old> <new>", description: "탭 이름 변경", category: "Tab", icon: FileCode },
    { command: "app layout set <tab> <type>", description: "레이아웃 설정", category: "Tab", icon: FileCode },
    
    // System Commands
    { command: "app init", description: "워크스페이스 초기화", category: "System", icon: Settings2 },
    { command: "app config validate", description: "설정 검증", category: "System", icon: Settings2 },
    { command: "app export all", description: "전체 내보내기", category: "System", icon: Database },
    
    // Runtime Commands
    { command: "app run", description: "프로젝트 실행", category: "Runtime", icon: Server },
    { command: "app build", description: "프로젝트 빌드", category: "Runtime", icon: Server },
  ];

  const categories = Array.from(new Set(commands.map(c => c.category)));

  const executeCommand = (cmd: string) => {
    if (!cmd.trim()) return;

    setTerminalLines(prev => [
      ...prev,
      { type: "command", content: cmd, timestamp: new Date() },
    ]);

    setCommandHistory(prev => [...prev, cmd]);
    setHistoryIndex(-1);

    setTimeout(() => {
      let response: TerminalLine;
      
      if (cmd.includes("list")) {
        response = {
          type: "output",
          content: "Fetching list...\n✓ Found 3 items",
          timestamp: new Date(),
        };
      } else if (cmd.includes("create") || cmd.includes("add")) {
        response = {
          type: "success",
          content: "✓ Successfully created",
          timestamp: new Date(),
        };
      } else if (cmd.includes("delete")) {
        response = {
          type: "error",
          content: "⚠ Confirmation required",
          timestamp: new Date(),
        };
      } else {
        response = {
          type: "success",
          content: `✓ Command executed: ${cmd}`,
          timestamp: new Date(),
        };
      }

      setTerminalLines(prev => [...prev, response]);
    }, 100);

    setCurrentInput("");
  };

  const handleCommandClick = (cmd: string) => {
    executeCommand(cmd);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      executeCommand(currentInput);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setCurrentInput(commandHistory[newIndex]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex !== -1) {
        const newIndex = Math.min(commandHistory.length - 1, historyIndex + 1);
        setHistoryIndex(newIndex);
        setCurrentInput(commandHistory[newIndex]);
      }
    }
  };

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [terminalLines]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const getLineColor = (type: TerminalLine["type"]) => {
    switch (type) {
      case "command":
        return promptColor;
      case "success":
        return successColor;
      case "error":
        return errorColor;
      case "output":
      default:
        return mutedColor;
    }
  };

  return (
    <div 
      className="flex flex-col h-screen"
      style={{ 
        width: "400px", 
        borderLeft: `1px solid ${borderColor}`,
        backgroundColor: cardBg,
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between flex-shrink-0"
        style={{ borderBottom: `1px solid ${borderColor}` }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-md flex items-center justify-center"
            style={{ backgroundColor: accentColor }}
          >
            <Terminal size={16} style={{ color: "#ffffff" }} />
          </div>
          <div>
            <Text size="sm" fw={700} style={{ color: textColor }}>
              Global CLI
            </Text>
            <Text size="xs" style={{ color: mutedColor, fontSize: "10px" }}>
              v1.0.0
            </Text>
          </div>
        </div>
      </div>

      {/* Terminal Area */}
      <div
        className="flex-1 flex flex-col overflow-hidden m-3 rounded-lg"
        style={{
          backgroundColor: terminalBg,
          border: `1px solid ${borderColor}`,
        }}
      >
        {/* Terminal Output */}
        <ScrollArea className="flex-1 p-3" style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>
          <div className="space-y-1">
            {terminalLines.map((line, idx) => (
              <div key={idx} className="flex gap-2 text-xs" style={{ color: getLineColor(line.type) }}>
                {line.type === "command" && (
                  <span style={{ color: promptColor }}>$ </span>
                )}
                <span style={{ whiteSpace: "pre-wrap" }}>{line.content}</span>
              </div>
            ))}
            <div ref={terminalEndRef} />
          </div>
        </ScrollArea>

        {/* Terminal Input */}
        <div
          className="px-3 py-2 flex items-center gap-2"
          style={{
            borderTop: `1px solid ${borderColor}`,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          }}
        >
          <span style={{ color: promptColor, fontSize: "12px" }}>$</span>
          <input
            ref={inputRef}
            type="text"
            value={currentInput}
            onChange={(e) => setCurrentInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type command..."
            className="flex-1 bg-transparent outline-none"
            style={{ color: textColor, border: "none", fontSize: "12px" }}
          />
        </div>
      </div>

      {/* Command Categories */}
      <div
        className="overflow-y-auto flex-shrink-0 px-3 pb-3"
        style={{ maxHeight: "calc(100vh - 400px)" }}
      >
        <div className="space-y-2">
          {categories.map((category) => {
            const categoryCommands = commands.filter(c => c.category === category);
            const IconComponent = categoryCommands[0]?.icon;
            const isExpanded = expandedCategory === category;

            return (
              <div
                key={category}
                className="rounded-md overflow-hidden"
                style={{
                  border: `1px solid ${borderColor}`,
                  backgroundColor: colorScheme === "dark" ? "#0a0e14" : "#f8f9fa",
                }}
              >
                {/* Category Header */}
                <button
                  onClick={() => setExpandedCategory(isExpanded ? null : category)}
                  className="w-full px-3 py-2 flex items-center gap-2 transition-all"
                  style={{ backgroundColor: "transparent", border: "none", cursor: "pointer" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = hoverBg;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  {IconComponent && <IconComponent size={12} style={{ color: accentColor }} />}
                  <Text size="xs" fw={600} style={{ color: textColor, fontSize: "11px", flex: 1, textAlign: "left" }}>
                    {category}
                  </Text>
                  <Badge size="xs" variant="light" style={{ fontSize: "9px" }}>
                    {categoryCommands.length}
                  </Badge>
                  {isExpanded ? (
                    <ChevronDown size={12} style={{ color: mutedColor }} />
                  ) : (
                    <ChevronRight size={12} style={{ color: mutedColor }} />
                  )}
                </button>

                {/* Category Commands */}
                {isExpanded && (
                  <div className="space-y-0.5 pb-1">
                    {categoryCommands.map((cmd, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleCommandClick(cmd.command)}
                        className="w-full text-left px-3 py-1.5 transition-all flex items-start gap-2"
                        style={{
                          backgroundColor: "transparent",
                          border: "none",
                          cursor: "pointer",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = hoverBg;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "transparent";
                        }}
                      >
                        <ChevronRight size={10} style={{ color: mutedColor, marginTop: "2px" }} className="flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <Text 
                            size="xs" 
                            style={{ 
                              color: accentColor, 
                              fontFamily: "'JetBrains Mono', monospace", 
                              fontSize: "10px",
                              lineHeight: 1.4,
                            }} 
                            className="truncate"
                          >
                            {cmd.command}
                          </Text>
                          <Text size="xs" style={{ color: mutedColor, fontSize: "9px", lineHeight: 1.3 }}>
                            {cmd.description}
                          </Text>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
