import fs from "node:fs/promises";
import path from "node:path";
import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  type Message,
} from "discord.js";
import type { AppConfig } from "./config.js";
import {
  ConversationRegistry,
  createConversationRuntime,
  createPiEnvironment,
  type EditableMessage,
  type ResponseSink,
} from "./pi-runtime.js";
import {
  deriveConversationKey,
  formatPromptInput,
  isDmMessage,
  parseDmCommand,
} from "./discord-routing.js";
import type { Logger } from "./logger.js";

interface DeployContext {
  conversationKey: string;
  commitMessage: string;
}

class DiscordEditableMessage implements EditableMessage {
  constructor(private readonly message: Message<true>) {}

  async edit(content: string): Promise<void> {
    await this.message.edit({ content });
  }
}

class DiscordResponseSink implements ResponseSink {
  constructor(private readonly message: Message<boolean>) {}

  async sendTyping(): Promise<void> {
    await getSendableChannel(this.message).sendTyping();
  }

  async createResponseMessage(initialContent: string): Promise<EditableMessage> {
    const sent = await getSendableChannel(this.message).send({ content: initialContent });
    return new DiscordEditableMessage(sent);
  }

  async sendMessage(content: string): Promise<void> {
    await getSendableChannel(this.message).send({ content });
  }
}

class ChannelResponseSink implements ResponseSink {
  private readonly channel: SendableChannel;

  constructor(channel: SendableChannel) {
    this.channel = channel;
  }

  async sendTyping(): Promise<void> {
    await this.channel.sendTyping();
  }

  async createResponseMessage(initialContent: string): Promise<EditableMessage> {
    const sent = await this.channel.send({ content: initialContent });
    return new DiscordEditableMessage(sent as Message<true>);
  }

  async sendMessage(content: string): Promise<void> {
    await this.channel.send({ content });
  }
}

/** A channel that supports send() and sendTyping(). Used by ChannelResponseSink for post-deploy resume. */
interface SendableChannel {
  sendTyping(): Promise<void>;
  send(options: { content: string }): Promise<Message>;
}

