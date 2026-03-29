import fs from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();

const ignoredDirs = new Set([
  ".git",
  ".idea",
  ".next",
  ".vscode-test",
  "build",
  "coverage",
  "dist",
  "logs",
  "node_modules",
  "out",
  "target"
]);

const textExtensions = new Set([
  ".css",
  ".csv",
  ".env",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".less",
  ".md",
  ".mjs",
  ".scss",
  ".sql",
  ".svg",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml"
]);

const extraTextFiles = new Set([
  ".editorconfig",
  ".gitattributes",
  ".impeccable.md"
]);

function detectBom(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return "utf8";
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return "utf16le";
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return "utf16be";
  }
  return "none";
}

function isTextCandidate(filePath) {
  const baseName = path.basename(filePath);
  const ext = path.extname(baseName).toLowerCase();
  if (textExtensions.has(ext)) {
    return true;
  }
  return extraTextFiles.has(baseName);
}

function isLikelyBinary(bytes) {
  if (bytes.length === 0) {
    return false;
  }
  const sample = bytes.subarray(0, Math.min(bytes.length, 4096));
  let controls = 0;
  for (const value of sample) {
    if (value === 0) {
      return true;
    }
    if ((value > 0 && value < 9) || (value > 13 && value < 32)) {
      controls += 1;
    }
  }
  return controls / sample.length > 0.15;
}

async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) {
        continue;
      }
      yield* walk(fullPath);
      continue;
    }
    if (entry.isFile()) {
      yield fullPath;
    }
  }
}

function relative(filePath) {
  return path.relative(rootDir, filePath).replaceAll("\\", "/");
}

async function main() {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const issues = [];
  let checked = 0;

  for await (const filePath of walk(rootDir)) {
    if (!isTextCandidate(filePath)) {
      continue;
    }

    const bytes = await fs.readFile(filePath);
    if (isLikelyBinary(bytes)) {
      continue;
    }

    checked += 1;
    const bom = detectBom(bytes);

    if (bom === "utf16le" || bom === "utf16be") {
      issues.push({
        file: relative(filePath),
        reason: `detected ${bom}; expected utf-8`
      });
      continue;
    }

    const payload = bom === "utf8" ? bytes.subarray(3) : bytes;

    try {
      const text = decoder.decode(payload);
      if (text.includes("\ufffd")) {
        issues.push({
          file: relative(filePath),
          reason: "contains U+FFFD replacement character"
        });
      }
    } catch {
      issues.push({
        file: relative(filePath),
        reason: "invalid utf-8 sequence"
      });
      continue;
    }

    if (bom === "utf8") {
      issues.push({
        file: relative(filePath),
        reason: "contains UTF-8 BOM; project standard is UTF-8 without BOM"
      });
    }
  }

  if (issues.length > 0) {
    console.error(`Encoding check failed. Checked ${checked} text files.`);
    for (const issue of issues) {
      console.error(`- ${issue.file}: ${issue.reason}`);
    }
    process.exit(1);
  }

  console.log(`Encoding check passed. Checked ${checked} text files.`);
}

main().catch((error) => {
  console.error("Unexpected error during encoding check.");
  console.error(error);
  process.exit(1);
});
