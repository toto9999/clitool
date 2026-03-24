import { useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Text,
  TextInput
} from "@mantine/core";
import { IconMoon, IconPlayerPlay, IconSun } from "@tabler/icons-react";

type StreamEventType =
  | "terminal:stdout"
  | "terminal:stderr"
  | "terminal:exit"
  | "launcher:event"
  | "symphony:status";

type StreamMessage = {
  type: StreamEventType;
  payload: Record<string, unknown>;
};

type SymphonyStatus = {
  connected: boolean;
  provider: "symphony" | "mock";
  message: string;
};

type AppProps = {
  isDarkMode: boolean;
  onToggleTheme: () => void;
};

const readString = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);

const readNumber = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const safeParseMessage = (event: MessageEvent): StreamMessage | null => {
  if (typeof event.data !== "string") {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(event.data);
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }

    const message = parsed as { type?: unknown; payload?: unknown };
    if (typeof message.type !== "string") {
      return null;
    }

    const payload =
      typeof message.payload === "object" && message.payload !== null
        ? (message.payload as Record<string, unknown>)
        : {};
    return {
      type: message.type as StreamEventType,
      payload
    };
  } catch {
    return null;
  }
};

export const App = ({ isDarkMode, onToggleTheme }: AppProps): JSX.Element => {
  const [browserUrl, setBrowserUrl] = useState("https://example.com");
  const [browserInput, setBrowserInput] = useState("https://example.com");
  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  const [command, setCommand] = useState("npm -v");
  const [symphonyStatus, setSymphonyStatus] = useState<SymphonyStatus>({
    connected: false,
    provider: "mock",
    message: "연결 전"
  });

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://localhost:7071/ws`);

    socket.addEventListener("message", (event) => {
      const message = safeParseMessage(event);
      if (!message) {
        return;
      }

      if (message.type === "symphony:status") {
        setSymphonyStatus({
          connected: Boolean(message.payload.connected),
          provider: message.payload.provider === "symphony" ? "symphony" : "mock",
          message: readString(message.payload.message, "상태 수신")
        });
        return;
      }

      if (message.type === "terminal:stdout" || message.type === "terminal:stderr") {
        const output = readString(message.payload.data);
        if (output !== "") {
          setTerminalLines((prev) => [...prev, output]);
        }
        return;
      }

      if (message.type === "terminal:exit") {
        const code = readNumber(message.payload.code, -1);
        setTerminalLines((prev) => [...prev, `\n[process exited: ${code}]\n`]);
      }
    });

    return () => {
      socket.close();
    };
  }, []);

  const terminalText = useMemo(() => terminalLines.join(""), [terminalLines]);

  const connectSymphony = async (): Promise<void> => {
    const response = await fetch("http://localhost:7071/api/symphony/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const json = (await response.json()) as SymphonyStatus;
    setSymphonyStatus(json);
  };

  const runCommand = async (): Promise<void> => {
    const [cmd, ...args] = command.split(" ").filter((token) => token.trim() !== "");
    if (!cmd) {
      return;
    }

    await fetch("http://localhost:7071/api/terminal/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        command: cmd,
        args
      })
    });
  };

  const applyBrowserUrl = (): void => {
    if (browserInput.trim() === "") {
      return;
    }
    setBrowserUrl(browserInput);
  };

  return (
    <Stack h="100vh" p="md" gap="md">
      <Paper withBorder radius="md" p="md">
        <Group justify="space-between" align="center" wrap="wrap">
          <Group align="end" wrap="wrap">
            <TextInput
              label="Browser URL"
              aria-label="browser url input"
              value={browserInput}
              onChange={(event) => setBrowserInput(event.currentTarget.value)}
              miw={340}
            />
            <Button onClick={applyBrowserUrl} aria-label="open browser url">
              Open
            </Button>
          </Group>

          <Group align="end" wrap="wrap">
            <TextInput
              label="Terminal Command"
              aria-label="terminal command input"
              value={command}
              onChange={(event) => setCommand(event.currentTarget.value)}
              miw={300}
            />
            <Button leftSection={<IconPlayerPlay size={16} />} onClick={runCommand} aria-label="run command">
              Run
            </Button>
          </Group>

          <Group>
            <Button variant="light" onClick={connectSymphony} aria-label="connect symphony">
              Symphony Connect
            </Button>
            <Badge color={symphonyStatus.connected ? "teal" : "gray"} variant="filled">
              {symphonyStatus.provider} | {symphonyStatus.connected ? "connected" : "disconnected"}
            </Badge>
            <Text size="sm">{symphonyStatus.message}</Text>
            <ActionIcon
              size="lg"
              variant="light"
              aria-label="toggle theme"
              onClick={onToggleTheme}
              title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDarkMode ? <IconSun size={18} /> : <IconMoon size={18} />}
            </ActionIcon>
          </Group>
        </Group>
      </Paper>

      <Paper withBorder radius="md" p={0} style={{ flex: 1, overflow: "hidden" }}>
        <iframe
          title="launcher browser preview"
          src={browserUrl}
          style={{ width: "100%", height: "100%", border: 0, background: "#fff" }}
        />
      </Paper>

      <Paper withBorder radius="md" p={0} h={220}>
        <Text fw={600} size="sm" px="md" py="xs">
          Terminal Output
        </Text>
        <ScrollArea h={180} px="md" pb="md">
          <pre style={{ margin: 0, fontFamily: "Consolas, Courier New, monospace", fontSize: 12 }}>
            {terminalText}
          </pre>
        </ScrollArea>
      </Paper>
    </Stack>
  );
};
