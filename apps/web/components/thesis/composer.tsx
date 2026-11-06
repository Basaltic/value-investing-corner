"use client";

import { ArrowUp, X } from "lucide-react";
import {
  type Ref,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { TagPicker } from "@/components/thesis/tag-picker";
import { limits, type ThesisDraft } from "@/lib/thesis/model";

export type ComposerHandle = { requestLeave: () => Promise<boolean> };

export function Composer({
  ref,
  name,
  initial,
  available,
  onSave,
  onDraft,
  editing = false,
  onCancel,
}: {
  ref?: Ref<ComposerHandle>;
  name: string;
  initial: ThesisDraft;
  available: string[];
  onSave: (draft: ThesisDraft) => Promise<boolean>;
  onDraft?: (draft: ThesisDraft) => Promise<boolean>;
  editing?: boolean;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const latest = useRef(draft);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const persist = useRef(onDraft);
  persist.current = onDraft;
  useImperativeHandle(ref, () => ({
    async requestLeave() {
      if (saving) return false;
      if (!dirty.current) return true;
      if (timer.current) clearTimeout(timer.current);
      if (editing) {
        if (!window.confirm("编辑尚未保存，确认放弃这次修改？")) return false;
        dirty.current = false;
        return true;
      }
      const ok = await persist.current?.(latest.current);
      dirty.current = !ok;
      setStatus(ok ? "草稿已存本地" : "草稿保存失败，请重试，不要刷新");
      return Boolean(ok);
    },
  }));
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      if (timer.current) clearTimeout(timer.current);
      if (dirty.current && persist.current)
        void persist.current(latest.current);
    };
  }, []);
  function change(value: ThesisDraft) {
    latest.current = value;
    dirty.current = true;
    setDraft(value);
    if (!onDraft) return;
    setStatus("草稿保存中…");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const ok = await onDraft(value);
      if (latest.current === value) {
        dirty.current = !ok;
        setStatus(ok ? "草稿已存本地" : "草稿保存失败，请重试，不要刷新");
      }
    }, 400);
  }
  async function save() {
    if (saving || !draft.text.trim() || !draft.tags.length) return;
    if (timer.current) clearTimeout(timer.current);
    setSaving(true);
    const ok = await onSave(draft);
    if (ok) {
      dirty.current = false;
      const empty = { text: "", tags: [] };
      latest.current = empty;
      setDraft(empty);
      setStatus("已保存到本地");
    }
    setSaving(false);
  }
  return (
    <section
      className="thesis-composer"
      aria-label={editing ? "编辑论点" : "新增论点"}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <label htmlFor="thesis-text" className="site-forest">
          {editing ? "编辑" : "给"} <strong>{name}</strong>{" "}
          {editing ? "的论点" : "记一条判断"}
        </label>
        <span className="site-muted text-xs" role="status">
          {status ||
            (editing
              ? "保留创建时间，另记更新时间"
              : "选择标签后保存 · 自动记录时间")}
        </span>
      </div>
      <textarea
        id="thesis-text"
        value={draft.text}
        onChange={(event) => change({ ...draft, text: event.target.value })}
        maxLength={limits.text}
        rows={3}
        disabled={saving}
        placeholder="这家公司的价值来自哪里？又有什么事实，会让我改变看法？"
        className="thesis-textarea"
        onKeyDown={(event) => {
          if (
            !event.nativeEvent.isComposing &&
            event.key === "Enter" &&
            (event.metaKey || event.ctrlKey)
          ) {
            event.preventDefault();
            void save();
          }
        }}
      />
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <TagPicker
            tags={draft.tags}
            available={available}
            onChange={(tags) => change({ ...draft, tags })}
            disabled={saving}
          />
          <p className="site-muted mt-2 text-[11px]">
            {draft.text.length} / 5000 字 · Enter 换行，Ctrl / ⌘ + Enter 保存
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {editing && (
            <button
              type="button"
              className="thesis-secondary"
              onClick={() => {
                dirty.current = false;
                onCancel?.();
              }}
              disabled={saving}
            >
              <X className="size-4" />
              取消编辑
            </button>
          )}
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !draft.text.trim() || !draft.tags.length}
            className="thesis-primary"
          >
            {saving ? "保存中…" : editing ? "保存修改" : "贴到论点墙"}
            <ArrowUp className="size-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
