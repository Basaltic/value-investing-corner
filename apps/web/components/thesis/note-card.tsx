"use client";

import { Clock, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import type { ThesisNote } from "@/lib/thesis/model";

function time(value: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
export function NoteCard({
  note,
  onEdit,
  onDelete,
  busy,
}: {
  note: ThesisNote;
  onEdit: () => void;
  onDelete: () => Promise<boolean>;
  busy: boolean;
}) {
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const tone = note.tags.includes("证伪条件")
    ? "falsify"
    : note.tags.includes("估值依据")
      ? "valuation"
      : note.tags.includes("竞争优势")
        ? "advantage"
        : "neutral";
  return (
    <article className={`thesis-note ${tone}`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {note.tags.map((tag) => (
            <span key={tag} className="thesis-note-tag">
              {tag}
            </span>
          ))}
        </div>
        <button
          className="thesis-icon shrink-0"
          type="button"
          aria-label="论点操作"
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
        >
          <MoreHorizontal className="size-5" />
        </button>
      </div>
      {menu && (
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="thesis-text-button"
            disabled={busy}
            onClick={() => {
              setMenu(false);
              onEdit();
            }}
          >
            <Pencil className="size-3.5" />
            编辑论点
          </button>
          <button
            type="button"
            className="thesis-text-button"
            disabled={busy}
            onClick={() => setConfirm(true)}
          >
            <Trash2 className="size-3.5" />
            删除论点
          </button>
        </div>
      )}
      <p className="mb-5 flex-1 whitespace-pre-wrap break-words text-base leading-7">
        {note.text}
      </p>
      <div className="site-muted flex flex-wrap items-center gap-2 text-xs">
        <Clock className="size-3" />
        <time dateTime={new Date(note.createdAt).toISOString()}>
          {time(note.createdAt)}
        </time>
      </div>
      {note.revision > 1 && (
        <p className="site-muted mt-1 text-[11px]">
          更新于{" "}
          <time dateTime={new Date(note.updatedAt).toISOString()}>
            {time(note.updatedAt)}
          </time>
        </p>
      )}
      {confirm && (
        <fieldset
          className="site-rule mt-4 border-t pt-3 text-sm"
          aria-label="确认删除论点"
        >
          <p className="mb-2">删除后无法恢复，确认删除这条论点？</p>
          <div className="flex gap-3">
            <button
              type="button"
              className="thesis-text-button"
              disabled={busy}
              onClick={async () => {
                if (await onDelete()) setConfirm(false);
              }}
            >
              确认删除
            </button>
            <button
              type="button"
              className="thesis-text-button"
              onClick={() => setConfirm(false)}
            >
              取消
            </button>
          </div>
        </fieldset>
      )}
    </article>
  );
}
