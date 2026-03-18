import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ConversationRegistry,
  createConversationWorkerForTests,
  type ConversationRuntime,
  type EditableMessage,
  type ResponseSink,
} from "../src/pi-runtime.js";

interface SessionEvent {
  type: string;
  assistantMessageEvent?: {
    type: string;
    delta?: string;
  };
}

class FakeEditableMessage implements EditableMessage {
  readonly edits: string[] = [];

  constructor(initialContent: string) {
    this.edits.push(initialContent);
  }

  async edit(content: string): Promise<void> {
    this.edits.push(content);
  }
}

class FakeSink implements ResponseSink {
  readonly createdMessages: FakeEditableMessage[] = [];
  readonly sentMessages: string[] = [];
  readonly typingCalls: number[] = [];

  async sendTyping(): Promise<void> {
    this.typingCalls.push(Date.now());
  }

  async createResponseMessage(initialContent: string): Promise<EditableMessage> {
    const message = new FakeEditableMessage(initialContent);
    this.createdMessages.push(message);
    return message;
  }

  async sendMessage(content: string): Promise<void> {
    this.sentMessages.push(content);
  }
}

class FakeSession {
  isStreaming = false;
  sessionFile = "/tmp/fake-session.jsonl";
  readonly promptCalls: string[] = [];
  readonly followUpCalls: string[] = [];
  private readonly listeners = new Set<(event: SessionEvent) => void>();

  subscribe(listener: (event: SessionEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async prompt(text: string): Promise<void> {
    this.promptCalls.push(text);
    this.isStreaming = true;
  }

  async followUp(text: string): Promise<void> {
    this.followUpCalls.push(text);
  }

  emit(event: SessionEvent): void {
    if (event.type === "agent_end") {
      this.isStreaming = false;
    }

    for (const listener of this.listeners) {
      listener(event);
    }
  }

  async abort(): Promise<void> {
    this.isStreaming = false;
  }

  dispose(): void {}
}

describe("ConversationRegistry", () => {
  it("aborts and disposes runtimes on reset", async () => {
    const abort = vi.fn(async () => undefined);
    const dispose = vi.fn(() => undefined);

    const runtime: ConversationRuntime = {
      sessionFile: undefined,
      handlePrompt: vi.fn(async () => undefined),
      abort,
      dispose,
    };

    const registry = new ConversationRegistry(
      "/tmp/discordjs-pi-registry-test",
      async () => runtime,
      { debug() {}, info() {}, warn() {}, error() {} } as never,
    );

    await registry.initialize();
    await registry.handlePrompt("key", "hello", new FakeSink());
    expect(registry.getActiveRuntimeCount()).toBe(1);

    await registry.resetAll();

    expect(abort).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(registry.getActiveRuntimeCount()).toBe(0);
  });
});

describe("Pi conversation runtime queueing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("queues overlapping prompts as follow-ups and emits separate responses", async () => {
    const session = new FakeSession();
    const logger = { debug() {}, info() {}, warn() {}, error() {} } as never;
    const worker = createConversationWorkerForTests(
      session as never,
      "channel:guild:channel",
      logger,
    );

    const firstSink = new FakeSink();
    await worker.handlePrompt("first", firstSink);
    expect(session.promptCalls).toEqual(["first"]);

    const secondSink = new FakeSink();
    await worker.handlePrompt("second", secondSink);
    expect(session.followUpCalls).toEqual(["second"]);

    session.emit({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "first response" },
    });
    await vi.advanceTimersByTimeAsync(600);
    session.emit({ type: "agent_end" });
    await Promise.resolve();

    expect(firstSink.createdMessages[0]?.edits.at(-1)).toBe("first response");

    session.isStreaming = true;
    session.emit({ type: "agent_start" });
    session.emit({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "second response" },
    });
    await vi.advanceTimersByTimeAsync(600);
    session.emit({ type: "agent_end" });
    await Promise.resolve();

    expect(secondSink.createdMessages[0]?.edits.at(-1)).toBe("second response");
  });
});
