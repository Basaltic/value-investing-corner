import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useMemo, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";
import type { Judgment, JudgmentInput } from "../../adapters/judgments";
import { createJudgmentApi } from "../../adapters/judgments";
import { DraftSession } from "./draft-session";
import { JudgmentEditor } from "./judgment-editor";

const api = createJudgmentApi();
function recoveryKey(draft: Judgment) {
  return `value-investing:judgment-recovery:${draft.company_id}:${draft.id}`;
}
function readRecovery(
  draft: Judgment,
): { input: JudgmentInput; revision: number } | null {
  const raw = localStorage.getItem(recoveryKey(draft));
  if (!raw) return null;
  const value: unknown = JSON.parse(raw);
  if (
    !value ||
    typeof value !== "object" ||
    !("input" in value) ||
    !("revision" in value) ||
    typeof value.revision !== "number"
  )
    throw new Error("本地恢复数据格式错误，未覆盖数据库");
  const input = value.input;
  if (
    !input ||
    typeof input !== "object" ||
    !("document" in input) ||
    !("reason" in input) ||
    typeof input.reason !== "string" ||
    !input.document ||
    typeof input.document !== "object"
  )
    throw new Error("恢复正文格式错误");
  return { input: input as JudgmentInput, revision: value.revision };
}
export function DraftWorkspace({
  draft,
  onFrozen,
  onDiscarded,
}: {
  draft: Judgment;
  onFrozen: () => void;
  onDiscarded: () => void;
}) {
  const [, redraw] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [confirmFreeze, setConfirmFreeze] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [closePending, setClosePending] = useState(false);
  const [recovery, setRecovery] = useState<{
    input: JudgmentInput;
    revision: number;
  } | null>(null);
  const [recoveryReadError, setRecoveryReadError] = useState("");
  const [editorKey, setEditorKey] = useState(0);
  const [savedAt, setSavedAt] = useState(draft.updated_at);
  const session = useMemo(
    () =>
      new DraftSession(
        { document: draft.document, reason: draft.reason },
        draft.revision,
        async (input, revision) => {
          const saved = await api.save(draft.id, revision, input);
          setSavedAt(saved.updated_at);
          return saved.revision;
        },
        (value) => {
          if (value)
            localStorage.setItem(recoveryKey(draft), JSON.stringify(value));
          else localStorage.removeItem(recoveryKey(draft));
        },
        () => redraw((v) => v + 1),
      ),
    [draft],
  );
  const blocked = session.dirty || busy || !!recovery || !!recoveryReadError;
  const blocker = useBlocker(blocked);
  const current = useRef({ blocked, busy, session });
  current.current = { blocked, busy, session };
  const allowClose = useRef(false);
  useEffect(() => {
    try {
      setRecovery(readRecovery(draft));
    } catch (e) {
      setRecoveryReadError(String(e));
    }
  }, [draft]);
  const input = session.input;
  useEffect(() => {
    if (!session.dirty || busy || recovery || recoveryReadError) return;
    const scheduledInput = input;
    const timer = setTimeout(() => {
      if (session.input === scheduledInput) void session.flush();
    }, 900);
    return () => clearTimeout(timer);
  }, [session, input, busy, recovery, recoveryReadError]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (current.current.blocked) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    let disposed = false;
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .onCloseRequested((event) => {
        event.preventDefault();
        if (!allowClose.current && current.current.blocked) {
          setClosePending(true);
        } else {
          void api
            .closeWindow()
            .catch((e) => setActionError(`关闭窗口失败：${String(e)}`));
        }
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch((e) =>
        setActionError(`关闭保护监听失败：${String(e)}；请先手动保存再关闭。`),
      );
    return () => {
      disposed = true;
      unlisten?.();
      window.removeEventListener("beforeunload", before);
    };
  }, []);
  async function flush() {
    if (recovery || recoveryReadError) {
      setActionError("请先处理恢复内容，不覆盖数据库。");
      return false;
    }
    return session.flush();
  }
  async function saveLeave() {
    if (await flush()) {
      if (closePending) {
        allowClose.current = true;
        try {
          await api.closeWindow();
        } catch (e) {
          allowClose.current = false;
          setActionError(String(e));
        }
      } else if (blocker.state === "blocked") blocker.proceed();
    }
  }
  async function freeze() {
    setBusy(true);
    setActionError("");
    try {
      if (!(await flush())) return;
      await api.freeze(draft.id, session.revision);
      onFrozen();
    } catch (e) {
      setActionError(String(e));
    } finally {
      setBusy(false);
      setConfirmFreeze(false);
    }
  }
  async function discard() {
    setBusy(true);
    setActionError("");
    try {
      if (await session.discard((revision) => api.discard(draft.id, revision)))
        onDiscarded();
    } catch (e) {
      setActionError(String(e));
    } finally {
      setBusy(false);
      setConfirmDiscard(false);
    }
  }
  return (
    <section className="panel">
      <h2>{draft.base_id ? "修订草稿" : "判断草稿"}</h2>
      <p className="muted">
        自由正文与正文内批注自动保存；停笔约0.9秒写入SQLite。可选提纲、修订原因与证据都不是必填。正式判断不进入自动保存。
      </p>
      <p
        className={session.status === "error" ? "error" : "notice"}
        role="status"
      >
        {
          {
            saved: "已保存到本地数据库",
            dirty: "有未保存修改",
            saving: "正在保存…",
            error: "保存失败，最新输入保留，可手动重试",
          }[session.status]
        }{" "}
        / 草稿修订号{session.revision}
      </p>
      {(session.error || session.recoveryError || actionError) && (
        <p className="error" role="alert">
          {session.error || actionError}
          {session.recoveryError &&
            `；本地恢复暂存失败：${session.recoveryError}，尚未保存内容只在当前窗口内存中。`}
        </p>
      )}
      {recovery && (
        <div className="notice">
          <h3>发现未完成的本地恢复内容</h3>
          <p>
            恢复副本修订号{recovery.revision}，数据库修订号{draft.revision}
            ；不会自动覆盖。
          </p>
          <pre className="material-text">
            {JSON.stringify(recovery.input, null, 2)}
          </pre>
          <div className="toolbar">
            <button
              disabled={recovery.revision !== draft.revision}
              type="button"
              onClick={() => {
                session.edit(recovery.input);
                setRecovery(null);
                setEditorKey((v) => v + 1);
              }}
            >
              载入恢复内容后重新保存
            </button>
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem(recoveryKey(draft));
                setRecovery(null);
              }}
            >
              确认保留数据库版本，放弃恢复副本
            </button>
          </div>
          {recovery.revision !== draft.revision && (
            <p>
              修订号不一致，请先复制恢复正文另行核对，不能覆盖已更新的数据库版本。
            </p>
          )}
        </div>
      )}
      {recoveryReadError && (
        <div className="error" role="alert">
          {recoveryReadError}
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem(recoveryKey(draft));
              setRecoveryReadError("");
            }}
          >
            确认放弃损坏恢复副本
          </button>
        </div>
      )}
      <JudgmentEditor
        key={`${draft.id}-${editorKey}`}
        document={session.input.document}
        editable={!busy && !recovery && !recoveryReadError}
        onChange={(document) => session.edit({ ...session.input, document })}
      />
      <label htmlFor="judgment-reason">修订原因（可选）</label>
      <textarea
        id="judgment-reason"
        disabled={busy || !!recovery || !!recoveryReadError}
        value={session.input.reason}
        maxLength={4000}
        rows={2}
        onChange={(e) =>
          session.edit({ ...session.input, reason: e.target.value })
        }
      />
      <p className="muted">
        草稿始于{new Date(draft.created_at).toLocaleString("zh-CN")}
        ；最近数据库保存时间：{new Date(savedAt).toLocaleString("zh-CN")}
        。证据引用接口预留，当前未附证据。
      </p>
      <div className="toolbar">
        <button disabled={busy} type="button" onClick={() => void flush()}>
          立即保存 / 重试
        </button>
        <button
          disabled={busy || !!recovery || !!recoveryReadError}
          type="button"
          onClick={() => setConfirmFreeze(true)}
        >
          转为正式判断
        </button>
        <button
          disabled={busy}
          type="button"
          onClick={() => setConfirmDiscard(true)}
        >
          删除草稿
        </button>
      </div>
      {confirmFreeze && (
        <div className="notice">
          <p>
            转正式会先保存当前正文，再冻结为只读新版本；以后修订复制新草稿，不覆盖历史。未附证据仍可转正式。
          </p>
          <button type="button" disabled={busy} onClick={() => void freeze()}>
            确认冻结为正式版本
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmFreeze(false)}
          >
            取消
          </button>
        </div>
      )}
      {confirmDiscard && (
        <div className="notice">
          <p>
            删除只影响当前草稿与恢复副本，不影响任何正式版本；未保存的当前修改也会放弃。
          </p>
          <button type="button" disabled={busy} onClick={() => void discard()}>
            确认删除草稿
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmDiscard(false)}
          >
            取消删除
          </button>
        </div>
      )}
      {(blocker.state === "blocked" || closePending) && (
        <div className="leave-dialog" role="alert">
          <h3>存在未保存或待处理的判断内容</h3>
          <p>
            继续留在此页，或保存成功后再离开；保存失败时不会直接跳转或关闭。
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveLeave()}
          >
            保存成功后离开
          </button>
          <button
            type="button"
            onClick={() => {
              setClosePending(false);
              if (blocker.state === "blocked") blocker.reset();
            }}
          >
            留在当前草稿
          </button>
        </div>
      )}
    </section>
  );
}
