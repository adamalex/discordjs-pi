// Provenance
//   Upstream: https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/sdk/05-tools.ts
//   Version:  0.58.4 (provisional — no pinned dependency in this repo yet)
//   Retrieved: 2026-03-17
//   Reason:   Built-in tool sets, individual tools, tool factories for custom cwd

/**
 * Tools Configuration
 *
 * Use built-in tool sets or individual tools.
 *
 * IMPORTANT: When using a custom `cwd`, you must use the tool factory functions
 * (createCodingTools, createReadOnlyTools, createReadTool, etc.) to ensure
 * tools resolve paths relative to your cwd, not process.cwd().
 *
 * For custom tools, see 06-extensions.ts - custom tools are now registered
 * via the extensions system using pi.registerTool().
 */

import {
	bashTool,
	createAgentSession,
	createBashTool,
	createCodingTools,
	createGrepTool,
	createReadTool,
	grepTool,
	readOnlyTools,
	readTool,
	SessionManager,
} from "@mariozechner/pi-coding-agent";

// Read-only mode (no edit/write) - uses process.cwd()
await createAgentSession({
	tools: readOnlyTools,
	sessionManager: SessionManager.inMemory(),
});
console.log("Read-only session created");

// Custom tool selection - uses process.cwd()
await createAgentSession({
	tools: [readTool, bashTool, grepTool],
	sessionManager: SessionManager.inMemory(),
});
console.log("Custom tools session created");

// With custom cwd - MUST use factory functions!
const customCwd = "/path/to/project";
await createAgentSession({
	cwd: customCwd,
	tools: createCodingTools(customCwd), // Tools resolve paths relative to customCwd
	sessionManager: SessionManager.inMemory(),
});
console.log("Custom cwd session created");

// Or pick specific tools for custom cwd
await createAgentSession({
	cwd: customCwd,
	tools: [createReadTool(customCwd), createBashTool(customCwd), createGrepTool(customCwd)],
	sessionManager: SessionManager.inMemory(),
});
console.log("Specific tools with custom cwd session created");
