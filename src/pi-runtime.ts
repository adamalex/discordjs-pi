import fs from "node:fs/promises";
import path from "node:path";
import {
  AuthStorage,
  SessionManager,
  SettingsManager,
  createAgentSession,
  type AgentSession,
  type AgentSessionEvent,
  type ModelRegistry,
} from "@mariozechner/pi-coding-agent";
import { ModelRegistry as PiModelRegistry } from "@mariozechner/pi-coding-agent";
import type { AppConfig } from "./config.js";
import type { Logger } from "./logger.js";
import { buildStreamingPreview, splitDiscordMessage } from "./text.js";

export interface EditableMessage {
  edit(content: string): Promise<void>;
}

export interface ResponseSink {
  sendTyping(): Promise<void>;
  createResponseMessage(initialContent: string): Promise<EditableMessage>;
  sendMessage(content: string): Promise<void>;
}

interface SessionLike {
  readonly isStreaming: boolean;
  readonly sessionFile: string | undefined;
  subscribe(listener: (event: AgentSessionEvent) => void): () => void;
  prompt(text: string): Promise<void>;
  followUp(text: string): Promise<void>;
  abort(): Promise<void>;
  dispose(): void;
}

interface PendingJob {
  readonly text: string;
  readonly sink: ResponseSink;
}

interface ActiveJob extends PendingJob {
  responseMessage: EditableMessage | null;
  accumulatedText: string;
  lastPublishedText?: string;
  typingInterval: NodeJS.Timeout | null;
  flushTimer: NodeJS.Timeout | null;
  insideToolBlock: boolean;
}

export interface ConversationRuntime {
  readonly sessionFile: string | undefined;
  handlePrompt(text: string, sink: ResponseSink): Promise<void>;
  abort(): Promise<void>;
  dispose(): void;
}

export interface PiEnvironment {
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
  settingsManager: SettingsManager;
  requestedModel?: Awaited<ReturnType<ModelRegistry["find"]>>;
}

export async function createPiEnvironment(
  config: AppConfig,
  logger: Logger,
): Promise<PiEnvironment> {
  const authStorage = AuthStorage.inMemory();

  if (config.openAiApiKey) {
    authStorage.setRuntimeApiKey("openai", config.openAiApiKey);
  }

  if (config.anthropicApiKey) {
    authStorage.setRuntimeApiKey("anthropic", config.anthropicApiKey);
  }

  const modelRegistry = new PiModelRegistry(authStorage);
  const requestedModel = modelRegistry.find(config.botProvider, config.botModel);
  const availableModels = modelRegistry.getAvailable();

  if (!requestedModel) {
    logger.warn("Configured BOT_PROVIDER/BOT_MODEL was not found in the Pi model registry", {
      provider: config.botProvider,
      model: config.botModel,
    });
  }

  if (availableModels.length === 0) {
    throw new Error("No Pi models are available with the configured API keys.");
  }

  const settingsManager = SettingsManager.inMemory();

  return {
    authStorage,
    modelRegistry,
    settingsManager,
    requestedModel,
  };
}

export class ConversationRegistry {
  private readonly runtimes = new Map<string, ConversationRuntime>();
  private readonly creating = new Map<string, Promise<ConversationRuntime>>();
  private lastActiveConversationKey: string | null = null;

  constructor(
    private readonly sessionRootDir: string,
    private readonly createRuntime: (conversationKey: string) => Promise<ConversationRuntime>,
    private readonly logger: Logger,
  ) {}

  async initialize(): Promise<void> {
    await fs.mkdir(this.sessionRootDir, { recursive: true });
  }

  async handlePrompt(conversationKey: string, text: string, sink: ResponseSink): Promise<void> {
    this.lastActiveConversationKey = conversationKey;
    void this.persistLastActiveConversation(conversationKey);
    const runtime = await this.getOrCreateRuntime(conversationKey);
    await runtime.handlePrompt(text, sink);
  }

  private get lastActiveConversationPath(): string {
    return path.join(path.dirname(this.sessionRootDir), "last-active-conversation");
  }

