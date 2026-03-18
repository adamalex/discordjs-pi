import { Client, Events, GatewayIntentBits, Partials, type Message } from "discord.js";
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
    });

    this.client.on(Events.MessageCreate, (message) => {
      void this.handleMessage(message);
    });

    await this.client.login(this.config.discordToken);
  }

  async shutdown(): Promise<void> {
    await this.registry.shutdown();
    await this.client.destroy();
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
