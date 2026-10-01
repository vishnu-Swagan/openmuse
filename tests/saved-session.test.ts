import assert from "node:assert/strict";
import { test } from "node:test";
import { sessionStore } from "../apps/mobile/src/saved-session.ts";
import { Auth } from "../apps/server/src/auth.ts";
import type { Config } from "../apps/server/src/config.ts";
import type { Store } from "../apps/server/src/db.ts";

test("remembered sessions expire, stay API-scoped, and contain no access key", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  const sessions = sessionStore("https://api.example", storage);
  const session = { token: "session-token", expiresAt: 2000, accessKey: "never-save-this" };
  sessions.save(session);
  assert.deepEqual(sessions.read(1000), { token: "session-token", expiresAt: 2000 });
  assert.ok(![...values.values()].join().includes("never-save-this"));
  assert.equal(sessionStore("https://different.example", storage).read(1000), undefined);
  assert.equal(sessions.read(2000), undefined);
  assert.equal(values.size, 0);
  values.set("openmuse.session:https://api.example", "corrupt");
  assert.equal(sessions.read(), undefined);
  assert.equal(values.size, 0);
});

test("blocked browser storage does not break sign-in", () => {
  const blocked = () => {
    throw new Error("Storage blocked");
  };
  const sessions = sessionStore("https://api.example", {
    getItem: blocked,
    setItem: blocked,
    removeItem: blocked,
  });
  sessions.save({ token: "token", expiresAt: Date.now() + 1000 });
  assert.equal(sessions.read(), undefined);
  sessions.clear();
});

test("sessions keep their 24-hour lifetime and sign-out revokes the token", async () => {
  const records = new Map();
  const db = {
    put: async (_owner: string, _kind: string, value: { id: string }) => {
      records.set(value.id, value);
    },
    get: async (_owner: string, _kind: string, id: string) => records.get(id),
    remove: async (_owner: string, _kind: string, id: string) => {
      records.delete(id);
    },
  } as unknown as Store;
  const auth = new Auth(
    db,
    { mode: "live", accessKey: "workspace-key" } as Config,
    "fixture-signing-key",
  );
  await assert.rejects(auth.session("wrong-key"), /incorrect/);
  const before = Date.now();
  const session = await auth.session("workspace-key");
  assert.ok(session.expiresAt >= before + 86400000);
  assert.ok(session.expiresAt <= Date.now() + 86400000);
  assert.equal(await auth.owner(`Bearer ${session.token}`), "local-user");
  await auth.signOut(`Bearer ${session.token}`);
  await assert.rejects(auth.owner(`Bearer ${session.token}`), /expired/);
});
