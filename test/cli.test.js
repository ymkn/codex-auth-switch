import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { currentProfile, listProfiles, saveProfile, useProfile } from "../bin/codex-auth-switch.js";

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "codex-auth-switch-"));
  const authPath = path.join(root, "opencode", "auth.json");
  const storeDir = path.join(root, "switcher");
  mkdirSync(path.dirname(authPath), { recursive: true });
  writeFileSync(authPath, JSON.stringify({ openai: { type: "oauth", refresh: "secret-one" } }));
  return { root, authPath, storeDir };
}

test("save, use, list, current", () => {
  const ctx = fixture();
  try {
    saveProfile("plus1", { authPath: ctx.authPath, storeDir: ctx.storeDir });
    writeFileSync(ctx.authPath, JSON.stringify({ openai: { type: "oauth", refresh: "secret-two" } }));
    saveProfile("plus2", { authPath: ctx.authPath, storeDir: ctx.storeDir });

    useProfile("plus1", { authPath: ctx.authPath, storeDir: ctx.storeDir });

    assert.deepEqual(JSON.parse(readFileSync(ctx.authPath, "utf8")), {
      openai: { type: "oauth", refresh: "secret-one" },
    });
    assert.equal(currentProfile({ storeDir: ctx.storeDir }).name, "plus1");
    assert.deepEqual(
      listProfiles({ storeDir: ctx.storeDir }).map((profile) => [profile.name, profile.current]),
      [
        ["plus1", true],
        ["plus2", false],
      ],
    );
  } finally {
    rmSync(ctx.root, { recursive: true, force: true });
  }
});

test("use syncs refreshed current profile before switching", () => {
  const ctx = fixture();
  try {
    saveProfile("plus1", { authPath: ctx.authPath, storeDir: ctx.storeDir });
    writeFileSync(ctx.authPath, JSON.stringify({ openai: { type: "oauth", refresh: "secret-two" } }));
    saveProfile("plus2", { authPath: ctx.authPath, storeDir: ctx.storeDir });

    useProfile("plus1", { authPath: ctx.authPath, storeDir: ctx.storeDir });
    writeFileSync(ctx.authPath, JSON.stringify({ openai: { type: "oauth", refresh: "secret-one-rotated" } }));

    const result = useProfile("plus2", { authPath: ctx.authPath, storeDir: ctx.storeDir });
    assert.equal(result.syncedProfile.name, "plus1");

    useProfile("plus1", { authPath: ctx.authPath, storeDir: ctx.storeDir });
    assert.deepEqual(JSON.parse(readFileSync(ctx.authPath, "utf8")), {
      openai: { type: "oauth", refresh: "secret-one-rotated" },
    });
  } finally {
    rmSync(ctx.root, { recursive: true, force: true });
  }
});

test("rejects unsafe profile names", () => {
  const ctx = fixture();
  try {
    assert.throws(() => saveProfile("../x", { authPath: ctx.authPath, storeDir: ctx.storeDir }), /Invalid profile name/);
  } finally {
    rmSync(ctx.root, { recursive: true, force: true });
  }
});

test("rejects invalid json auth file", () => {
  const ctx = fixture();
  try {
    writeFileSync(ctx.authPath, "not-json");
    assert.throws(() => saveProfile("plus1", { authPath: ctx.authPath, storeDir: ctx.storeDir }), /Unexpected token/);
  } finally {
    rmSync(ctx.root, { recursive: true, force: true });
  }
});
