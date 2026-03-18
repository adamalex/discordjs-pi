import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ConversationRegistry,
  createConversationWorkerForTests,
  sendProjectFileAttachment,
  type ConversationRuntime,
  type EditableMessage,
  type FileAttachment,
  type ResponseSink,
} from "../src/pi-runtime.js";

interface SessionEvent {
  type: string;
  toolName?: string;
  args?: Record<string, unknown>;
  isError?: boolean;
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
  readonly sentFiles: FileAttachment[] = [];
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

  async sendFileAttachment(attachment: FileAttachment): Promise<void> {
    this.sentFiles.push(attachment);
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

  it("renders tool execution lines inline with the streamed response", async () => {
    const session = new FakeSession();
    const logger = { debug() {}, info() {}, warn() {}, error() {} } as never;
    const worker = createConversationWorkerForTests(
      session as never,
      "channel:guild:channel",
      logger,
    );

    const sink = new FakeSink();
    await worker.handlePrompt("first", sink);

    session.emit({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "Checking the repo" },
    });
    await vi.advanceTimersByTimeAsync(600);

    session.emit({
      type: "tool_execution_start",
      toolName: "read",
      args: { path: "/Users/adam/Projects/discordjs-pi/src/pi-runtime.ts" },
    });
    await vi.advanceTimersByTimeAsync(600);

    session.emit({
      type: "tool_execution_end",
      toolName: "read",
      isError: false,
    });
    session.emit({ type: "message_start" });
    session.emit({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "Done." },
    });
    await vi.advanceTimersByTimeAsync(600);
    session.emit({ type: "agent_end" });
    await Promise.resolve();

    expect(sink.createdMessages[0]?.edits.at(-1)).toBe(
      ["Checking the repo", "", "```", "⚙️ read: ./src/pi-runtime.ts → ok", "```", "Done."].join("\n"),
    );
  });
});

describe("sendProjectFileAttachment", () => {
  it("sends an existing project file through the response sink", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "discordjs-pi-attach-"));
    const filePath = path.join(projectRoot, "notes", "ideas.md");
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "hello", "utf-8");

    const sink = new FakeSink();
    const result = await sendProjectFileAttachment(
      projectRoot,
      {
        path: "notes/ideas.md",
        message: "Requested file",
      },
      sink,
    );

    expect(result).toEqual({
      displayPath: "./notes/ideas.md",
      filename: "ideas.md",
    });
    expect(sink.sentFiles).toEqual([
      {
        path: filePath,
        content: "Requested file",
        filename: "ideas.md",
      },
    ]);
  });

  it("rejects attachment paths outside the project root", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "discordjs-pi-attach-"));
    const sink = new FakeSink();

    await expect(
      sendProjectFileAttachment(
        projectRoot,
        {
          path: "../secret.txt",
        },
        sink,
      ),
    ).rejects.toThrow("Only files inside the current project can be attached.");

    expect(sink.sentFiles).toEqual([]);
  });
});
