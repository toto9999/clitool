import * as signalR from "@microsoft/signalr";
import WebSocket from "ws";
import { recordRuntimeLog } from "../runtime-control/runtime-logging.cjs";

export interface UiapeekRecordingBridgeOptions {
  hubUrl: string;
  onEvent: (payload: unknown) => void;
}

export interface UiapeekRecordingState {
  hub_url: string;
  connection_state: string;
  session_id: string | null;
  is_recording: boolean;
}

function installNodeWebSocketPolyfill() {
  const g = globalThis as unknown as { WebSocket?: typeof WebSocket };
  if (!g.WebSocket) {
    g.WebSocket = WebSocket as unknown as typeof g.WebSocket;
  }
}

function asSessionId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return null;
}

export function createUiapeekRecordingBridge(options: UiapeekRecordingBridgeOptions) {
  let connection: signalR.HubConnection | null = null;
  let sessionId: string | null = null;
  let isRecording = false;

  function getState(): UiapeekRecordingState {
    return {
      hub_url: options.hubUrl,
      connection_state: connection?.state ?? signalR.HubConnectionState.Disconnected,
      session_id: sessionId,
      is_recording: isRecording,
    };
  }

  async function start(): Promise<UiapeekRecordingState> {
    installNodeWebSocketPolyfill();

    if (connection?.state === signalR.HubConnectionState.Connected && isRecording) {
      return getState();
    }

    if (connection) {
      try {
        await connection.stop();
      } catch (error) {
        recordRuntimeLog("warn", "uiapeek recording: stop before restart failed", {
          error_message: error instanceof Error ? error.message : String(error),
        });
      }
      connection = null;
    }

    sessionId = null;
    isRecording = false;

    const nextConnection = new signalR.HubConnectionBuilder()
      .withUrl(options.hubUrl)
      .withAutomaticReconnect([0, 2000, 5000, 10000])
      .build();

    nextConnection.on("ReceiveRecordingEvent", (...args: unknown[]) => {
      const payload = args.length <= 1 ? args[0] : args;
      options.onEvent(payload);
    });

    nextConnection.on("RecordingSessionStarted", (...args: unknown[]) => {
      const id = args[0];
      const parsed = asSessionId(id);
      if (parsed) {
        sessionId = parsed;
      }
    });

    nextConnection.onclose((error) => {
      if (error) {
        recordRuntimeLog("warn", "uiapeek recording: connection closed", {
          error_message: error.message,
        });
      }
      isRecording = false;
    });

    await nextConnection.start();
    connection = nextConnection;

    let invokeResult: unknown;
    try {
      invokeResult = await nextConnection.invoke("StartRecordingSession");
    } catch (error) {
      recordRuntimeLog("error", "uiapeek recording: StartRecordingSession failed", {
        error_message: error instanceof Error ? error.message : String(error),
      });
      await nextConnection.stop();
      connection = null;
      throw error;
    }

    const fromInvoke = asSessionId(invokeResult);
    if (fromInvoke) {
      sessionId = fromInvoke;
    }

    isRecording = true;
    return getState();
  }

  async function stop(): Promise<UiapeekRecordingState> {
    if (!connection) {
      sessionId = null;
      isRecording = false;
      return getState();
    }

    const activeSession = sessionId;
    const activeConnection = connection;

    try {
      if (activeSession && activeConnection.state === signalR.HubConnectionState.Connected) {
        await activeConnection.invoke("StopRecordingSession", activeSession);
      }
    } catch (error) {
      recordRuntimeLog("warn", "uiapeek recording: StopRecordingSession failed", {
        error_message: error instanceof Error ? error.message : String(error),
      });
    }

    sessionId = null;
    isRecording = false;

    try {
      await activeConnection.stop();
    } catch (error) {
      recordRuntimeLog("warn", "uiapeek recording: connection stop failed", {
        error_message: error instanceof Error ? error.message : String(error),
      });
    }

    connection = null;
    return getState();
  }

  async function shutdown(): Promise<void> {
    await stop();
  }

  return {
    start,
    stop,
    getState,
    shutdown,
  };
}

export type UiapeekRecordingBridge = ReturnType<typeof createUiapeekRecordingBridge>;
