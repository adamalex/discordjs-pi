#!/usr/bin/env tsx
import path from "node:path";
import { countIssues, formatSkillLintReport, lintSkills } from "../src/skill-lint.js";

const args = process.argv.slice(2);
const jsonOutput = args.includes("--json");
const inputPaths = args.filter((arg) => arg !== "--json");
const results = lintSkills(inputPaths);
const totalIssues = countIssues(results);

if (jsonOutput) {
  console.log(
    JSON.stringify(
      {
        scanned: results.map((result) => path.relative(process.cwd(), result.skillDir) || "."),
        totalIssues,
        results,
      },
      null,
      2,
    ),
  );
} else {
  console.log(formatSkillLintReport(results));
}

process.exitCode = totalIssues === 0 ? 0 : 1;
