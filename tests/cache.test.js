import test from "node:test";
import assert from "node:assert/strict";
import { protectCache, loadCache, saveCache, clearCache } from "../cache.js";

function memoryStorage() {
  const items = {};
  return {
    async get(key) { return { [key]: items[key] }; },
    async set(values) { Object.assign(items, values); },
    async remove(key) { delete items[key]; },
    async setAccessLevel(options) { this.accessLevel = options.accessLevel; }
  };
}

const data = {
  collectedAt: "2026-09-25T12:00:00.000Z",
  children: [{ name: "Ребёнок", subjects: [{ name: "Математика", marks: [{ grade: 4, weight: 2 }] }] }],
  warnings: []
};

test("последний снимок сохраняется, заменяется и удаляется", async () => {
  const storage = memoryStorage();
  assert.equal(await loadCache(storage), null);
  await protectCache(storage);
  assert.equal(storage.accessLevel, "TRUSTED_CONTEXTS");
  await saveCache(storage, data, "2026-09-25T12:01:00.000Z");
  assert.deepEqual((await loadCache(storage)).data, data);
  await saveCache(storage, { ...data, children: [] }, "2026-09-25T13:00:00.000Z");
  assert.deepEqual((await loadCache(storage)).data.children, []);
  await clearCache(storage);
  assert.equal(await loadCache(storage), null);
});

test("повреждённый снимок не показывается", async () => {
  const storage = memoryStorage();
  await storage.set({ meshGradesSnapshotV1: { schema: 1, savedAt: "date", data: { children: [{}], warnings: [] } } });
  assert.equal(await loadCache(storage), null);
});
