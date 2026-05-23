#!/usr/bin/env node

import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROFILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export function expandHome(value) {
  if (!value) return value;
  if (value === "~") return homedir();
  if (value.startsWith(`~${path.sep}`) || value.startsWith("~/")) {
    return path.join(homedir(), value.slice(2));
  }
  return value;
}

export function defaultStoreDir(env = process.env) {
  const base = env.XDG_CONFIG_HOME || (process.platform === "win32" ? env.APPDATA : undefined) || path.join(homedir(), ".config");
  return path.join(base, "opencode-codex-auth-switcher");
}

export function authPathCandidates(env = process.env) {
  const candidates = [];
  const explicit = env.CODEX_AUTH_SWITCH_AUTH_PATH || env.OPENCODE_AUTH_PATH;
  if (explicit) candidates.push(expandHome(explicit));

  const home = homedir();
  const xdgData = env.XDG_DATA_HOME || path.join(home, ".local", "share");
  const xdgConfig = env.XDG_CONFIG_HOME || path.join(home, ".config");

  if (process.platform === "win32") {
    if (env.LOCALAPPDATA) candidates.push(path.join(env.LOCALAPPDATA, "opencode", "auth.json"));
    if (env.APPDATA) candidates.push(path.join(env.APPDATA, "opencode", "auth.json"));
  }

  candidates.push(
    path.join(xdgData, "opencode", "auth.json"),
    path.join(xdgConfig, "opencode", "auth.json"),
    path.join(home, ".config", "opencode", "auth.json"),
  );

  return [...new Set(candidates.map((candidate) => path.resolve(expandHome(candidate))))];
}

export function resolveAuthPath(explicitPath, env = process.env) {
  if (explicitPath) return path.resolve(expandHome(explicitPath));
  const candidates = authPathCandidates(env);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (found) return found;
  throw new Error(
    [
      "OpenCode auth file was not found.",
      "Set it with --auth-path <path> or CODEX_AUTH_SWITCH_AUTH_PATH.",
      "Checked:",
      ...candidates.map((candidate) => `  - ${candidate}`),
    ].join("\n"),
  );
}

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    chmodSync(dir, 0o700);
  } catch {
    // Windows often ignores POSIX mode bits.
  }
}

function writeJson(file, value) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, file);
  try {
    chmodSync(file, 0o600);
  } catch {}
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function timestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function validateProfileName(name) {
  if (!PROFILE_RE.test(name) || name === "." || name === "..") {
    throw new Error("Invalid profile name. Use 1-64 chars: A-Z a-z 0-9 . _ - and start with an alphanumeric char.");
  }
}

function validateAuthSource(authPath) {
  if (!existsSync(authPath)) throw new Error(`Auth path does not exist: ${authPath}`);
  const stat = lstatSync(authPath);
  if (stat.isSymbolicLink()) throw new Error(`Refusing to copy symlink auth path: ${authPath}`);
  if (!stat.isFile()) throw new Error(`Auth path must be a regular JSON file for this MVP: ${authPath}`);
  readJson(authPath);
}

function validateProfile(profileDir) {
  const authFile = path.join(profileDir, "auth.json");
  const metadataFile = path.join(profileDir, "metadata.json");
  if (!existsSync(authFile)) throw new Error(`Profile is missing auth.json: ${profileDir}`);
  if (!existsSync(metadataFile)) throw new Error(`Profile is missing metadata.json: ${profileDir}`);
  readJson(authFile);
  readJson(metadataFile);
}

function safeCopyFile(source, destination) {
  validateAuthSource(source);
  ensureDir(path.dirname(destination));
  const tmp = `${destination}.${process.pid}.${Date.now()}.tmp`;
  cpSync(source, tmp, { force: true, errorOnExist: false });
  readJson(tmp);
  renameSync(tmp, destination);
  try {
    chmodSync(destination, 0o600);
  } catch {}
}

function storePaths(options) {
  const storeDir = path.resolve(expandHome(options.storeDir || process.env.CODEX_AUTH_SWITCH_STORE_DIR || defaultStoreDir()));
  return {
    storeDir,
    profilesDir: path.join(storeDir, "profiles"),
    backupsDir: path.join(storeDir, "backups"),
    currentFile: path.join(storeDir, "current.json"),
  };
}

export function saveProfile(name, options = {}) {
  validateProfileName(name);
  const authPath = resolveAuthPath(options.authPath);
  validateAuthSource(authPath);
  const paths = storePaths(options);
  const profileDir = path.join(paths.profilesDir, name);
  ensureDir(profileDir);
  safeCopyFile(authPath, path.join(profileDir, "auth.json"));
  writeJson(path.join(profileDir, "metadata.json"), {
    name,
    savedAt: new Date().toISOString(),
    sourceAuthPath: authPath,
    format: "opencode-auth-json-file",
  });
  return { name, authPath, profileDir };
}

