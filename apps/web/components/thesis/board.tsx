"use client";

import { Circle, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Composer, type ComposerHandle } from "@/components/thesis/composer";
import { NoteCard } from "@/components/thesis/note-card";
import { TargetForm } from "@/components/thesis/target-form";
import { useTheses } from "@/components/thesis/use-theses";
import {
  emptyDraft,
  newestNotes,
  type ThesisDraft,
  type ThesisNote,
} from "@/lib/thesis/model";

export function ThesisBoard() {
  const { state, ready, error, pending, act } = useTheses();
  const [selected, setSelected] = useState("");
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [editing, setEditing] = useState<ThesisNote | null>(null);
  const composer = useRef<ComposerHandle>(null);
  const router = useRouter();
  useEffect(() => {
    const leave = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("a[href]")
          : null;
      if (!link || link.target === "_blank" || link.hasAttribute("download"))
        return;
      const destination = new URL(link.href);
      if (
        destination.origin !== window.location.origin ||
        destination.pathname === window.location.pathname
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      void (async () => {
        if (
          pending ||
          (composer.current && !(await composer.current.requestLeave()))
        )
          return;
        router.push(
          `${destination.pathname}${destination.search}${destination.hash}`,
        );
      })();
    };
    document.addEventListener("click", leave, true);
    return () => document.removeEventListener("click", leave, true);
  }, [pending, router]);
  const target =
    state.targets.find((item) => item.id === selected) ?? state.targets[0];
  const notes = target ? newestNotes(state, target.id) : [];
  const available = [...new Set(state.notes.flatMap((note) => note.tags))];
  async function select(id: string) {
    if (id === target?.id) return true;
    if (
      pending ||
      (composer.current && !(await composer.current.requestLeave()))
    )
      return false;
    setSelected(id);
    setEditing(null);
    setRenaming(false);
    return true;
  }
  async function create(name: string) {
    if (
      pending ||
      (composer.current && !(await composer.current.requestLeave()))
    )
      return false;
    const id = crypto.randomUUID();
    if (await act({ type: "create-target", id, name, now: Date.now() })) {
      setSelected(id);
      setEditing(null);
      setRenaming(false);
      return true;
    }
    return false;
  }
  async function save(draft: ThesisDraft) {
    if (!target) return false;
    if (editing) {
      const ok = await act({
        type: "edit-note",
        id: editing.id,
        revision: editing.revision,
        draft,
        now: Date.now(),
      });
      if (ok) setEditing(null);
      return ok;
    }
    return act({
      type: "add-note",
      id: crypto.randomUUID(),
      targetId: target.id,
      draft,
      now: Date.now(),
    });
  }
  return (
    <>
      <header className="mb-7 flex flex-wrap items-center justify-between gap-5">
        <div>
          <h1 className="site-serif text-4xl font-medium">投资论点</h1>
          <p className="site-muted mt-3 text-sm leading-7 md:text-base">
            记录为什么看好，也写下什么会证明自己错了。
          </p>
        </div>
        <div className="site-muted text-right text-xs leading-6">
          <p className="site-forest inline-flex items-center gap-2">
            <Circle className="size-2 fill-current" />
            仅存当前浏览器
          </p>
          <p>暂不云端同步</p>
        </div>
      </header>
      {!ready && !error && (
        <p role="status" className="site-muted py-12 text-center">
          正在读取本地记录…
        </p>
      )}
      {error && (
        <div
          className="thesis-error site-rule mb-5 rounded-xl border p-4"
          role="alert"
        >
          <p>{error}</p>
          {!ready && (
            <button
              type="button"
              className="thesis-secondary mt-3"
              onClick={() => window.location.reload()}
            >
              重新载入
            </button>
          )}
        </div>
      )}
      {ready && (
        <>
          <div className="thesis-tabs" role="tablist" aria-label="投资标的">
            {state.targets.map((item, index) => (
              <button
                type="button"
                role="tab"
                id={`tab-${item.id}`}
                aria-controls="thesis-panel"
                aria-selected={target?.id === item.id}
                tabIndex={target?.id === item.id ? 0 : -1}
                className={`thesis-tab ${target?.id === item.id ? "active" : ""}`}
                key={item.id}
                onClick={() => select(item.id)}
                onKeyDown={async (event) => {
                  let next = index;
                  if (event.key === "ArrowRight")
                    next = (index + 1) % state.targets.length;
                  else if (event.key === "ArrowLeft")
                    next =
                      (index - 1 + state.targets.length) % state.targets.length;
                  else if (event.key === "Home") next = 0;
                  else if (event.key === "End") next = state.targets.length - 1;
                  else return;
                  event.preventDefault();
                  if (await select(state.targets[next].id))
                    document
                      .getElementById(`tab-${state.targets[next].id}`)
                      ?.focus();
                }}
              >
                {item.name}
                <span className="thesis-count">
                  {
                    state.notes.filter((note) => note.targetId === item.id)
                      .length
                  }
                </span>
              </button>
            ))}
            <button
              className="thesis-text-button shrink-0 px-4"
              type="button"
              onClick={() => setCreating(true)}
            >
              <Plus className="size-4" />
              新建标的
            </button>
          </div>
          {creating && (
            <TargetForm onSave={create} onCancel={() => setCreating(false)} />
          )}
          {!target ? (
            <section className="site-rule my-8 rounded-xl border border-dashed p-10 text-center">
              <h2 className="site-serif text-2xl">从一个正在研究的标的开始</h2>
              <p className="site-muted my-4 text-sm leading-7">
                给它一个名称，把自己的判断、依据和可能错的地方逐条记录下来。
              </p>
              <button
                type="button"
                className="thesis-primary mx-auto"
                onClick={() => setCreating(true)}
              >
                <Plus className="size-4" />
                新建第一个标的
              </button>
            </section>
          ) : (
            <section
              role="tabpanel"
              id="thesis-panel"
              aria-labelledby={`tab-${target.id}`}
            >
              <div className="my-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="site-serif break-words text-2xl">
                      {target.name}
                    </h2>
                    <span className="site-muted text-xs">
                      {notes.length} 条论点
                    </span>
                    <button
                      type="button"
                      className="thesis-icon"
                      aria-label="重命名标的"
                      onClick={() => setRenaming(!renaming)}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  </div>
                  <p className="site-muted mt-2 text-xs">
                    把每一个判断，留在它发生的时刻。
                  </p>
                </div>
                <p className="site-muted text-xs leading-6">
                  创建时间：最新在前
                  <span className="ml-3 opacity-70">
                    时间 / 标签筛选与排序 · 后续
                  </span>
                </p>
              </div>
              {renaming && (
                <TargetForm
                  key={target.id}
                  initial={target.name}
                  onSave={(name) =>
                    act({ type: "rename-target", id: target.id, name })
                  }
                  onCancel={() => setRenaming(false)}
                />
              )}
              <div className="thesis-wall">
                {notes.length ? (
                  notes.map((note) => (
                    <NoteCard
                      note={note}
                      key={note.id}
                      busy={pending > 0}
                      onEdit={async () => {
                        if (
                          composer.current &&
                          !(await composer.current.requestLeave())
                        )
                          return;
                        setEditing(note);
                        document
                          .getElementById("thesis-editor")
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "center",
                          });
                      }}
                      onDelete={() =>
                        act({
                          type: "delete-note",
                          id: note.id,
                          revision: note.revision,
                        })
                      }
                    />
                  ))
                ) : (
                  <p className="site-muted col-span-full py-12 text-center text-sm leading-7">
                    还没有论点。写下一条判断，再选一个标签，贴到这面墙上。
                  </p>
                )}
              </div>
              <div id="thesis-editor" className="scroll-mt-20">
                <Composer
                  ref={composer}
                  key={`${target.id}:${editing?.id ?? "new"}`}
                  name={target.name}
                  initial={
                    editing
                      ? { text: editing.text, tags: editing.tags }
                      : (state.drafts.find(
                          (item) => item.targetId === target.id,
                        )?.value ?? emptyDraft)
                  }
                  available={available}
                  editing={Boolean(editing)}
                  onSave={save}
                  onCancel={() => setEditing(null)}
                  onDraft={
                    editing
                      ? undefined
                      : (draft) =>
                          act({
                            type: "save-draft",
                            targetId: target.id,
                            draft,
                          })
                  }
                />
              </div>
            </section>
          )}
          <footer className="site-muted mt-6 flex flex-wrap justify-between gap-3 text-xs leading-6">
            <span role="status">
              {pending
                ? "正在写入本地，请稍候再离开…"
                : "记录仅保存在本地数据库"}
            </span>
            <span>
              清除浏览器数据会丢失记录，换浏览器、设备或网站地址不共享。
            </span>
          </footer>
        </>
      )}
    </>
  );
}
