import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { countIssues, discoverSkillDirs, lintSkill, lintSkills } from "../src/skill-lint.js";

describe("skill linting", () => {
  it("reports broken references, stale markers, and missing frontmatter fields", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "discordjs-pi-skill-lint-"));
    const skillDir = path.join(root, "broken-skill");
    await fs.mkdir(path.join(skillDir, "reference"), { recursive: true });

    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      [
        "---",
        "name: broken-skill",
        "license: MIT",
        "---",
        "",
        "Use `reference/missing.md` and `sources.md`.",
        "",
        "See [missing](./missing.md).",
        "",
        "PROVISIONAL",
      ].join("\n"),
      "utf8",
    );

    await fs.writeFile(
      path.join(skillDir, "sources.md"),
      "Reference: `reference/also-missing.md`\n",
      "utf8",
    );

    const result = lintSkill(skillDir);
    const codes = result.issues.map((issue) => issue.code);

    expect(codes).toContain("missing-description");
    expect(codes).toContain("broken-local-link");
    expect(codes).toContain("missing-code-reference");
    expect(codes).toContain("stale-marker");
  });

  it("discovers skill directories from a skills root and from direct paths", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "discordjs-pi-skill-discover-"));
    const skillsRoot = path.join(root, ".agents", "skills");
    const first = path.join(skillsRoot, "first-skill");
    const second = path.join(skillsRoot, "second-skill");
    await fs.mkdir(first, { recursive: true });
    await fs.mkdir(second, { recursive: true });
    await fs.writeFile(path.join(first, "SKILL.md"), "---\nname: first-skill\ndescription: one\n---\n", "utf8");
    await fs.writeFile(path.join(second, "SKILL.md"), "---\nname: second-skill\ndescription: two\n---\n", "utf8");

    expect(discoverSkillDirs([skillsRoot])).toEqual([first, second].sort());
    expect(discoverSkillDirs([first])).toEqual([first]);
  });

  it("passes on the repository's current local skills", () => {
    const results = lintSkills([path.join(process.cwd(), ".agents", "skills")]);

    expect(results.length).toBeGreaterThanOrEqual(3);
    expect(countIssues(results)).toBe(0);
    expect(results.every((result) => result.issues.length === 0)).toBe(true);
  });
});
