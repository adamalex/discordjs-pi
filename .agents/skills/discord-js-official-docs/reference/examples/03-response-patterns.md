# Provenance
- Upstream title or source name: official `Command response methods` guide page
- Upstream URL: https://discordjs.guide/slash-commands/response-methods.html
- Retrieval date: 2026-03-17
- Upstream commit/tag/release: current guide page; no page-level tag exposed
- Reason this file was included: reply timing and response state are frequent sources of Discord bot bugs

This file preserves short official example excerpts.

# Basic Reply

```js
module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with Pong!'),
  async execute(interaction) {
    await interaction.reply('Pong!');
  },
};
```

# Ephemeral Reply

```js
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    await interaction.reply({ content: 'Secret Pong!', flags: MessageFlags.Ephemeral });
  }
});
```

# Deferred Reply

```js
const wait = require('node:timers/promises').setTimeout;

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    await interaction.deferReply();
    await wait(4_000);
    await interaction.editReply('Pong!');
  }
});
```

Remember the official timing rule:
- initial response or deferral within 3 seconds
- edits and follow-ups within the token lifetime after that

