import assert from "node:assert/strict";
import test from "node:test";
import { blogMetadataSchema, knowledgeMetadataSchema } from "./index";

test("资料元数据保留原有字段并默认空标签", () => {
  assert.deepEqual(knowledgeMetadataSchema.parse({}), { tags: [] });
  const value = {
    category: "公开演讲",
    updated: "2026-10-23",
    tags: ["长期主义"],
  };
  assert.deepEqual(knowledgeMetadataSchema.parse(value), value);
});

test("博客必须提供日期且不接受错误类型", () => {
  assert.equal(blogMetadataSchema.safeParse({}).success, false);
  assert.equal(blogMetadataSchema.safeParse({ date: 123 }).success, false);
  assert.deepEqual(blogMetadataSchema.parse({ date: "2026-10-23" }), {
    date: "2026-10-23",
    tags: [],
  });
  assert.equal(
    knowledgeMetadataSchema.safeParse({ tags: "错误" }).success,
    false,
  );
});