  private async persistLastActiveConversation(conversationKey: string): Promise<void> {
    try {
      await fs.writeFile(this.lastActiveConversationPath, conversationKey, "utf-8");
    } catch (error) {
      this.logger.warn("Failed to persist last active conversation", error);
    }
  }

  getActiveRuntimeCount(): number {
    return this.runtimes.size;
  }

  async countPersistedSessionFiles(): Promise<number> {
    return countFilesByExtension(this.sessionRootDir, ".jsonl");
  }

  async resetAll(): Promise<void> {
    const pendingCreates = Array.from(this.creating.values());
    const created = Array.from(this.runtimes.values());

    this.creating.clear();
    this.runtimes.clear();

    await Promise.allSettled(pendingCreates);
    await Promise.allSettled(
      created.map(async (runtime) => {
        await runtime.abort();
        runtime.dispose();
      }),
    );

    await fs.rm(this.sessionRootDir, { force: true, recursive: true });
    await fs.mkdir(this.sessionRootDir, { recursive: true });
  }

  async shutdown(): Promise<void> {
    const runtimes = Array.from(this.runtimes.values());
    this.creating.clear();
    this.runtimes.clear();

    await Promise.allSettled(
      runtimes.map(async (runtime) => {
        await runtime.abort();
        runtime.dispose();
      }),
    );
  }

  private async getOrCreateRuntime(conversationKey: string): Promise<ConversationRuntime> {
    const existing = this.runtimes.get(conversationKey);
    if (existing) {
      return existing;
    }

    const inFlight = this.creating.get(conversationKey);
    if (inFlight) {
      return inFlight;
    }

    const created = this.createRuntime(conversationKey)
      .then((runtime) => {
        this.creating.delete(conversationKey);
        this.runtimes.set(conversationKey, runtime);
        return runtime;
      })
      .catch((error) => {
        this.creating.delete(conversationKey);
        throw error;
      });

    this.creating.set(conversationKey, created);
    return created;
  }
}

export async function createConversationRuntime(
  conversationKey: string,
  env: PiEnvironment,
  config: AppConfig,
  logger: Logger,
): Promise<ConversationRuntime> {
  const conversationDir = path.join(config.sessionRootDir, encodeConversationKey(conversationKey));
  await fs.mkdir(conversationDir, { recursive: true });

  const sessionManager = SessionManager.continueRecent(config.projectRoot, conversationDir);
  const createSessionOptions = {
    cwd: config.projectRoot,
    authStorage: env.authStorage,
    modelRegistry: env.modelRegistry,
    settingsManager: env.settingsManager,
    sessionManager,
  };
  const { session, modelFallbackMessage } = await createAgentSession(
    env.requestedModel
      ? {
          ...createSessionOptions,
          model: env.requestedModel,
        }
      : createSessionOptions,
  );

  if (modelFallbackMessage) {
    logger.warn("Pi session reported a model fallback", {
      conversationKey,
      modelFallbackMessage,
    });
  }

  logger.debug("Created Pi conversation runtime", {
    conversationKey,
    sessionFile: session.sessionFile,
  });

  return new PiConversationWorker(session, conversationKey, logger);
}

class PiConversationWorker implements ConversationRuntime {
  readonly sessionFile: string | undefined;
  private readonly unsubscribe: () => void;
  private readonly queuedJobs: PendingJob[] = [];
  private activeJob: ActiveJob | null = null;
  private eventChain = Promise.resolve();
  private shuttingDown = false;

  constructor(
    private readonly session: SessionLike,
    private readonly conversationKey: string,
    private readonly logger: Logger,
  ) {
    this.sessionFile = session.sessionFile;
    this.unsubscribe = this.session.subscribe((event) => {
      this.eventChain = this.eventChain
        .then(() => this.handleEvent(event))
        .catch((error) => this.logger.error("Failed to process Pi session event", error));
    });
  }

