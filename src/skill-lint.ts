import fs from "node:fs";
import path from "node:path";

export type SkillLintSeverity = "error" | "warning";

export interface SkillLintIssue {
  severity: SkillLintSeverity;
  code: string;
  file: string;
  message: string;
}

export interface SkillLintResult {
  skillDir: string;
  metadata: {
    hasSkillMd: boolean;
    hasSourcesMd: boolean;
    hasReferenceDir: boolean;
    frontmatter: Record<string, string> | null;
  };
  issues: SkillLintIssue[];
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n/;
const LOCAL_MARKDOWN_LINK_RE = /\[[^\]]+\]\(([^)]+)\)/g;
const CODE_REF_RE = /`([^`\n]+)`/g;
const REFERENCE_PREFIXES = ["reference/", "references/", "scripts/", "assets/"];
const STALE_PATTERNS = [
  {
    text: "docs/pi/",
    message: "stale reference to old docs/pi packaging layout",
  },
  {
    text: "PROVISIONAL",
    message: "stale provisional marker",
  },
  {
    text: "no pinned dependency in this repo yet",
    message: "stale dependency-pin language",
  },
  {
    text: "this repository currently has no `package.json`, lockfile, or Discord integration code",
    message: "stale repository-context statement",
  },
] as const;

export function lintSkill(skillDir: string): SkillLintResult {
  const resolvedSkillDir = path.resolve(skillDir);
  const issues: SkillLintIssue[] = [];
  const skillMdPath = path.join(resolvedSkillDir, "SKILL.md");
  const sourcesMdPath = path.join(resolvedSkillDir, "sources.md");
  const referenceDirPath = path.join(resolvedSkillDir, "reference");

  const hasSkillMd = fs.existsSync(skillMdPath);
  const hasSourcesMd = fs.existsSync(sourcesMdPath);
  const hasReferenceDir = fs.existsSync(referenceDirPath);

  let frontmatter: Record<string, string> | null = null;

  if (!hasSkillMd) {
    issues.push({
      severity: "error",
      code: "missing-skill-md",
      file: relativeToSkill(resolvedSkillDir, skillMdPath),
      message: "missing required SKILL.md",
    });
  } else {
    const skillText = fs.readFileSync(skillMdPath, "utf8");
    frontmatter = parseFrontmatter(skillText);

    if (!frontmatter) {
      issues.push({
        severity: "error",
        code: "missing-frontmatter",
        file: "SKILL.md",
        message: "missing YAML frontmatter",
      });
    } else {
      if (!frontmatter.name) {
        issues.push({
          severity: "error",
          code: "missing-name",
          file: "SKILL.md",
          message: "frontmatter is missing required `name`",
        });
      }

      if (!frontmatter.description) {
        issues.push({
          severity: "error",
          code: "missing-description",
          file: "SKILL.md",
          message: "frontmatter is missing required `description`",
        });
      }

      if (!frontmatter.license) {
        issues.push({
          severity: "warning",
          code: "missing-license",
          file: "SKILL.md",
          message: "frontmatter is missing `license`",
        });
      }

      const dirName = path.basename(resolvedSkillDir);
      if (frontmatter.name && frontmatter.name !== dirName) {
        issues.push({
          severity: "warning",
          code: "name-directory-mismatch",
          file: "SKILL.md",
          message: `frontmatter name \`${frontmatter.name}\` does not match directory name \`${dirName}\``,
        });
      }
    }

    issues.push(...lintCodeReferences(resolvedSkillDir, "SKILL.md", skillText));
    issues.push(...lintStalePatterns("SKILL.md", skillText));
  }

  if (hasSourcesMd) {
    const sourcesText = fs.readFileSync(sourcesMdPath, "utf8");
    issues.push(...lintCodeReferences(resolvedSkillDir, "sources.md", sourcesText));
    issues.push(...lintStalePatterns("sources.md", sourcesText));
  }

  for (const filePath of collectSkillFiles(resolvedSkillDir)) {
    const relativePath = relativeToSkill(resolvedSkillDir, filePath);
    const text = fs.readFileSync(filePath, "utf8");
    issues.push(...lintLocalMarkdownLinks(resolvedSkillDir, relativePath, text));

    if (relativePath !== "SKILL.md" && relativePath !== "sources.md") {
      issues.push(...lintStalePatterns(relativePath, text));
    }
  }

  return {
    skillDir: resolvedSkillDir,
    metadata: {
      hasSkillMd,
      hasSourcesMd,
      hasReferenceDir,
      frontmatter,
    },
    issues,
  };
}

export function discoverSkillDirs(inputPaths: string[]): string[] {
  const discovered = new Set<string>();
  const roots = inputPaths.length > 0 ? inputPaths : [path.join(process.cwd(), ".agents", "skills")];

  for (const inputPath of roots) {
    const resolved = path.resolve(inputPath);
    if (!fs.existsSync(resolved)) {
      continue;
    }

    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      continue;
    }

    if (fs.existsSync(path.join(resolved, "SKILL.md"))) {
      discovered.add(resolved);
      continue;
    }

    for (const entry of fs.readdirSync(resolved, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      const skillDir = path.join(resolved, entry.name);
      if (fs.existsSync(path.join(skillDir, "SKILL.md"))) {
        discovered.add(skillDir);
      }
    }
  }

  return [...discovered].sort();
}

