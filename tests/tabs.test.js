import test from "node:test";
import assert from "node:assert/strict";
import { chooseMeshTab } from "../tabs.js";

test("сообщает, когда вкладки МЭШ нет", () => {
  assert.deepEqual(chooseMeshTab([]), { status: "missing" });
});

test("отличает открытый МЭШ от страницы оценок", () => {
  assert.deepEqual(chooseMeshTab([{ id: 1, url: "https://school.mos.ru/" }]), { status: "wrong_page" });
});

test("выбирает активную вкладку оценок", () => {
  const tabs = [
    { id: 1, url: "https://school.mos.ru/diary/marks/current-marks?view=by_subject" },
    { id: 2, active: true, url: "https://school.mos.ru/diary/marks/current-marks?view=by_subject" }
  ];
  assert.equal(chooseMeshTab(tabs).tab.id, 2);
});