  async handlePrompt(text: string, sink: ResponseSink): Promise<void> {
    if (this.shuttingDown) {
      throw new Error("Conversation runtime is shutting down.");
    }

    if (this.activeJob || this.session.isStreaming) {
      const queuedJob: PendingJob = { text, sink };
      this.queuedJobs.push(queuedJob);

      try {
        await this.session.followUp(text);
        this.logger.debug("Queued Pi follow-up", {
          conversationKey: this.conversationKey,
          queuedCount: this.queuedJobs.length,
        });
      } catch (error) {
        const index = this.queuedJobs.indexOf(queuedJob);
        if (index >= 0) {
          this.queuedJobs.splice(index, 1);
        }
        throw error;
      }

      return;
    }

    await this.activateNextJob({ text, sink });

    try {
      await this.session.prompt(text);
    } catch (error) {
      await this.failActiveJob(error);
      throw error;
    }
  }

  async abort(): Promise<void> {
    this.shuttingDown = true;
    this.queuedJobs.length = 0;
    await this.session.abort();
    this.stopActiveJobTimers();
  }

  dispose(): void {
    this.unsubscribe();
    this.stopActiveJobTimers();
    this.activeJob = null;
    this.session.dispose();
  }

  private async handleEvent(event: AgentSessionEvent): Promise<void> {
    if (this.shuttingDown) {
      return;
    }

    switch (event.type) {
      case "agent_start":
        await this.ensureActiveJob();
        return;
      case "message_start":
        await this.ensureActiveJob();
        if (this.activeJob) {
          // Close any open tool block before new assistant text starts.
          this.closeToolBlock();
          // When a new assistant message starts and we already have accumulated text
          // (i.e., after tool calls), insert a paragraph break so the text blocks
          // don't get smashed together in the final Discord message.
          if (this.activeJob.accumulatedText.length > 0) {
            this.activeJob.accumulatedText = this.activeJob.accumulatedText.trimEnd() + "\n\n";
          }
        }
        return;
      case "message_update":
        await this.ensureActiveJob();
        if (
          this.activeJob &&
          event.assistantMessageEvent.type === "text_delta" &&
          event.assistantMessageEvent.delta
        ) {
          this.activeJob.accumulatedText += event.assistantMessageEvent.delta;
          this.scheduleFlush();
        }
        return;
      case "tool_execution_start":
        await this.ensureActiveJob();
        if (this.activeJob) {
          if (!this.activeJob.insideToolBlock) {
            // Open a new fenced code block for tool calls.
            if (this.activeJob.accumulatedText.length > 0) {
              this.activeJob.accumulatedText = this.activeJob.accumulatedText.trimEnd() + "\n";
            }
            this.activeJob.accumulatedText += "```\n";
            this.activeJob.insideToolBlock = true;
          }
          const line = formatToolStartLine(event.toolName, event.args);
          this.activeJob.accumulatedText += line;
          this.scheduleFlush();
        }
        return;
      case "tool_execution_end":
        if (this.activeJob) {
          const status = event.isError ? "error" : "ok";
          this.activeJob.accumulatedText += ` → ${status}\n`;
          this.scheduleFlush();
        }
        return;
      case "agent_end":
        if (this.activeJob) {
          this.closeToolBlock();
        }
        await this.finalizeActiveJob();
        return;
      default:
        return;
    }
  }

  private async ensureActiveJob(): Promise<void> {
    if (this.activeJob || this.queuedJobs.length === 0) {
      return;
    }

    const nextJob = this.queuedJobs.shift();
    if (!nextJob) {
      return;
    }

    await this.activateNextJob(nextJob);
  }

  private async activateNextJob(job: PendingJob): Promise<void> {
    const typingInterval = setInterval(() => {
      void job.sink.sendTyping().catch((error) => {
        this.logger.warn("Failed to send typing indicator", error);
      });
    }, 4_000);

    await job.sink.sendTyping().catch((error) => {
      this.logger.warn("Failed to send initial typing indicator", error);
    });

    this.activeJob = {
      ...job,
      responseMessage: null,
      accumulatedText: "",
      flushTimer: null,
      typingInterval,
      insideToolBlock: false,
    };
  }

  private closeToolBlock(): void {
    if (this.activeJob && this.activeJob.insideToolBlock) {
      this.activeJob.accumulatedText = this.activeJob.accumulatedText.trimEnd() + "\n```";
      this.activeJob.insideToolBlock = false;
    }
  }

