import type { SymphonyStatus } from "./types.js";

type SymphonyModule = {
  createClient?: (config: Record<string, unknown>) => unknown;
};

type SymphonyClientWithSend = {
  send?: (payload: Record<string, unknown>) => Promise<unknown>;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isSymphonyModule = (value: unknown): value is SymphonyModule =>
  isObject(value) && ("createClient" in value ? typeof value.createClient === "function" : true);

const isClientWithSend = (value: unknown): value is SymphonyClientWithSend =>
  isObject(value) && ("send" in value ? typeof value.send === "function" : true);

export class SymphonyAdapter {
  private client: SymphonyClientWithSend | null = null;
  private status: SymphonyStatus = {
    connected: false,
    provider: "mock",
    message: "symphony 라이브러리 연결 전"
  };

  async connect(config: Record<string, unknown> = {}): Promise<SymphonyStatus> {
    try {
      const moduleName = "symphony";
      const moduleValue: unknown = await import(moduleName);

      if (!isSymphonyModule(moduleValue) || typeof moduleValue.createClient !== "function") {
        this.status = {
          connected: false,
          provider: "mock",
          message: "symphony 모듈 형식이 예상과 다릅니다"
        };
        return this.status;
      }

      const client = moduleValue.createClient(config);
      if (!isClientWithSend(client)) {
        this.status = {
          connected: false,
          provider: "mock",
          message: "symphony client 형식 검증 실패"
        };
        return this.status;
      }

      this.client = client;
      this.status = {
        connected: true,
        provider: "symphony",
        message: "symphony 라이브러리 연결 완료"
      };
      return this.status;
    } catch {
      this.client = null;
      this.status = {
        connected: false,
        provider: "mock",
        message: "symphony 라이브러리가 설치되어 있지 않아 mock 모드로 동작"
      };
      return this.status;
    }
  }

  async send(payload: Record<string, unknown>): Promise<void> {
    if (!this.client || typeof this.client.send !== "function") {
      return;
    }

    await this.client.send(payload);
  }

  getStatus(): SymphonyStatus {
    return this.status;
  }
}
