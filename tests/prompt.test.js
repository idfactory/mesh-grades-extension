import test from "node:test";
import assert from "node:assert/strict";
import { buildPrompt, weightedAverage } from "../prompt.js";

test("средний балл учитывает вес контрольной", () => {
  const marks = [
    { grade: 5, weight: 1 },
    { grade: 3, weight: 2 },
    { grade: 4, weight: 1 }
  ];
  assert.equal(weightedAverage(marks), 3.75);
});

test("запрос скрывает имена по умолчанию и сохраняет детали", () => {
  const data = {
    children: [{
      name: "Иван Петров",
      subjects: [{
        name: "Математика",
        period: "I триместр",
        average: 4,
        marks: [{ date: "23 сент. 00:00", grade: 4, weight: 2, kind: "Контрольная работа", comment: "Иван Петров: задачи" }]
      }]
    }],
    warnings: ["Иван Петров: часть дат не прочитана"]
  };
  const anonymous = buildPrompt(data);
  assert.match(anonymous, /Ребёнок 1/);
  assert.doesNotMatch(anonymous, /Иван Петров/);
  assert.match(anonymous, /23 сент\. 00:00; оценка 4; вес 2; Контрольная работа; комментарий: Ребёнок 1: задачи/);
  assert.match(anonymous, /Ребёнок 1: часть дат не прочитана/);
  assert.match(buildPrompt(data, false), /Иван Петров/);
});
