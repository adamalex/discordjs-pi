// Provenance
//   Upstream: https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/sdk/11-sessions.ts
//   Version:  0.58.4 (pinned in this repo's package.json)
//   Retrieved: 2026-03-17
//   Reason:   Session management — in-memory, persistent, continue, list, open

/**
 * Session Management
 *
 * Control session persistence: in-memory, new file, continue, or open specific.
 */

import { createAgentSession, SessionManager } from "@mariozechner/pi-coding-agent";

// In-memory (no persistence)
const { session: inMemory } = await createAgentSession({
	sessionManager: SessionManager.inMemory(),
});
console.log("In-memory session:", inMemory.sessionFile ?? "(none)");

// New persistent session
const { session: newSession } = await createAgentSession({
	sessionManager: SessionManager.create(process.cwd()),
});
console.log("New session file:", newSession.sessionFile);

// Continue most recent session (or create new if none)
const { session: continued, modelFallbackMessage } = await createAgentSession({
	sessionManager: SessionManager.continueRecent(process.cwd()),
});
if (modelFallbackMessage) console.log("Note:", modelFallbackMessage);
console.log("Continued session:", continued.sessionFile);

// List and open specific session
const sessions = await SessionManager.list(process.cwd());
console.log(`\nFound ${sessions.length} sessions:`);
for (const info of sessions.slice(0, 3)) {
	console.log(`  ${info.id.slice(0, 8)}... - "${info.firstMessage.slice(0, 30)}..."`);
}

if (sessions.length > 0) {
	const { session: opened } = await createAgentSession({
		sessionManager: SessionManager.open(sessions[0].path),
	});
	console.log(`\nOpened: ${opened.sessionId}`);
}

// Custom session directory (no cwd encoding)
// const customDir = "/path/to/my-sessions";
// const { session } = await createAgentSession({
//   sessionManager: SessionManager.create(process.cwd(), customDir),
// });
// SessionManager.list(process.cwd(), customDir);
// SessionManager.continueRecent(process.cwd(), customDir);
