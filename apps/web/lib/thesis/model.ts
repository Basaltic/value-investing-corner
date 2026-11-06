import { z } from "zod";

export const coreTags = [
  "商业模式",
  "竞争优势",
  "估值依据",
  "主要风险",
  "证伪条件",
] as const;
export const limits = { name: 60, text: 5000, tag: 20, tags: 8 } as const;
const id = z.string().min(1);
const timestamp = z.number().finite().int().nonnegative().max(8.64e15);
const tag = z.string().trim().min(1).max(limits.tag);
const draftSchema = z.object({
  text: z.string().max(limits.text),
  tags: z.array(tag).max(limits.tags),
});
const targetSchema = z.object({
  id,
  name: z.string().trim().min(1).max(limits.name),
  createdAt: timestamp,
});
const noteSchema = z.object({
  id,
  targetId: id,
  text: z.string().trim().min(1).max(limits.text),
  tags: z.array(tag).min(1).max(limits.tags),
  createdAt: timestamp,
  updatedAt: timestamp,
  revision: z.number().int().positive(),
});
export const snapshotSchema = z
  .object({
    version: z.literal(1),
    targets: z.array(targetSchema),
    notes: z.array(noteSchema),
    drafts: z.array(z.object({ targetId: id, value: draftSchema })),
  })
  .superRefine((state, ctx) => {
    const targets = new Set(state.targets.map((target) => target.id));
    if (
      targets.size !== state.targets.length ||
      new Set(state.notes.map((note) => note.id)).size !== state.notes.length ||
      new Set(state.drafts.map((draft) => draft.targetId)).size !==
        state.drafts.length ||
      state.notes.some(
        (note) =>
          !targets.has(note.targetId) || note.updatedAt < note.createdAt,
      ) ||
      state.drafts.some((draft) => !targets.has(draft.targetId))
    )
      ctx.addIssue({ code: "custom", message: "记录关联不完整" });
  });
export type ThesisSnapshot = z.infer<typeof snapshotSchema>;
export type ThesisTarget = z.infer<typeof targetSchema>;
export type ThesisNote = z.infer<typeof noteSchema>;
export type ThesisDraft = z.infer<typeof draftSchema>;
export const emptyDraft: ThesisDraft = { text: "", tags: [] };
export function emptySnapshot(): ThesisSnapshot {
  return { version: 1, targets: [], notes: [], drafts: [] };
}
export type ThesisAction =
  | { type: "create-target"; id: string; name: string; now: number }
  | { type: "rename-target"; id: string; name: string }
  | { type: "save-draft"; targetId: string; draft: ThesisDraft }
  | {
      type: "add-note";
      id: string;
      targetId: string;
      draft: ThesisDraft;
      now: number;
    }
  | {
      type: "edit-note";
      id: string;
      revision: number;
      draft: ThesisDraft;
      now: number;
    }
  | { type: "delete-note"; id: string; revision: number };

export function normalizeTags(tags: string[]) {
  return [
    ...new Set(
      tags
        .map((value) => value.trim().replace(/^#+/, "").trim())
        .filter(Boolean),
    ),
  ];
}
function validatedDraft(draft: ThesisDraft, requireText: boolean): ThesisDraft {
  const parsed = draftSchema.safeParse({
    text: requireText ? draft.text.trim() : draft.text,
    tags: normalizeTags(draft.tags),
  });
  if (!parsed.success)
    throw new Error("正文最多 5000 字，最多 8 个标签，每个标签最多 20 字。");
  if (requireText && (!parsed.data.text || !parsed.data.tags.length))
    throw new Error("请填写判断并至少选择一个标签。");
  return parsed.data;
}
export function applyThesisAction(
  state: ThesisSnapshot,
  action: ThesisAction,
): ThesisSnapshot {
  let next: ThesisSnapshot;
  if (action.type === "create-target" || action.type === "rename-target") {
    const name = action.name.trim();
    if (!name || name.length > limits.name)
      throw new Error("标的名称需为 1–60 字。");
    if (
      state.targets.some(
        (target) =>
          target.name.toLocaleLowerCase() === name.toLocaleLowerCase() &&
          (action.type === "create-target" || target.id !== action.id),
      )
    )
      throw new Error("已有同名标的，请直接切换或换一个名称。");
    if (action.type === "create-target") {
      if (state.targets.some((target) => target.id === action.id))
        throw new Error("标的标识重复，请重试。");
      next = {
        ...state,
        targets: [
          ...state.targets,
          { id: action.id, name, createdAt: action.now },
        ],
      };
    } else {
      if (!state.targets.some((target) => target.id === action.id))
        throw new Error("标的不存在，请重新载入。");
      next = {
        ...state,
        targets: state.targets.map((target) =>
          target.id === action.id ? { ...target, name } : target,
        ),
      };
    }
  } else if (action.type === "save-draft" || action.type === "add-note") {
    if (!state.targets.some((target) => target.id === action.targetId))
      throw new Error("标的不存在，请重新载入。");
    const draft = validatedDraft(action.draft, action.type === "add-note");
    const drafts = state.drafts.filter(
      (item) => item.targetId !== action.targetId,
    );
    if (action.type === "save-draft")
      next = {
        ...state,
        drafts: [...drafts, { targetId: action.targetId, value: draft }],
      };
    else {
      if (state.notes.some((note) => note.id === action.id))
        throw new Error("卡片已保存，请勿重复提交。");
      next = {
        ...state,
        drafts,
        notes: [
          ...state.notes,
          {
            id: action.id,
            targetId: action.targetId,
            ...draft,
            createdAt: action.now,
            updatedAt: action.now,
            revision: 1,
          },
        ],
      };
    }
  } else {
    const note = state.notes.find((note) => note.id === action.id);
    if (!note || note.revision !== action.revision)
      throw new Error(
        "这条论点已在其他页面变更。你的输入仍保留，请取消编辑并重新查看最新记录。",
      );
    next =
      action.type === "delete-note"
        ? { ...state, notes: state.notes.filter((item) => item.id !== note.id) }
        : {
            ...state,
            notes: state.notes.map((item) =>
              item.id === note.id
                ? {
                    ...item,
                    ...validatedDraft(action.draft, true),
                    updatedAt: Math.max(note.updatedAt, action.now),
                    revision: note.revision + 1,
                  }
                : item,
            ),
          };
  }
  return snapshotSchema.parse(next);
}
export function newestNotes(state: ThesisSnapshot, targetId: string) {
  return state.notes
    .filter((note) => note.targetId === targetId)
    .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
}
