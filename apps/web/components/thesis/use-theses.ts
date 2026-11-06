"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  emptySnapshot,
  type ThesisAction,
  type ThesisSnapshot,
} from "@/lib/thesis/model";
import {
  loadTheses,
  openThesisDatabase,
  persistThesisAction,
} from "@/lib/thesis/storage";

export function useTheses() {
  const [state, setState] = useState<ThesisSnapshot>(emptySnapshot);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(0);
  const db = useRef<IDBDatabase | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const mounted = useRef(false);
  useEffect(() => {
    let cancelled = false;
    mounted.current = true;
    const initialize = async () => {
      try {
        const connection = await openThesisDatabase();
        if (cancelled) {
          connection.close();
          return;
        }
        db.current = connection;
        const data = await loadTheses(connection);
        if (!cancelled) {
          setState(data);
          setReady(true);
        }
      } catch (cause) {
        if (!cancelled) setError(message(cause));
      }
    };
    void initialize();
    const refresh = () => {
      queue.current = queue.current
        .catch(() => undefined)
        .then(async () => {
          if (db.current && !cancelled) {
            try {
              setState(await loadTheses(db.current));
            } catch (cause) {
              setError(message(cause));
            }
          }
        });
    };
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      mounted.current = false;
      window.removeEventListener("focus", refresh);
    };
  }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (pending) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);
  const act = useCallback((action: ThesisAction): Promise<boolean> => {
    setPending((value) => value + 1);
    const result = queue.current
      .catch(() => undefined)
      .then(async () => {
        try {
          if (!db.current) throw new Error("本地数据库尚未就绪，请稍后重试。");
          const data = await persistThesisAction(db.current, action);
          if (mounted.current) {
            setState(data);
            setError("");
          }
          return true;
        } catch (cause) {
          if (mounted.current) setError(message(cause));
          return false;
        } finally {
          if (mounted.current) setPending((value) => value - 1);
        }
      });
    queue.current = result;
    return result;
  }, []);
  return { state, ready, error, pending, act };
}
function message(cause: unknown) {
  return cause instanceof Error
    ? cause.message
    : "本地存储操作失败，输入未清空。";
}
