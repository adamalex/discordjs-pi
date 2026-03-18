# Provenance
- Upstream title or source name: official `Creating Slash Commands` and `Command handling` guide pages
- Upstream URL: https://discordjs.guide/legacy/app-creation/creating-commands ; https://discordjs.guide/legacy/app-creation/handling-commands
- Retrieval date: 2026-03-17
- Upstream commit/tag/release: current guide pages; no page-level tag exposed
- Reason this file was included: this is the canonical official shape for command modules and `InteractionCreate` handling

This file preserves short official example excerpts.

# Command Module Shape

```js
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Replies with Pong!'),
  async execute(interaction) {
    await interaction.reply('Pong!');
  },
};
```

# Interaction Handler Shape

```js
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = interaction.client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: 'There was an error while executing this command!',
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await interaction.reply({
        content: 'There was an error while executing this command!',
        flags: MessageFlags.Ephemeral,
      });
    }
  }
});
```
