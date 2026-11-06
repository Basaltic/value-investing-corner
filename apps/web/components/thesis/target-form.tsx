"use client";

import { useState } from "react";
import { limits } from "@/lib/thesis/model";

export function TargetForm({
  initial = "",
  onSave,
  onCancel,
}: {
  initial?: string;
  onSave: (name: string) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <form
      aria-label={initial ? "标的重命名" : "创建投资标的"}
      className="site-rule my-5 flex flex-wrap items-end gap-3 rounded-xl border bg-[var(--paper-deep)] p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || !name.trim()) return;
        setBusy(true);
        if (await onSave(name)) onCancel();
        setBusy(false);
      }}
    >
      <div>
        <label className="mb-2 block text-sm" htmlFor="target-name">
          标的名称
        </label>
        <input
          id="target-name"
          className="thesis-input"
          placeholder="如：我正在研究的公司"
          value={name}
          maxLength={limits.name}
          required
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <button
        className="thesis-primary"
        type="submit"
        disabled={busy || !name.trim()}
      >
        {busy ? "保存中…" : initial ? "保存名称" : "创建标的"}
      </button>
      <button
        className="thesis-secondary"
        type="button"
        disabled={busy}
        onClick={onCancel}
      >
        取消
      </button>
      <span className="site-muted text-xs">仅需名称，最多 60 字</span>
    </form>
  );
}