export function lintSkills(inputPaths: string[]): SkillLintResult[] {
  return discoverSkillDirs(inputPaths).map((skillDir) => lintSkill(skillDir));
}

export function formatSkillLintReport(results: SkillLintResult[]): string {
  if (results.length === 0) {
    return "No skills found.";
  }

  const lines = ["Skill packaging lint report", ""];
  let totalIssues = 0;

  for (const result of results) {
    const skillName = path.basename(result.skillDir);
    lines.push(`- ${skillName}: ${result.issues.length === 0 ? "OK" : `${result.issues.length} issue(s)`}`);
    for (const issue of result.issues) {
      lines.push(`  - [${issue.severity}] ${issue.file} ${issue.code}: ${issue.message}`);
      totalIssues += 1;
    }
  }

  lines.push("");
  lines.push(`Total issues: ${totalIssues}`);
  return lines.join("\n");
}

export function countIssues(results: SkillLintResult[]): number {
  return results.reduce((total, result) => total + result.issues.length, 0);
}

function parseFrontmatter(text: string): Record<string, string> | null {
  const match = FRONTMATTER_RE.exec(text);
  if (!match) {
    return null;
  }

  const frontmatterText = match[1];
  if (frontmatterText === undefined) {
    return null;
  }

  const parsed: Record<string, string> = {};
  for (const line of frontmatterText.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 0) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!key) {
      continue;
    }
    parsed[key] = value;
  }

  return parsed;
}

function lintCodeReferences(skillDir: string, file: string, text: string): SkillLintIssue[] {
  const issues: SkillLintIssue[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(CODE_REF_RE)) {
    const raw = match[1]?.trim();
    if (!raw || seen.has(raw) || !looksLikePackagedPath(skillDir, raw)) {
      continue;
    }
    seen.add(raw);

    if (referenceExists(skillDir, raw)) {
      continue;
    }

    issues.push({
      severity: "error",
      code: "missing-code-reference",
      file,
      message: `referenced packaged path \`${raw}\` does not exist`,
    });
  }

  return issues;
}

function lintLocalMarkdownLinks(skillDir: string, file: string, text: string): SkillLintIssue[] {
  const issues: SkillLintIssue[] = [];

  for (const match of text.matchAll(LOCAL_MARKDOWN_LINK_RE)) {
    const target = match[1]?.trim();
    if (!target || !isLocalMarkdownLink(target)) {
      continue;
    }

    const resolved = path.resolve(path.join(skillDir, path.dirname(file), target));
    if (fs.existsSync(resolved)) {
      continue;
    }

    issues.push({
      severity: "error",
      code: "broken-local-link",
      file,
      message: `local markdown link target \`${target}\` does not exist`,
    });
  }

  return issues;
}

function lintStalePatterns(file: string, text: string): SkillLintIssue[] {
  const issues: SkillLintIssue[] = [];

  for (const pattern of STALE_PATTERNS) {
    if (!text.includes(pattern.text)) {
      continue;
    }

    issues.push({
      severity: "warning",
      code: "stale-marker",
      file,
      message: pattern.message,
    });
  }

  return issues;
}

function collectSkillFiles(skillDir: string): string[] {
  const files: string[] = [];
  walk(skillDir, files);
  return files.sort();
}

function walk(dirPath: string, files: string[]): void {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name === ".DS_Store") {
      continue;
    }

    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }

    if (entry.isFile() && [".md", ".ts", ".js", ".json"].includes(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
}

function looksLikePackagedPath(skillDir: string, value: string): boolean {
  if (value.includes("...")) {
    return false;
  }

  if (value === "sources.md") {
    return fs.existsSync(path.join(skillDir, value));
  }

  const matchingPrefix = REFERENCE_PREFIXES.find((prefix) => value.startsWith(prefix));
  if (!matchingPrefix) {
    return false;
  }

  const topLevelEntry = matchingPrefix.slice(0, -1);
  return fs.existsSync(path.join(skillDir, topLevelEntry));
}

function referenceExists(skillDir: string, referencePath: string): boolean {
  if (!referencePath.includes("*")) {
    return fs.existsSync(path.join(skillDir, referencePath));
  }

  const regex = globToRegExp(referencePath);
  for (const filePath of collectSkillFiles(skillDir)) {
    const relativePath = relativeToSkill(skillDir, filePath);
    if (regex.test(relativePath)) {
      return true;
    }
  }

  return false;
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function isLocalMarkdownLink(target: string): boolean {
  return !target.includes("://") && !target.startsWith("#") && !target.startsWith("mailto:");
}

function relativeToSkill(skillDir: string, filePath: string): string {
  return path.relative(skillDir, filePath).replaceAll(path.sep, "/");
}
