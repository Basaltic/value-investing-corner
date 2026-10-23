import assert from "node:assert/strict";
import test from "node:test";
import { getNativeInfo } from "./native";

test("浏览器预览不调用原生命令", async () => {
  let called = false;
  const result = await getNativeInfo(false, async () => {
    called = true;
    throw new Error("不应调用");
  });
  assert.equal(called, false);
  assert.deepEqual(result, { kind: "browser" });
});

test("原生窗口返回应用版本且处理连接失败", async () => {
  assert.deepEqual(
    await getNativeInfo(true, async () => ({
      name: "价投小角落",
      version: "0.1.0",
    })),
    {
      kind: "native",
      name: "价投小角落",
      version: "0.1.0",
    },
  );
  const result = await getNativeInfo(true, async () => {
    throw new Error("连接失败");
  });
  assert.deepEqual(result, { kind: "error", message: "连接失败" });
});