  private scheduleFlush(): void {
    if (!this.activeJob || this.activeJob.flushTimer) {
      return;
    }

    this.activeJob.flushTimer = setTimeout(() => {
      void this.flushActiveJob(false);
    }, 500);
  }

  private async flushActiveJob(finalize: boolean): Promise<void> {
    const activeJob = this.activeJob;
    if (!activeJob) {
      return;
    }

    if (activeJob.flushTimer) {
      clearTimeout(activeJob.flushTimer);
      activeJob.flushTimer = null;
    }

    const nextText = finalize
      ? splitDiscordMessage(activeJob.accumulatedText)[0]
      : buildStreamingPreview(activeJob.accumulatedText);

    if (!nextText || nextText === activeJob.lastPublishedText) {
      return;
    }

    if (!activeJob.responseMessage) {
      activeJob.responseMessage = await activeJob.sink.createResponseMessage(nextText);
      activeJob.lastPublishedText = nextText;
    } else {
      await activeJob.responseMessage.edit(nextText);
      activeJob.lastPublishedText = nextText;
    }
  }

  private async finalizeActiveJob(): Promise<void> {
    const activeJob = this.activeJob;
    if (!activeJob) {
      return;
    }

    this.stopActiveJobTimers();
    const chunks = splitDiscordMessage(activeJob.accumulatedText);

    await this.flushActiveJob(true);
    for (const chunk of chunks.slice(1)) {
      await activeJob.sink.sendMessage(chunk);
    }

    this.activeJob = null;
  }

  private async failActiveJob(error: unknown): Promise<void> {
    const activeJob = this.activeJob;
    if (!activeJob) {
      return;
    }

    this.stopActiveJobTimers();
    const message = formatErrorMessage(error);

    if (activeJob.responseMessage) {
      await activeJob.responseMessage.edit(message).catch(() => undefined);
    } else {
      await activeJob.sink.createResponseMessage(message).catch(() => undefined);
    }

    this.activeJob = null;
  }

  private stopActiveJobTimers(): void {
    if (!this.activeJob) {
      return;
    }

    if (this.activeJob.flushTimer) {
      clearTimeout(this.activeJob.flushTimer);
      this.activeJob.flushTimer = null;
    }

    if (this.activeJob.typingInterval) {
      clearInterval(this.activeJob.typingInterval);
      this.activeJob.typingInterval = null;
    }
  }
}

export function createConversationWorkerForTests(
  session: SessionLike,
  conversationKey: string,
  logger: Logger,
): ConversationRuntime {
  return new PiConversationWorker(session, conversationKey, logger);
}

function encodeConversationKey(key: string): string {
  return Buffer.from(key).toString("hex");
}

async function countFilesByExtension(dirPath: string, extension: string): Promise<number> {
  let total = 0;

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += await countFilesByExtension(fullPath, extension);
      } else if (entry.isFile() && entry.name.endsWith(extension)) {
        total += 1;
      }
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw error;
    }
  }

  return total;
}

function formatErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown error";
  return `Pi request failed: ${message}`;
}

const TOOL_DETAIL_MAX_LENGTH = 120;

function formatToolStartLine(toolName: string, args: Record<string, unknown> | undefined): string {
  let detail = "";

  switch (toolName) {
    case "bash":
      detail = truncateToolDetail(String(args?.command ?? ""));
      break;
    case "read":
    case "edit":
    case "write":
      detail = String(args?.path ?? "");
      break;
    default:
      break;
  }

  return detail ? `⚙️ ${toolName}: ${detail}` : `⚙️ ${toolName}`;
}

function truncateToolDetail(text: string): string {
  // Collapse to single line for display.
  const oneLine = text.replace(/\n/g, " ").trim();
  if (oneLine.length <= TOOL_DETAIL_MAX_LENGTH) return oneLine;
  return oneLine.slice(0, TOOL_DETAIL_MAX_LENGTH - 1) + "…";
}

export type { AgentSession };
