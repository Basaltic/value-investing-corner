import assert from "node:assert/strict";
import test from "node:test";
import { DraftSession } from "./draft-session";

const first = {
  document: {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "旧文字" }] },
    ],
  },
  reason: "",
};
const next = {
  document: {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "最新文字" }] },
    ],
  },
  reason: "",
};
test("autosave failure preserves all input and allows explicit retry", async () => {
  let fail = true;
  const pending: string[] = [];
  const session = new DraftSession(
    first,
    0,
    async (_input, rev) => {
      if (fail) throw new Error("disk full");
      return rev + 1;
    },
    (value) => {
      pending.push(JSON.stringify(value));
    },
  );
  session.edit(next);
  assert(session.dirty);
  assert.equal(await session.flush(), false);
  assert.equal(session.status, "error");
  assert.deepEqual(session.input, next);
  assert(session.dirty);
  fail = false;
  assert.equal(await session.flush(), true);
  assert(!session.dirty);
  assert.equal(session.revision, 1);
  assert.equal(session.status, "saved");
  assert.equal(pending[pending.length - 1], "null");
});
test("edits during save are serialized without stale overwrite", async () => {
  let release: () => void = () => {};
  let calls = 0;
  const submitted: string[] = [];
  const session = new DraftSession(
    first,
    0,
    async (input, rev) => {
      calls++;
      submitted.push(JSON.stringify(input));
      if (calls === 1)
        await new Promise<void>((r) => {
          release = r;
        });
      return rev + 1;
    },
    () => {},
  );
  session.edit(next);
  const saving = session.flush();
  await Promise.resolve();
  session.edit({ ...next, reason: "新批注" });
  release();
  assert(await saving);
  assert.equal(calls, 2);
  assert.equal(session.revision, 2);
  assert.equal(session.input.reason, "新批注");
  assert(!session.dirty);
});
test("discard waits for in-flight save even when new typing changed the status", async () => {
  let release: () => void = () => {};
  const events: string[] = [];
  const session = new DraftSession(
    first,
    0,
    async (_i, r) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      events.push("saved");
      return r + 1;
    },
    () => {},
  );
  session.edit(next);
  const saving = session.flush();
  await Promise.resolve();
  session.edit({ ...next, reason: "最后修改" });
  const discard = session.discard(async (revision) => {
    events.push(`discard:${revision}`);
  });
  await Promise.resolve();
  assert.deepEqual(events, []);
  release();
  await saving;
  assert(await discard);
  assert.deepEqual(events, ["saved", "discard:1"]);
  assert(!session.dirty);
});
test("recovery write failure is exposed but does not discard in-memory text", async () => {
  const session = new DraftSession(
    first,
    0,
    async (_i, r) => r + 1,
    () => {
      throw new Error("quota");
    },
  );
  session.edit(next);
  assert(session.recoveryError);
  assert.deepEqual(session.input, next);
  assert(session.dirty);
});