export class DiscordPiBot {
  private readonly client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
  });

  private readonly startedAt = Date.now();
  private readonly registry: ConversationRegistry;

  private constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
    registry: ConversationRegistry,
  ) {
    this.registry = registry;
  }

  static async create(config: AppConfig, logger: Logger): Promise<DiscordPiBot> {
    const piEnvironment = await createPiEnvironment(config, logger);
    const registry = new ConversationRegistry(
      config.sessionRootDir,
      (conversationKey) => createConversationRuntime(conversationKey, piEnvironment, config, logger),
      logger,
    );

    await registry.initialize();
    return new DiscordPiBot(config, logger, registry);
  }

  async start(): Promise<void> {
    this.client.once(Events.ClientReady, (client) => {
      this.logger.info(`Discord bot connected as ${client.user.tag}`);
      void this.writeHealthFile();
      void this.resumeAfterDeploy();
    });

    this.client.on(Events.MessageCreate, (message) => {
      void this.handleMessage(message);
    });

    await this.client.login(this.config.discordToken);
  }

  async shutdown(): Promise<void> {
    await this.removeHealthFile();
    await this.registry.shutdown();
    await this.client.destroy();
  }

  private get healthFilePath(): string {
    return path.join(this.config.projectRoot, ".data", "healthy");
  }

  private async writeHealthFile(): Promise<void> {
    try {
      const dataDir = path.dirname(this.healthFilePath);
      await fs.mkdir(dataDir, { recursive: true });
      await fs.writeFile(this.healthFilePath, new Date().toISOString(), "utf-8");
      this.logger.info("Health file written — bot is ready.");
    } catch (error) {
      this.logger.warn("Failed to write health file", error);
    }
  }

  private async removeHealthFile(): Promise<void> {
    try {
      await fs.unlink(this.healthFilePath);
    } catch {
      // File may not exist, that's fine
    }
  }

  private get deployContextPath(): string {
    return path.join(this.config.projectRoot, ".data", "deploy-context.json");
  }

  private async resumeAfterDeploy(): Promise<void> {
    let context: DeployContext;

    try {
      const raw = await fs.readFile(this.deployContextPath, "utf-8");
      context = JSON.parse(raw) as DeployContext;
    } catch {
      // No deploy context — normal startup, nothing to do.
      return;
    }

    // Remove the file immediately so we don't re-trigger on a subsequent restart.
    await fs.unlink(this.deployContextPath).catch(() => undefined);

    const channelId = extractChannelId(context.conversationKey);
    if (!channelId) {
      this.logger.warn("Could not extract channel ID from deploy context", {
        conversationKey: context.conversationKey,
      });
      return;
    }

    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        this.logger.warn("Deploy resume channel is not text-based or not found", { channelId });
        return;
      }

      const sink = new ChannelResponseSink(channel as unknown as SendableChannel);
      const prompt = [
        "System notification: You have just been restarted after a successful self-deploy.",
        `Deploy commit message: "${context.commitMessage}"`,
        "Your conversation history with the user is intact from the session file.",
        "Send a brief message to the user letting them know you're back and what you deployed.",
        "Then continue the conversation naturally — if there's anything to follow up on, do so.",
      ].join("\n");

      this.logger.info("Resuming conversation after deploy", {
        conversationKey: context.conversationKey,
        commitMessage: context.commitMessage,
      });

      await this.registry.handlePrompt(context.conversationKey, prompt, sink);
    } catch (error) {
      this.logger.error("Failed to resume conversation after deploy", {
        conversationKey: context.conversationKey,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async handleMessage(message: Message<boolean>): Promise<void> {
    if (message.author.bot || message.webhookId) {
      return;
    }

    const trimmedContent = message.content.trim();

    if (isDmMessage(message)) {
      const command = parseDmCommand(trimmedContent);
      if (command) {
        await this.handleDmCommand(message, command);
        return;
      }
    }

    if (!trimmedContent) {
      await getSendableChannel(message).send({
        content: "This bot is text-only right now. Send plain text messages.",
      });
      return;
    }

    const prompt = formatPromptInput(message);
    const conversationKey = deriveConversationKey(message);
    const sink = new DiscordResponseSink(message);

    try {
      await this.registry.handlePrompt(conversationKey, prompt, sink);
    } catch (error) {
      this.logger.error("Failed to handle Discord message with Pi", {
        conversationKey,
        error: error instanceof Error ? error.message : String(error),
      });

      await getSendableChannel(message)
        .send({
          content: "Pi could not handle that message right now.",
        })
        .catch(() => undefined);
    }
  }

  private async handleDmCommand(message: Message<boolean>, command: "status" | "reset-all"): Promise<void> {
    if (command === "status") {
      const uptimeSeconds = Math.floor((Date.now() - this.startedAt) / 1000);
      const persistedSessions = await this.registry.countPersistedSessionFiles();

      await getSendableChannel(message).send({
        content: [
          "Bot status",
          `Uptime: ${uptimeSeconds}s`,
          `Configured model: ${this.config.botProvider}/${this.config.botModel}`,
          `Active conversation handlers: ${this.registry.getActiveRuntimeCount()}`,
          `Persisted session files: ${persistedSessions}`,
        ].join("\n"),
      });
      return;
    }

    await this.registry.resetAll();
    await getSendableChannel(message).send({
      content: "All Pi conversations and persisted session state were reset.",
    });
  }
}

function getSendableChannel(message: Message<boolean>): {
  sendTyping(): Promise<void>;
  send(payload: { content: string }): Promise<Message<true>>;
} {
  return message.channel as unknown as {
    sendTyping(): Promise<void>;
    send(payload: { content: string }): Promise<Message<true>>;
  };
}

/**
 * Extract the Discord channel ID from a conversation key.
 * Key formats: "dm:<channelId>", "thread:<guildId>:<channelId>", "channel:<guildId>:<channelId>"
 */
function extractChannelId(conversationKey: string): string | null {
  const parts = conversationKey.split(":");
  if (parts.length < 2) return null;
  return parts[parts.length - 1] || null;
}
