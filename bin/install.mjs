#!/usr/bin/env node

import { cpSync, rmSync, existsSync, readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_SRC = resolve(__dirname, "..", "skills", "vibe-review");
const SKILL_NAME = "vibe-review";

function usage() {
  const pkg = JSON.parse(
    readFileSync(resolve(__dirname, "..", "package.json"), "utf8")
  );
  console.log(`${pkg.name} v${pkg.version}\n`);
  console.log("Usage: npx @tsukiyokai/vibe-review [options]\n");
  console.log("Options:");
  console.log("  -g, --global    Install to ~/.claude/skills/ (default: ./.claude/skills/)");
  console.log("  -r, --remove    Remove installed skill");
  console.log("  -h, --help      Show this help");
  process.exit(0);
}

function parseArgs(argv) {
  const flags = { global: false, remove: false };
  for (const arg of argv.slice(2)) {
    if (arg === "-g" || arg === "--global") flags.global = true;
    else if (arg === "-r" || arg === "--remove") flags.remove = true;
    else if (arg === "-h" || arg === "--help") usage();
    else {
      console.error(`Unknown option: ${arg}`);
      usage();
    }
  }
  return flags;
}

function getTarget(global) {
  const base = global
    ? join(homedir(), ".claude", "skills")
    : join(process.cwd(), ".claude", "skills");
  return join(base, SKILL_NAME);
}

function install(target) {
  if (existsSync(target)) {
    rmSync(target, { recursive: true });
    console.log(`Removed existing: ${target}`);
  }
  cpSync(SKILL_SRC, target, { recursive: true });
  console.log(`Installed to: ${target}`);
}

function remove(target) {
  if (!existsSync(target)) {
    console.log(`Not found: ${target}`);
    return;
  }
  rmSync(target, { recursive: true });
  console.log(`Removed: ${target}`);
}

const flags = parseArgs(process.argv);
const target = getTarget(flags.global);

if (flags.remove) {
  remove(target);
} else {
  install(target);
}
