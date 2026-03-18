// Provenance
//   Upstream: https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/sdk/01-minimal.ts
//   Version:  0.58.4 (provisional — no pinned dependency in this repo yet)
//   Retrieved: 2026-03-17
//   Reason:   Minimal SDK quick-start — shows createAgentSession() defaults, event subscription, prompt()

/**
 * Minimal SDK Usage
 *
 * Uses all defaults: discovers skills, extensions, tools, context files
 * from cwd and ~/.pi/agent. Model chosen from settings or first available.
 */

import { createAgentSession } from "@mariozechner/pi-coding-agent";

const { session } = await createAgentSession();

session.subscribe((event) => {
	if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
		process.stdout.write(event.assistantMessageEvent.delta);
	}
});

await session.prompt("What files are in the current directory?");
session.state.messages.forEach((msg) => {
	console.log(msg);
});
console.log();
