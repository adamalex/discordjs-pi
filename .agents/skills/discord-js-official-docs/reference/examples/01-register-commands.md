# Provenance
- Upstream title or source name: `discord.js (main)` landing page example and official `Registering Commands` guide page
- Upstream URL: https://discord.js.org/docs/packages/discord.js/main ; https://discordjs.guide/legacy/app-creation/deploying-commands
- Retrieval date: 2026-03-17
- Upstream commit/tag/release: latest visible `discord.js` release `14.25.1` (`fdac8c5`); guide page has no page-level tag exposed
- Reason this file was included: command deployment is one of the first practical tasks future agents will need when wiring a bot in this repository

This file preserves short official example excerpts.

# Global Registration Shape

From the official docs landing page:

```js
import { REST, Routes } from 'discord.js';

const commands = [
  {
    name: 'ping',
    description: 'Replies with Pong!',
  },
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

try {
  console.log('Started refreshing application (/) commands.');

  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });

  console.log('Successfully reloaded application (/) commands.');
} catch (error) {
  console.error(error);
}
```

# Guild Deployment Variant

From the official guide:

```js
const { REST, Routes } = require('discord.js');
const { clientId, guildId, token } = require('./config.json');

const rest = new REST().setToken(token);

await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
  body: commands,
});
```

Use guild deployment while iterating, then switch to global deployment when command definitions are stable.

