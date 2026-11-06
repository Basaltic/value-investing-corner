"use client";

import { Check, Plus, X } from "lucide-react";
import { useState } from "react";
import { coreTags, limits, normalizeTags } from "@/lib/thesis/model";

export function TagPicker({
  tags,
  available,
  onChange,
  disabled = false,
}: {
  tags: string[];
  available: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [custom, setCustom] = useState("");
  const [error, setError] = useState("");
  const options = [...new Set([...coreTags, ...available, ...tags])];
  function toggle(tag: string) {
    if (!tags.includes(tag) && tags.length >= limits.tags) {
      setError("每条论点最多 8 个标签。");
      return;
    }
    setError("");
    onChange(
      tags.includes(tag) ? tags.filter((item) => item !== tag) : [...tags, tag],
    );
  }
  function add() {
    const tag = normalizeTags([custom])[0];
    if (!tag || tag.length > limits.tag) {
      setError("标签需为 1–20 字。");
      return;
    }
    if (!tags.includes(tag)) toggle(tag);
    setCustom("");
    setAdding(false);
  }
  return (
    <div>
      <fieldset
        className="flex flex-wrap items-center gap-2"
        aria-label="论点标签"
      >
        {options.map((tag) => (
          <button
            className={`thesis-chip ${tags.includes(tag) ? "selected" : ""}`}
            type="button"
            key={tag}
            aria-pressed={tags.includes(tag)}
            disabled={disabled}
            onClick={() => toggle(tag)}
          >
            {tags.includes(tag) && <Check aria-hidden className="size-3" />}
            {tag}
          </button>
        ))}
        <button
          type="button"
          className="thesis-text-button"
          disabled={disabled}
          onClick={() => setAdding(true)}
        >
          <Plus className="size-3.5" />
          自定义标签
        </button>
      </fieldset>
      {adding && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            aria-label="自定义标签名称"
            className="thesis-input max-w-56"
            value={custom}
            maxLength={limits.tag + 1}
            onChange={(event) => setCustom(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              }
            }}
            placeholder="标签名称，如：复购"
            disabled={disabled}
          />
          <button
            type="button"
            className="thesis-text-button"
            onClick={add}
            disabled={disabled}
          >
            添加标签
          </button>
          <button
            type="button"
            className="thesis-text-button"
            aria-label="取消自定义标签"
            onClick={() => setAdding(false)}
          >
            <X className="size-4" />
          </button>
        </div>
      )}
      {error && (
        <p className="thesis-error mt-2 text-xs" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
