# Provenance
- Upstream title or source name: official `Buttons` guide page
- Upstream URL: https://discordjs.guide/interactive-components/buttons
- Retrieval date: 2026-03-17
- Upstream commit/tag/release: current guide page; no page-level tag exposed
- Reason this file was included: button-based confirmation flows are common, and the builder shape is easy to get subtly wrong from memory

This file preserves short official example excerpts.

# Building Buttons

```js
const { ButtonBuilder, ButtonStyle, SlashCommandBuilder } = require('discord.js');

module.exports = {
  async execute(interaction) {
    const target = interaction.options.getUser('target');
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    const confirm = new ButtonBuilder()
      .setCustomId('confirm')
      .setLabel('Confirm Ban')
      .setStyle(ButtonStyle.Danger);

    const cancel = new ButtonBuilder()
      .setCustomId('cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary);
  },
};
```

# Sending Buttons In An Action Row

```js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } = require('discord.js');

module.exports = {
  async execute(interaction) {
    const target = interaction.options.getUser('target');
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    const confirm = new ButtonBuilder().setCustomId('confirm').setLabel('Confirm Ban').setStyle(ButtonStyle.Danger);
    const cancel = new ButtonBuilder().setCustomId('cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(cancel, confirm);

    await interaction.reply({
      content: `Are you sure you want to ban ${target} for reason: ${reason}?`,
      components: [row],
    });
  },
};
```

# Link Button Reminder

```js
const button = new ButtonBuilder()
  .setLabel('discord.js docs')
  .setURL('https://discord.js.org')
  .setStyle(ButtonStyle.Link);
```
