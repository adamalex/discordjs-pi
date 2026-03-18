import fs from "node:fs/promises";
import path from "node:path";
import { Type, type Static } from "@sinclair/typebox";
import {
  AuthStorage,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
  createAgentSession,
  createCodingTools,
  createFindTool,
  createGrepTool,
  createLsTool,
  type AgentSession,
  type AgentSessionEvent,
  type ModelRegistry,
  type ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import { ModelRegistry as PiModelRegistry } from "@mariozechner/pi-coding-agent";
import type { ImageContent, AssistantMessage } from "@mariozechner/pi-ai";
import type { AppConfig } from "./config.js";
import type { Logger } from "./logger.js";
import { renderSchedule } from "./schedule-render.js";
import type {
  RenderScheduleOptions,
  ScheduleItem,
  ScheduleRenderMode,
  ScheduleResponse,
  ScheduleStatus,
} from "./schedule-types.js";
import { buildStreamingPreview, splitDiscordMessage } from "./text.js";

const DISCORD_SYSTEM_PROMPT_APPENDIX = [
  "## Discord Interaction Guidelines",
  "",
  "You are an AI coding assistant replying inside Discord.",
  "",
  "- Be concise by default, but expand when the user asks for depth.",
  "- Use clean Discord-friendly markdown and avoid unnecessary verbosity.",
  "- Treat author, location, and attachment metadata as context for reasoning, not text to echo back unless relevant.",
  "- Start with the answer, result, or recommendation.",
  "- Prefer short paragraphs or bullets over long walls of text.",
  "- Avoid repeating the user's request unless it improves clarity.",
  "- If the answer is long, summarize first and then provide structured detail.",
  "- Be accurate, explicit, and practical when discussing code or implementation work.",
  "- Mention file paths clearly when relevant.",
  "- Summarize actions and findings instead of dumping raw tool chatter unless the user requests it.",
  "- Ask before restart, deploy, or destructive changes unless the user explicitly requests them.",
  "",
  "## Schedule Formatting",
  "",
  "- For schedule-like results, prefer the shared Discord schedule display format.",
  "- When a schedule script can return normalized JSON, prefer that path and use the render_schedule tool instead of hand-formatting long schedule output.",
  "- Use compact mode by default, detailed mode only when the user asks for full details, and availability mode for facility/open-swim schedules.",
].join("\n");

export interface EditableMessage {
  edit(content: string): Promise<void>;
}

export interface FileAttachment {
  path: string;
  content?: string;
  filename?: string;
}

export interface ResponseSink {
  sendTyping(): Promise<void>;
  createResponseMessage(initialContent: string): Promise<EditableMessage>;
  sendMessage(content: string): Promise<void>;
  sendFileAttachment(attachment: FileAttachment): Promise<void>;
}

interface SessionLike {
  readonly isStreaming: boolean;
  readonly sessionFile: string | undefined;
  readonly model: AgentSession["model"];
  readonly thinkingLevel: AgentSession["thinkingLevel"];
  subscribe(listener: (event: AgentSessionEvent) => void): () => void;
  prompt(text: string, options?: { images?: ImageContent[] }): Promise<void>;
  followUp(text: string, images?: ImageContent[]): Promise<void>;
  abort(): Promise<void>;
  dispose(): void;
}

interface ProjectFileAttachmentRequest {
  path: string;
  message?: string;
  filename?: string;
}

interface PendingJob {
  readonly text: string;
  readonly images?: ImageContent[] | undefined;
  readonly sink: ResponseSink;
}

interface ActiveJob extends PendingJob {
  responseMessage: EditableMessage | null;
  accumulatedText: string;
  lastPublishedText?: string;
  typingInterval: NodeJS.Timeout | null;
  flushTimer: NodeJS.Timeout | null;
  publishChain: Promise<void>;
  insideToolBlock: boolean;
  needsSeparator: boolean;
  pendingToolLines: string[];
}

export interface SessionConfiguration {
  model: {
    provider: string;
    id: string;
  } | null;
  thinkingLevel: AgentSession["thinkingLevel"];
}

export interface ConversationRuntime {
  readonly sessionFile: string | undefined;
  getSessionConfiguration(): SessionConfiguration;
  handlePrompt(text: string, sink: ResponseSink, images?: ImageContent[]): Promise<void>;
  abort(): Promise<void>;
  dispose(): void;
}

export interface PiEnvironment {
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
  settingsManager: SettingsManager;
  resourceLoader: DefaultResourceLoader;
  requestedModel?: Awaited<ReturnType<ModelRegistry["find"]>>;
}

export async function createPiEnvironment(
  config: AppConfig,
  logger: Logger,
): Promise<PiEnvironment> {
  // Use file-backed auth storage so Pi can read credentials from its standard
  // auth.json location (for example ~/.pi/agent/auth.json), while still
  // allowing runtime API key overrides from environment config.
  const authStorage = AuthStorage.create();

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
  settingsManager.setDefaultThinkingLevel("high");

  const resourceLoader = new DefaultResourceLoader({
    cwd: config.projectRoot,
    settingsManager,
    appendSystemPromptOverride: (base) => [...base, DISCORD_SYSTEM_PROMPT_APPENDIX],
  });
  await resourceLoader.reload();

  return {
    authStorage,
    modelRegistry,
    settingsManager,
    resourceLoader,
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

  async handlePrompt(conversationKey: string, text: string, sink: ResponseSink, images?: ImageContent[]): Promise<void> {
    this.lastActiveConversationKey = conversationKey;
    void this.persistLastActiveConversation(conversationKey);
    const runtime = await this.getOrCreateRuntime(conversationKey);
    await runtime.handlePrompt(text, sink, images);
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

  async getSessionConfiguration(conversationKey: string): Promise<SessionConfiguration | null> {
    const existing = this.runtimes.get(conversationKey);
    if (existing) {
      return existing.getSessionConfiguration();
    }

    if (!(await hasPersistedSession(path.join(this.sessionRootDir, encodeConversationKey(conversationKey))))) {
      return null;
    }

    const runtime = await this.getOrCreateRuntime(conversationKey);
    return runtime.getSessionConfiguration();
  }

  async reset(conversationKey: string): Promise<boolean> {
    const runtime = this.runtimes.get(conversationKey);
    if (!runtime) {
      return false;
    }

    this.runtimes.delete(conversationKey);
    await runtime.abort();
    runtime.dispose();

    // Remove the persisted session directory for this conversation
    const conversationDir = path.join(this.sessionRootDir, encodeConversationKey(conversationKey));
    await fs.rm(conversationDir, { force: true, recursive: true }).catch(() => undefined);

    return true;
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

  let worker: PiConversationWorker | null = null;
  const discordAttachFileTool = createDiscordAttachFileTool(async (request) => {
    if (!worker) {
      throw new Error("Discord attachment runtime is not ready yet.");
    }
    return worker.sendProjectFileAttachment(request);
  });
  const renderScheduleTool = createRenderScheduleTool();

  const sessionManager = SessionManager.continueRecent(config.projectRoot, conversationDir);
  const createSessionOptions = {
    cwd: config.projectRoot,
    authStorage: env.authStorage,
    modelRegistry: env.modelRegistry,
    settingsManager: env.settingsManager,
    resourceLoader: env.resourceLoader,
    sessionManager,
    tools: [
      ...createCodingTools(config.projectRoot),
      createGrepTool(config.projectRoot),
      createFindTool(config.projectRoot),
      createLsTool(config.projectRoot),
    ],
    customTools: [discordAttachFileTool, renderScheduleTool],
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

  worker = new PiConversationWorker(session, conversationKey, logger, config.projectRoot);
  return worker;
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
    private readonly projectRoot: string = process.cwd(),
  ) {
    this.sessionFile = session.sessionFile;
    this.unsubscribe = this.session.subscribe((event) => {
      this.eventChain = this.eventChain
        .then(() => this.handleEvent(event))
        .catch((error) => this.logger.error("Failed to process Pi session event", error));
    });
  }

  getSessionConfiguration(): SessionConfiguration {
    return {
      model: this.session.model
        ? {
            provider: this.session.model.provider,
            id: this.session.model.id,
          }
        : null,
      thinkingLevel: this.session.thinkingLevel,
    };
  }

  async handlePrompt(text: string, sink: ResponseSink, images?: ImageContent[]): Promise<void> {
    if (this.shuttingDown) {
      throw new Error("Conversation runtime is shutting down.");
    }

    if (this.activeJob || this.session.isStreaming) {
      const queuedJob: PendingJob = { text, images, sink };
      this.queuedJobs.push(queuedJob);

      try {
        await this.session.followUp(text, images);
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

    await this.activateNextJob({ text, images, sink });

    try {
      await this.session.prompt(text, images?.length ? { images } : undefined);
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

  async sendProjectFileAttachment(
    request: ProjectFileAttachmentRequest,
  ): Promise<{ displayPath: string; filename: string }> {
    const activeJob = this.activeJob;
    if (!activeJob) {
      throw new Error("No active Discord response is available for sending an attachment.");
    }

    return sendProjectFileAttachment(this.projectRoot, request, activeJob.sink);
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
          // Mark that a separator is needed before the next text delta.
          // We don't close the tool block here because subsequent tool calls
          // should merge into the same code fence.
          if (this.activeJob.accumulatedText.length > 0) {
            this.activeJob.needsSeparator = true;
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
          // Close any open tool block now that real text is arriving.
          if (this.activeJob.needsSeparator) {
            this.closeToolBlock();
            this.activeJob.accumulatedText = this.activeJob.accumulatedText.trimEnd() + "\n";
            this.activeJob.needsSeparator = false;
          }
          this.activeJob.accumulatedText += event.assistantMessageEvent.delta;
          this.scheduleFlush();
        }
        return;
      case "tool_execution_start":
        await this.ensureActiveJob();
        if (this.activeJob) {
          // Clear separator flag — consecutive tools merge into one code fence.
          this.activeJob.needsSeparator = false;
          if (!this.activeJob.insideToolBlock) {
            // Open a new fenced code block for tool calls.
            if (this.activeJob.accumulatedText.length > 0) {
              this.activeJob.accumulatedText = this.activeJob.accumulatedText.trimEnd() + "\n\n";
            }
            this.activeJob.accumulatedText += "```\n";
            this.activeJob.insideToolBlock = true;
          }
          const line = formatToolStartLine(event.toolName, event.args);
          this.activeJob.pendingToolLines.push(line);
          this.activeJob.accumulatedText += line + "\n";
          this.scheduleFlush();
        }
        return;
      case "tool_execution_end":
        if (this.activeJob) {
          const status = event.isError ? "error" : "ok";
          const pending = this.activeJob.pendingToolLines.shift();
          if (pending) {
            const idx = this.activeJob.accumulatedText.indexOf(pending + "\n");
            if (idx !== -1) {
              this.activeJob.accumulatedText =
                this.activeJob.accumulatedText.slice(0, idx) +
                `${pending} → ${status}\n` +
                this.activeJob.accumulatedText.slice(idx + pending.length + 1);
            }
          }
          this.scheduleFlush();
        }
        return;
      case "agent_end":
        if (this.activeJob) {
          this.closeToolBlock();
          // Surface error messages from the SDK that would otherwise be silently swallowed.
          // When the API call fails, the SDK emits agent_end with an assistant message
          // containing stopReason "error" and an errorMessage, but doesn't throw from prompt().
          const messages = "messages" in event ? (event.messages as unknown[]) : undefined;
          if (messages) {
            const errorMessage = extractAgentEndError(messages);
            if (errorMessage && !this.activeJob.accumulatedText.trim()) {
              this.activeJob.accumulatedText = `⚠️ ${errorMessage}`;
            }
          }
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
      publishChain: Promise.resolve(),
      insideToolBlock: false,
      needsSeparator: false,
      pendingToolLines: [],
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
      void this.flushActiveJob(false).catch((error) => {
        this.logger.error("Failed to flush streaming Discord response", {
          conversationKey: this.conversationKey,
          error: error instanceof Error ? error.message : String(error),
        });
      });
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

    const publish = activeJob.publishChain.then(async () => {
      const nextText = finalize
        ? splitDiscordMessage(activeJob.accumulatedText)[0]
        : buildStreamingPreview(activeJob.accumulatedText);

      if (!nextText || nextText === activeJob.lastPublishedText) {
        return;
      }

      if (!activeJob.responseMessage) {
        activeJob.responseMessage = await activeJob.sink.createResponseMessage(nextText);
      } else {
        await activeJob.responseMessage.edit(nextText);
      }

      activeJob.lastPublishedText = nextText;
    });

    activeJob.publishChain = publish.catch(() => undefined);
    await publish;
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

async function hasPersistedSession(dirPath: string): Promise<boolean> {
  return (await countFilesByExtension(dirPath, ".jsonl")) > 0;
}

/**
 * Extract an error message from the agent_end event's messages array.
 * When the SDK catches an API error, it emits agent_end with an assistant message
 * that has stopReason "error" and an errorMessage — but prompt() doesn't throw,
 * so without this check the error is silently swallowed.
 */
function extractAgentEndError(messages: unknown[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as Partial<AssistantMessage>;
    if (msg?.role === "assistant" && msg.stopReason === "error" && msg.errorMessage) {
      return msg.errorMessage;
    }
  }
  return undefined;
}

function formatErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown error";
  return `Pi request failed: ${message}`;
}

const DISCORD_ATTACH_FILE_PARAMS = Type.Object({
  path: Type.String({
    description:
      "Path to an existing file to attach. Prefer a path relative to the project root. Absolute paths are allowed only if they stay within the project root.",
  }),
  message: Type.Optional(
    Type.String({
      description: "Optional short Discord message to send together with the attachment.",
    }),
  ),
  filename: Type.Optional(
    Type.String({
      description: "Optional filename to show in Discord. Defaults to the file's basename.",
    }),
  ),
});

type DiscordAttachFileParams = Static<typeof DISCORD_ATTACH_FILE_PARAMS>;

function createDiscordAttachFileTool(
  sendAttachment: (
    request: ProjectFileAttachmentRequest,
  ) => Promise<{ displayPath: string; filename: string }>,
): ToolDefinition {
  return {
    name: "discord_attach_file",
    label: "Discord Attach File",
    description:
      "Attach an existing local project file to the current Discord conversation. Use this only when the user explicitly asks for a file attachment.",
    promptSnippet:
      "Attach an existing local project file to the current Discord conversation when the user explicitly asks for it.",
    promptGuidelines: [
      "Use discord_attach_file only when the user explicitly asks you to attach or send a local file in Discord.",
      "Do not use discord_attach_file automatically for long responses.",
      "Only attach files that already exist inside the current project root.",
    ],
    parameters: DISCORD_ATTACH_FILE_PARAMS,
    async execute(_toolCallId, rawParams) {
      const params = rawParams as DiscordAttachFileParams;
      const request: ProjectFileAttachmentRequest = {
        path: params.path,
      };
      if (params.message) {
        request.message = params.message;
      }
      if (params.filename) {
        request.filename = params.filename;
      }

      const result = await sendAttachment(request);

      return {
        content: [
          {
            type: "text",
            text: `Attached ${result.displayPath} to Discord as ${result.filename}.`,
          },
        ],
        details: result,
      };
    },
  };
}

const RENDER_SCHEDULE_PARAMS = Type.Object({
  response: Type.Any({
    description:
      "Normalized schedule response data. Pass the parsed JSON object from a schedule script, or a JSON string containing that object.",
  }),
  mode: Type.Optional(
    Type.Union([Type.Literal("compact"), Type.Literal("detailed"), Type.Literal("availability")], {
      description: "Optional display mode override.",
    }),
  ),
  showLinks: Type.Optional(Type.Boolean({ description: "Whether to include footer links." })),
  showSourceHeadings: Type.Optional(
    Type.Boolean({ description: "Whether to force source headings on or off." }),
  ),
  showBlocked: Type.Optional(
    Type.Boolean({ description: "Whether blocked items should appear in the main list." }),
  ),
  collapseBlockedIntoNotes: Type.Optional(
    Type.Boolean({ description: "Whether blocked items should be collapsed into notes." }),
  ),
  maxItems: Type.Optional(
    Type.Integer({ minimum: 1, description: "Optional cap on rendered primary items." }),
  ),
  now: Type.Optional(
    Type.String({
      description: "Optional ISO timestamp to use as the reference point for Today/Tomorrow labels.",
    }),
  ),
});

const SCHEDULE_RENDER_MODES = new Set<ScheduleRenderMode>(["compact", "detailed", "availability"]);
const SCHEDULE_STATUSES = new Set<ScheduleStatus>([
  "normal",
  "limited",
  "blocked",
  "cancelled",
  "postponed",
]);

type RenderScheduleParams = Static<typeof RENDER_SCHEDULE_PARAMS>;

function createRenderScheduleTool(): ToolDefinition {
  return {
    name: "render_schedule",
    label: "Render Schedule",
    description:
      "Render normalized schedule JSON into the shared Discord-friendly schedule display format.",
    promptSnippet:
      "Render normalized schedule JSON into the shared Discord schedule display format.",
    promptGuidelines: [
      "Use render_schedule for schedule-like results after you have normalized data from a script or feed.",
      "Prefer schedule scripts' JSON modes when available, then pass that normalized data to render_schedule.",
      "Use compact mode by default, detailed mode only when the user asks for full detail, and availability mode for facility/open-swim schedules.",
      "Do not use render_schedule for non-schedule content.",
    ],
    parameters: RENDER_SCHEDULE_PARAMS,
    async execute(_toolCallId, rawParams) {
      const params = rawParams as RenderScheduleParams;
      const response = normalizeScheduleResponseInput(params.response);
      const options = normalizeRenderScheduleOptions(params);
      const rendered = renderSchedule(response, options);

      return {
        content: [
          {
            type: "text",
            text: rendered,
          },
        ],
        details: {
          title: response.title,
          itemCount: response.items.length,
          mode: options.mode ?? response.mode ?? "compact",
        },
      };
    },
  };
}

function normalizeRenderScheduleOptions(params: RenderScheduleParams): RenderScheduleOptions {
  const options: RenderScheduleOptions = {};
  if (params.mode) {
    options.mode = params.mode;
  }
  if (params.showLinks !== undefined) {
    options.showLinks = params.showLinks;
  }
  if (params.showSourceHeadings !== undefined) {
    options.showSourceHeadings = params.showSourceHeadings;
  }
  if (params.showBlocked !== undefined) {
    options.showBlocked = params.showBlocked;
  }
  if (params.collapseBlockedIntoNotes !== undefined) {
    options.collapseBlockedIntoNotes = params.collapseBlockedIntoNotes;
  }
  if (params.maxItems !== undefined) {
    options.maxItems = Math.max(1, Math.floor(params.maxItems));
  }
  if (params.now) {
    const parsed = new Date(params.now);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error("render_schedule now must be a valid ISO date/time string.");
    }
    options.now = parsed;
  }
  return options;
}

function normalizeScheduleResponseInput(value: unknown): ScheduleResponse {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch (error) {
      throw new Error(
        `render_schedule received invalid JSON string: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (!isRecord(raw)) {
    throw new Error("render_schedule response must be an object or a JSON string containing one.");
  }

  const title = expectNonEmptyString(raw.title, "response.title");
  const itemsRaw = raw.items;
  if (!Array.isArray(itemsRaw)) {
    throw new Error("render_schedule response.items must be an array.");
  }

  const response: ScheduleResponse = {
    title,
    items: itemsRaw.map((item, index) => normalizeScheduleItemInput(item, `response.items[${index}]`)),
  };

  if (isScheduleRenderMode(raw.mode)) {
    response.mode = raw.mode;
  }
  if (typeof raw.timezone === "string" && raw.timezone.trim()) {
    response.timezone = raw.timezone.trim();
  }
  if (Array.isArray(raw.notes)) {
    response.notes = raw.notes.filter((note): note is string => typeof note === "string" && note.trim().length > 0);
  }
  if (Array.isArray(raw.links)) {
    response.links = raw.links
      .filter(isRecord)
      .map((link, index) => ({
        label: expectNonEmptyString(link.label, `response.links[${index}].label`),
        url: expectNonEmptyString(link.url, `response.links[${index}].url`),
      }));
  }
  if (isRecord(raw.metadata)) {
    response.metadata = raw.metadata;
  }

  return response;
}

function normalizeScheduleItemInput(value: unknown, label: string): ScheduleItem {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }

  const status = expectScheduleStatus(value.status, `${label}.status`);
  const item: ScheduleItem = {
    source: expectNonEmptyString(value.source, `${label}.source`),
    category: expectNonEmptyString(value.category, `${label}.category`),
    title: expectNonEmptyString(value.title, `${label}.title`),
    status,
  };

  assignOptionalString(item, "id", value.id);
  assignOptionalString(item, "start", value.start);
  assignOptionalString(item, "end", value.end);
  assignOptionalString(item, "dateLabel", value.dateLabel);
  assignOptionalString(item, "timeLabel", value.timeLabel);
  assignOptionalString(item, "location", value.location);
  assignOptionalString(item, "area", value.area);
  assignOptionalString(item, "opponent", value.opponent);
  assignOptionalString(item, "note", value.note);
  assignOptionalString(item, "description", value.description);
  assignOptionalString(item, "url", value.url);

  if (value.homeAway === "home" || value.homeAway === "away") {
    item.homeAway = value.homeAway;
  }
  if (typeof value.allDay === "boolean") {
    item.allDay = value.allDay;
  }
  if (Array.isArray(value.tags)) {
    const tags = value.tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0);
    if (tags.length > 0) {
      item.tags = tags;
    }
  }

  return item;
}

function assignOptionalString<T extends object, K extends keyof T>(target: T, key: K, value: unknown): void {
  if (typeof value === "string" && value.trim()) {
    target[key] = value.trim() as T[K];
  }
}

function expectNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function expectScheduleStatus(value: unknown, label: string): ScheduleStatus {
  if (typeof value !== "string" || !SCHEDULE_STATUSES.has(value as ScheduleStatus)) {
    throw new Error(`${label} must be one of: ${Array.from(SCHEDULE_STATUSES).join(", ")}.`);
  }
  return value as ScheduleStatus;
}

function isScheduleRenderMode(value: unknown): value is ScheduleRenderMode {
  return typeof value === "string" && SCHEDULE_RENDER_MODES.has(value as ScheduleRenderMode);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const createRenderScheduleToolForTests = createRenderScheduleTool;

export async function sendProjectFileAttachment(
  projectRoot: string,
  request: ProjectFileAttachmentRequest,
  sink: ResponseSink,
): Promise<{ displayPath: string; filename: string }> {
  const resolved = await resolveProjectFileAttachment(projectRoot, request.path, request.filename);
  const attachment: FileAttachment = {
    path: resolved.absolutePath,
    filename: resolved.filename,
  };
  if (request.message) {
    attachment.content = request.message;
  }

  await sink.sendFileAttachment(attachment);

  return {
    displayPath: resolved.displayPath,
    filename: resolved.filename,
  };
}

async function resolveProjectFileAttachment(
  projectRoot: string,
  inputPath: string,
  requestedFilename?: string,
): Promise<{ absolutePath: string; displayPath: string; filename: string }> {
  const normalizedInput = inputPath.trim().replace(/^@/, "");
  if (!normalizedInput) {
    throw new Error("Attachment path cannot be empty.");
  }

  const absolutePath = path.isAbsolute(normalizedInput)
    ? path.resolve(normalizedInput)
    : path.resolve(projectRoot, normalizedInput);

  const relativePath = path.relative(projectRoot, absolutePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Only files inside the current project can be attached.");
  }

  const stat = await fs.stat(absolutePath).catch((error) => {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new Error(`File not found: ${formatProjectRelativePath(relativePath)}`);
    }
    throw error;
  });

  if (!stat.isFile()) {
    throw new Error(`Not a file: ${formatProjectRelativePath(relativePath)}`);
  }

  const filename = requestedFilename?.trim() || path.basename(absolutePath);
  if (!filename) {
    throw new Error("Attachment filename cannot be empty.");
  }

  return {
    absolutePath,
    displayPath: formatProjectRelativePath(relativePath),
    filename,
  };
}

function formatProjectRelativePath(relativePath: string): string {
  const normalized = relativePath.split(path.sep).join("/");
  return normalized.startsWith(".") ? normalized : `./${normalized}`;
}

const TOOL_DETAIL_MAX_LENGTH = 120;

function formatToolStartLine(toolName: string, args: Record<string, unknown> | undefined): string {
  let detail = "";

  switch (toolName) {
    case "bash":
      detail = truncateToolDetail(simplifyBashCommand(String(args?.command ?? "")));
      break;
    case "read":
    case "edit":
    case "write":
    case "discord_attach_file":
      detail = simplifyPaths(String(args?.path ?? ""));
      break;
    case "render_schedule":
      detail = truncateToolDetail(extractRenderScheduleDetail(args));
      break;
    default:
      break;
  }

  return detail ? `⚙️ ${toolName}: ${detail}` : `⚙️ ${toolName}`;
}

function simplifyBashCommand(cmd: string): string {
  // Strip "cd /some/path && " prefixes — just noise in display.
  let simplified = cmd.replace(/^cd\s+\S+\s*&&\s*/, "");
  // Strip trailing redirections (e.g. "2>/dev/null", "2>&1", "> /dev/null").
  simplified = simplified.replace(/\s+\d*>\s*\S+(\s+\d*>\s*\S+)*\s*$/, "");
  return simplified;
}

const PROJECT_ROOT = process.cwd();
const HOME_DIR = process.env.HOME ?? "";

function simplifyPaths(text: string): string {
  // Replace project root first (more specific), then home dir.
  let result = text;
  if (PROJECT_ROOT) {
    result = result.replaceAll(PROJECT_ROOT, ".");
  }
  if (HOME_DIR) {
    result = result.replaceAll(HOME_DIR, "~");
  }
  return result;
}

function extractRenderScheduleDetail(args: Record<string, unknown> | undefined): string {
  const response = args?.response;
  if (typeof response === "string") {
    try {
      const parsed = JSON.parse(response) as unknown;
      if (isRecord(parsed) && typeof parsed.title === "string" && parsed.title.trim()) {
        return parsed.title.trim();
      }
    } catch {
      return "json";
    }
  }
  if (isRecord(response) && typeof response.title === "string" && response.title.trim()) {
    return response.title.trim();
  }
  return "";
}

function truncateToolDetail(text: string): string {
  // Collapse to single line, simplify paths for display.
  const oneLine = simplifyPaths(text.replace(/\n/g, " ").trim());
  if (oneLine.length <= TOOL_DETAIL_MAX_LENGTH) return oneLine;
  return oneLine.slice(0, TOOL_DETAIL_MAX_LENGTH - 3) + "...";
}

export type { AgentSession };
