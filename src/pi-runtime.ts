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
    customTools: [discordAttachFileTool],
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

function truncateToolDetail(text: string): string {
  // Collapse to single line, simplify paths for display.
  const oneLine = simplifyPaths(text.replace(/\n/g, " ").trim());
  if (oneLine.length <= TOOL_DETAIL_MAX_LENGTH) return oneLine;
  return oneLine.slice(0, TOOL_DETAIL_MAX_LENGTH - 3) + "...";
}

export type { AgentSession };
