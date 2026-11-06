import {
  applyThesisAction,
  emptySnapshot,
  snapshotSchema,
  type ThesisAction,
  type ThesisSnapshot,
} from "./model";

const databaseName = "value-investing-corner.theses.v1";
const storeName = "state";
const recordKey = "theses";
function decode(value: unknown): ThesisSnapshot {
  if (value === undefined) return emptySnapshot();
  const parsed = snapshotSchema.safeParse(value);
  if (!parsed.success)
    throw new Error(
      "本地记录格式异常或来自不兼容版本。原数据未被覆盖，请勿清除浏览器数据。",
    );
  return parsed.data;
}
export function openThesisDatabase(
  factory: IDBFactory = indexedDB,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(databaseName, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(storeName);
    };
    request.onerror = () =>
      reject(new Error("无法打开本地数据库，请检查浏览器是否允许网站存储。"));
    request.onblocked = () =>
      reject(new Error("数据库升级被其他页面阻塞，请关闭同站旧页面后重试。"));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}
export function loadTheses(db: IDBDatabase): Promise<ThesisSnapshot> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).get(recordKey);
    request.onsuccess = () => {
      try {
        resolve(decode(request.result));
      } catch (error) {
        reject(error);
      }
    };
    request.onerror = () =>
      reject(new Error("读取本地记录失败，未修改原数据。"));
    tx.onabort = () => reject(new Error("读取本地记录被中断，请重试。"));
  });
}
// Read-modify-write in one transaction: simultaneous tabs never overwrite an old snapshot.
export function persistThesisAction(
  db: IDBDatabase,
  action: ThesisAction,
): Promise<ThesisSnapshot> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    let next: ThesisSnapshot;
    let failure: unknown;
    const request = store.get(recordKey);
    request.onsuccess = () => {
      try {
        next = applyThesisAction(decode(request.result), action);
        store.put(next, recordKey);
      } catch (error) {
        failure = error;
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve(next);
    tx.onabort = () =>
      reject(
        failure ??
          new Error(
            "保存失败：浏览器存储不可用或空间不足。输入已保留，请重试；请勿刷新或离开页面。",
          ),
      );
    tx.onerror = () => {
      failure ??= new Error(
        "保存失败：浏览器存储不可用或空间不足。输入已保留，请重试。",
      );
    };
  });
}
