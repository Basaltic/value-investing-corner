import assert from "node:assert/strict";
import { test } from "node:test";
import { IDBFactory } from "fake-indexeddb";
import {
  applyThesisAction,
  emptySnapshot,
  newestNotes,
  normalizeTags,
} from "./model";
import { loadTheses, openThesisDatabase, persistThesisAction } from "./storage";

function target() {
  return applyThesisAction(emptySnapshot(), {
    type: "create-target",
    id: "a",
    name: "企业 A",
    now: 100,
  });
}
const draft = {
  text: "为什么看好\n哪些事实会让我改变判断",
  tags: ["商业模式", "证伪条件"],
};

test("标的名称去空白，拒绝空名与重名", () => {
  const state = target();
  assert.throws(
    () =>
      applyThesisAction(state, {
        type: "create-target",
        id: "b",
        name: " 企业 A ",
        now: 200,
      }),
    /同名/,
  );
  assert.throws(
    () =>
      applyThesisAction(state, {
        type: "create-target",
        id: "b",
        name: "   ",
        now: 200,
      }),
    /名称/,
  );
  assert.equal(
    applyThesisAction(state, {
      type: "rename-target",
      id: "a",
      name: " 新名称 ",
    }).targets[0].name,
    "新名称",
  );
});
test("论点去空白、标签去重，空正文或无标签不得保存", () => {
  const state = target();
  assert.deepEqual(normalizeTags([" #复购 ", "复购", " "]), ["复购"]);
  for (const invalid of [
    { text: " ", tags: ["标签"] },
    { text: "判断", tags: [] },
    { text: "a".repeat(5001), tags: ["标签"] },
    { text: "判断", tags: ["标签".repeat(11)] },
  ])
    assert.throws(() =>
      applyThesisAction(state, {
        type: "add-note",
        id: "n",
        targetId: "a",
        draft: invalid,
        now: 200,
      }),
    );
});
test("创建时间排序与编辑更新时间分离", () => {
  let state = applyThesisAction(target(), {
    type: "add-note",
    id: "n1",
    targetId: "a",
    draft,
    now: 200,
  });
  state = applyThesisAction(state, {
    type: "add-note",
    id: "n2",
    targetId: "a",
    draft,
    now: 300,
  });
  state = applyThesisAction(state, {
    type: "edit-note",
    id: "n1",
    revision: 1,
    draft: { ...draft, text: "修订后的判断" },
    now: 400,
  });
  assert.deepEqual(
    newestNotes(state, "a").map((note) => note.id),
    ["n2", "n1"],
  );
  assert.equal(state.notes[0].createdAt, 200);
  assert.equal(state.notes[0].updatedAt, 400);
  assert.equal(state.notes[0].revision, 2);
});
test("并发编辑旧版本拒绝，删除必须对应当前版本", () => {
  let state = applyThesisAction(target(), {
    type: "add-note",
    id: "n",
    targetId: "a",
    draft,
    now: 200,
  });
  state = applyThesisAction(state, {
    type: "edit-note",
    id: "n",
    revision: 1,
    draft,
    now: 300,
  });
  assert.throws(
    () =>
      applyThesisAction(state, { type: "delete-note", id: "n", revision: 1 }),
    /其他页面/,
  );
  assert.equal(
    applyThesisAction(state, { type: "delete-note", id: "n", revision: 2 })
      .notes.length,
    0,
  );
});
test("不同标的草稿隔离，贴卡后清除对应草稿", () => {
  let state = applyThesisAction(target(), {
    type: "create-target",
    id: "b",
    name: "企业 B",
    now: 200,
  });
  for (const targetId of ["a", "b"])
    state = applyThesisAction(state, { type: "save-draft", targetId, draft });
  state = applyThesisAction(state, {
    type: "add-note",
    targetId: "a",
    id: "n",
    draft,
    now: 300,
  });
  assert.deepEqual(
    state.drafts.map((item) => item.targetId),
    ["b"],
  );
  assert.equal(newestNotes(state, "b").length, 0);
});
test("拒绝不存在标的及重复卡片，原状态不变", () => {
  const state = target();
  assert.throws(() =>
    applyThesisAction(state, {
      type: "add-note",
      id: "n",
      targetId: "missing",
      draft,
      now: 200,
    }),
  );
  assert.equal(state.notes.length, 0);
  const withNote = applyThesisAction(state, {
    type: "add-note",
    id: "n",
    targetId: "a",
    draft,
    now: 200,
  });
  assert.throws(
    () =>
      applyThesisAction(withNote, {
        type: "add-note",
        id: "n",
        targetId: "a",
        draft,
        now: 300,
      }),
    /已保存/,
  );
});
test("本地数据库重开恢复标的、正文、标签、时间和草稿", async () => {
  const factory = new IDBFactory();
  let db = await openThesisDatabase(factory);
  assert.deepEqual(await loadTheses(db), emptySnapshot());
  await persistThesisAction(db, {
    type: "create-target",
    id: "a",
    name: "企业 A",
    now: 100,
  });
  await persistThesisAction(db, {
    type: "add-note",
    id: "n",
    targetId: "a",
    draft,
    now: 200,
  });
  await persistThesisAction(db, {
    type: "save-draft",
    targetId: "a",
    draft: { text: "未完成的草稿", tags: ["风险"] },
  });
  db.close();
  db = await openThesisDatabase(factory);
  const restored = await loadTheses(db);
  assert.equal(restored.notes[0].text, draft.text);
  assert.deepEqual(restored.notes[0].tags, draft.tags);
  assert.equal(restored.notes[0].createdAt, 200);
  assert.equal(restored.drafts[0].value.text, "未完成的草稿");
  db.close();
});
test("多个数据库连接同时写入不丢失新记录", async () => {
  const factory = new IDBFactory();
  const a = await openThesisDatabase(factory);
  const b = await openThesisDatabase(factory);
  await persistThesisAction(a, {
    type: "create-target",
    id: "a",
    name: "企业 A",
    now: 100,
  });
  await Promise.all([
    persistThesisAction(a, {
      type: "add-note",
      id: "n1",
      targetId: "a",
      draft,
      now: 200,
    }),
    persistThesisAction(b, {
      type: "add-note",
      id: "n2",
      targetId: "a",
      draft,
      now: 300,
    }),
  ]);
  assert.equal((await loadTheses(a)).notes.length, 2);
  a.close();
  b.close();
});
test("无效写入事务回滚，已保存记录不被覆盖", async () => {
  const db = await openThesisDatabase(new IDBFactory());
  await persistThesisAction(db, {
    type: "create-target",
    id: "a",
    name: "企业 A",
    now: 100,
  });
  await assert.rejects(
    persistThesisAction(db, {
      type: "add-note",
      id: "n",
      targetId: "a",
      draft: { text: "", tags: [] },
      now: 200,
    }),
  );
  assert.equal((await loadTheses(db)).targets.length, 1);
  assert.equal((await loadTheses(db)).notes.length, 0);
  db.close();
});
test("正文以字符串存储，不处理HTML，不丢失换行", async () => {
  const db = await openThesisDatabase(new IDBFactory());
  await persistThesisAction(db, {
    type: "create-target",
    id: "a",
    name: "<b>名称</b>",
    now: 100,
  });
  const text = "<script>alert(1)</script>\n只是我输入的文字";
  await persistThesisAction(db, {
    type: "add-note",
    id: "n",
    targetId: "a",
    draft: { text, tags: ["证伪条件"] },
    now: 200,
  });
  assert.equal((await loadTheses(db)).notes[0].text, text);
  db.close();
});
test("不兼容本地数据拒绝读取与写入，原数据保留", async () => {
  const db = await openThesisDatabase(new IDBFactory());
  await new Promise<void>((resolve) => {
    const tx = db.transaction("state", "readwrite");
    tx.objectStore("state").put({ version: 99 }, "theses");
    tx.oncomplete = () => resolve();
  });
  await assert.rejects(loadTheses(db), /不兼容/);
  await assert.rejects(
    persistThesisAction(db, {
      type: "create-target",
      id: "a",
      name: "企业 A",
      now: 100,
    }),
    /不兼容/,
  );
  await assert.rejects(loadTheses(db), /不兼容/);
  db.close();
});