export function useProfile(name, options = {}) {
  validateProfileName(name);
  const authPath = resolveAuthPath(options.authPath);
  const paths = storePaths(options);
  const profileDir = path.join(paths.profilesDir, name);
  validateProfile(profileDir);

  let backupDir = null;
  if (existsSync(authPath)) {
    validateAuthSource(authPath);
    backupDir = path.join(paths.backupsDir, timestamp());
    let suffix = 1;
    while (existsSync(backupDir)) backupDir = path.join(paths.backupsDir, `${timestamp()}-${suffix++}`);
    ensureDir(backupDir);
    safeCopyFile(authPath, path.join(backupDir, "auth.json"));
    writeJson(path.join(backupDir, "metadata.json"), {
      backedUpAt: new Date().toISOString(),
      sourceAuthPath: authPath,
      beforeUsingProfile: name,
    });
  } else {
    ensureDir(path.dirname(authPath));
  }

  safeCopyFile(path.join(profileDir, "auth.json"), authPath);
  writeJson(paths.currentFile, {
    name,
    appliedAt: new Date().toISOString(),
    authPath,
    profileDir,
    backupDir,
  });
  return { name, authPath, profileDir, backupDir };
}

export function listProfiles(options = {}) {
  const paths = storePaths(options);
  const current = existsSync(paths.currentFile) ? readJson(paths.currentFile).name : null;
  if (!existsSync(paths.profilesDir)) return [];
  return readdirSync(paths.profilesDir)
    .filter((entry) => statSync(path.join(paths.profilesDir, entry)).isDirectory())
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const metadataFile = path.join(paths.profilesDir, name, "metadata.json");
      const metadata = existsSync(metadataFile) ? readJson(metadataFile) : {};
      return { name, current: name === current, savedAt: metadata.savedAt || null };
    });
}

export function currentProfile(options = {}) {
  const paths = storePaths(options);
  if (!existsSync(paths.currentFile)) return null;
  return readJson(paths.currentFile);
}

function usage() {
  return `Usage:
  codex-auth-switch save <name> [--auth-path <path>] [--store-dir <path>]
  codex-auth-switch use <name> [--auth-path <path>] [--store-dir <path>]
  codex-auth-switch list [--store-dir <path>]
  codex-auth-switch current [--store-dir <path>]

Environment:
  CODEX_AUTH_SWITCH_AUTH_PATH   OpenCode auth.json path override
  CODEX_AUTH_SWITCH_STORE_DIR   Switcher storage directory override
`;
}

function parseArgs(argv) {
  const result = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--auth-path") result.authPath = argv[++i];
    else if (arg === "--store-dir") result.storeDir = argv[++i];
    else if (arg === "-h" || arg === "--help") result.help = true;
    else if (arg.startsWith("--auth-path=")) result.authPath = arg.slice("--auth-path=".length);
    else if (arg.startsWith("--store-dir=")) result.storeDir = arg.slice("--store-dir=".length);
    else result._.push(arg);
  }
  return result;
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || args._.length === 0) {
    console.log(usage());
    return 0;
  }

  const [command, name] = args._;
  switch (command) {
    case "save": {
      if (!name) throw new Error("Missing profile name.");
      const result = saveProfile(name, args);
      console.log(`Saved profile '${result.name}'.`);
      return 0;
    }
    case "use": {
      if (!name) throw new Error("Missing profile name.");
      const result = useProfile(name, args);
      console.log(`Using profile '${result.name}'.`);
      if (result.backupDir) console.log(`Previous auth was backed up: ${result.backupDir}`);
      return 0;
    }
    case "list": {
      const profiles = listProfiles(args);
      if (profiles.length === 0) {
        console.log("No profiles saved.");
        return 0;
      }
      for (const profile of profiles) {
        const marker = profile.current ? "current" : "       ";
        const saved = profile.savedAt ? `saved: ${profile.savedAt.replace("T", " ").slice(0, 16)}` : "saved: unknown";
        console.log(`${profile.name.padEnd(20)} ${marker}  ${saved}`);
      }
      return 0;
    }
    case "current": {
      const current = currentProfile(args);
      console.log(current?.name || "No current profile.");
      return 0;
    }
    default:
      throw new Error(`Unknown command: ${command}\n${usage()}`);
  }
}

function isMainModule() {
  if (!process.argv[1]) return false;
  return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
}

if (isMainModule()) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
