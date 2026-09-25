import { collectMesh } from "./collector.js";
import { buildPrompt, weightedAverage } from "./prompt.js";
import { chooseMeshTab } from "./tabs.js";
import { protectCache, loadCache, saveCache, clearCache } from "./cache.js";

const status = document.getElementById("status");
const results = document.getElementById("results");
const summary = document.getElementById("summary");
const retry = document.getElementById("retry");
const refresh = document.getElementById("refresh");
const clear = document.getElementById("clear");
const copy = document.getElementById("copy");
const anonymize = document.getElementById("anonymize");
const snapshotTime = document.getElementById("snapshot-time");
document.getElementById("version").textContent = `Версия ${chrome.runtime.getManifest().version}`;
let collected = null;
let busy = false;

function setStatus(message, kind = "") {
  status.textContent = message;
  status.className = `status ${kind}`.trim();
}

function make(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function render(data) {
  summary.replaceChildren();
  for (const child of data.children) {
    const box = make("section", "child", "");
    box.append(make("h2", "", child.name));
    const marksCount = child.subjects.reduce((sum, subject) => sum + subject.marks.length, 0);
    box.append(make("p", "meta", `${child.subjects.length} предметов · ${marksCount} оценок`));
    const subjects = child.subjects
      .filter((subject) => subject.marks.length >= 3)
      .sort((a, b) => (a.average ?? weightedAverage(a.marks) ?? 5) - (b.average ?? weightedAverage(b.marks) ?? 5))
      .slice(0, 3);
    box.append(make("p", "selection-caption", subjects.length === 3
      ? "Три предмета с самым низким средним баллом (от 3 оценок)"
      : "Предметы с самым низким средним баллом (от 3 оценок)"));
    for (const subject of subjects) {
      const row = make("div", "subject", "");
      row.append(make("span", "", subject.name));
      const average = subject.average ?? weightedAverage(subject.marks);
      row.append(make("strong", "", average === null ? "—" : average.toFixed(2)));
      box.append(row);
    }
    summary.append(box);
  }
}

function showSnapshot(snapshot) {
  collected = snapshot.data;
  render(collected);
  const date = new Date(snapshot.savedAt);
  snapshotTime.textContent = Number.isNaN(date.getTime())
    ? "Время сохранения неизвестно"
    : `Сохранено: ${date.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}`;
  results.hidden = false;
  retry.hidden = true;
}

function setBusy(value) {
  busy = value;
  refresh.disabled = value;
  retry.disabled = value;
  clear.disabled = value;
}

async function collect() {
  if (busy) return;
  setBusy(true);
  retry.hidden = true;
  setStatus("Ищу вкладку МЭШ…");
  try {
    const tabs = await chrome.tabs.query({ url: "https://school.mos.ru/*" });
    const selection = chooseMeshTab(tabs);
    if (selection.status === "missing") {
      setStatus(`Вкладка МЭШ не найдена. Откройте school.mos.ru и войдите в дневник.${collected ? " Сохранённый результат остаётся ниже." : " Затем нажмите «Проверить снова»."}`, "error");
      retry.hidden = Boolean(collected);
      return;
    }
    if (selection.status === "wrong_page") {
      setStatus(`МЭШ открыт, но нет вкладки с текущими оценками. Откройте «Оценки → Текущие оценки → По предмету».${collected ? " Сохранённый результат остаётся ниже." : " Затем нажмите «Проверить снова»."}`, "error");
      retry.hidden = Boolean(collected);
      return;
    }
    const tab = selection.tab;
    setStatus("Собираю оценки из МЭШ. Это может занять около минуты; оставьте окно расширения открытым.");
    const response = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: collectMesh });
    const result = response?.[0];
    if (!result || !result.result) throw new Error("МЭШ не вернул данные");
    let snapshot;
    let saved = true;
    try {
      snapshot = await saveCache(chrome.storage.local, result.result);
    } catch {
      saved = false;
      snapshot = { data: result.result, savedAt: new Date().toISOString() };
    }
    showSnapshot(snapshot);
    const count = collected.children.reduce((sum, child) => sum + child.subjects.reduce((n, subject) => n + subject.marks.length, 0), 0);
    const suffix = collected.warnings.length ? ` Есть замечания к ${collected.warnings.length} фрагментам — они указаны в запросе.` : "";
    setStatus(`Готово: ${collected.children.length} дневника, ${count} оценок.${suffix}${saved ? "" : " Не удалось сохранить результат в браузере."}`, saved ? "success" : "error");
    if (!saved) snapshotTime.textContent = "Текущий результат не сохранён";
  } catch (error) {
    setStatus(`Не удалось обновить оценки: ${error.message}.${collected ? " Сохранённый результат остаётся ниже." : " Проверьте страницу МЭШ и попробуйте снова."}`, "error");
    retry.hidden = Boolean(collected);
  } finally {
    setBusy(false);
  }
}

retry.addEventListener("click", collect);
refresh.addEventListener("click", collect);
clear.addEventListener("click", async () => {
  if (busy) return;
  setBusy(true);
  try {
    await clearCache(chrome.storage.local);
    collected = null;
    results.hidden = true;
    retry.textContent = "Собрать оценки";
    retry.hidden = false;
    setStatus("Сохранённые данные удалены. Для нового сбора откройте страницу оценок МЭШ.", "success");
  } catch (error) {
    setStatus(`Не удалось удалить сохранённые данные: ${error.message}`, "error");
  } finally {
    setBusy(false);
  }
});
copy.addEventListener("click", async () => {
  if (!collected) return;
  const prompt = buildPrompt(collected, anonymize.checked);
  try {
    await navigator.clipboard.writeText(prompt);
  } catch {
    const field = document.createElement("textarea");
    field.value = prompt;
    document.body.append(field);
    field.select();
    const copied = document.execCommand("copy");
    field.remove();
    if (!copied) {
      setStatus("Браузер не разрешил скопировать запрос. Повторите нажатие кнопки.", "error");
      return;
    }
  }
  copy.textContent = "Скопировано";
  setTimeout(() => { copy.textContent = "Скопировать запрос для ИИ"; }, 2500);
});

async function initialize() {
  try {
    await protectCache(chrome.storage.local);
  } catch { /* Storage still works if this browser lacks access-level control. */ }
  try {
    const snapshot = await loadCache(chrome.storage.local);
    if (snapshot) {
      showSnapshot(snapshot);
      setStatus("Показан последний сохранённый результат. Нажмите «Обновить результат», чтобы прочитать МЭШ заново.", "success");
      return;
    }
  } catch { /* Try a fresh collection if the saved result cannot be read. */ }
  await collect();
}

initialize();
