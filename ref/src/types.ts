export type StreamEventType =
  | "terminal:stdout"
  | "terminal:stderr"
  | "terminal:exit"
  | "launcher:event"
  | "symphony:status";

export type StreamMessage = {
  type: StreamEventType;
  payload: Record<string, unknown>;
};

export type SymphonyStatus = {
  connected: boolean;
  provider: "symphony" | "mock";
  message: string;
};

export type LauncherEvent = {
  event: string;
  payload: Record<string, unknown>;
};

export type RunCommandRequest = {
  command: string;
  args?: string[];
  cwd?: string;
};
