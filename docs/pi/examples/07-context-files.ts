// Provenance
//   Upstream: https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/sdk/07-context-files.ts
//   Version:  0.58.4 (provisional — no pinned dependency in this repo yet)
//   Retrieved: 2026-03-17
//   Reason:   AGENTS.md context file discovery and override from SDK

/**
 * Context Files (AGENTS.md)
 *
 * Context files provide project-specific instructions loaded into the system prompt.
 */

import { createAgentSession, DefaultResourceLoader, SessionManager } from "@mariozechner/pi-coding-agent";

// Disable context files entirely by returning an empty list in agentsFilesOverride.
const loader = new DefaultResourceLoader({
	agentsFilesOverride: (current) => ({
		agentsFiles: [
			...current.agentsFiles,
			{
				path: "/virtual/AGENTS.md",
				content: `# Project Guidelines

## Code Style
- Use TypeScript strict mode
- No any types
- Prefer const over let`,
			},
		],
	}),
});
await loader.reload();

// Discover AGENTS.md files walking up from cwd
const discovered = loader.getAgentsFiles().agentsFiles;
console.log("Discovered context files:");
for (const file of discovered) {
	console.log(`  - ${file.path} (${file.content.length} chars)`);
}

await createAgentSession({
	resourceLoader: loader,
	sessionManager: SessionManager.inMemory(),
});

console.log(`Session created with ${discovered.length + 1} context files`);
