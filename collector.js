// This function is injected only into an open school.mos.ru grades tab.
// Keep every helper inside it: chrome.scripting serializes the function body.
export async function collectMesh() {
  const warnings = [];
  const children = [];
  const clean = (value) => (value || "").replace(/\s+/g, " ").trim();
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function waitFor(predicate, timeout = 8000) {
    const immediate = predicate();
    if (immediate) return immediate;
    return new Promise((resolve, reject) => {
      let finished = false;
      const observer = new MutationObserver(() => {
        const result = predicate();
        if (result && !finished) {
          finished = true;
          observer.disconnect();
          clearTimeout(timer);
          resolve(result);
        }
      });
      const timer = setTimeout(() => {
        if (finished) return;
        finished = true;
        observer.disconnect();
        reject(new Error("МЭШ не обновил страницу вовремя"));
      }, timeout);
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
    });
  }

  function currentTrigger() {
    return [...document.querySelectorAll('[role="button"]')]
      .find((element) => clean(element.textContent).includes("Текущий дневник"));
  }

  function currentName() {
    const trigger = currentTrigger();
    return clean([...trigger?.querySelectorAll("p") || []]
      .find((element) => !clean(element.textContent).includes("Текущий дневник"))?.textContent);
  }

  function menuItems() {
    return [...document.querySelectorAll('[role="button"].MuiListItem-button')]
      .filter((element) => element !== currentTrigger() && !clean(element.textContent).includes("Текущий дневник"))
      .map((element) => ({ element, name: clean(element.querySelector("p")?.textContent) }))
      .filter((item) => item.name);
  }

  async function listChildren() {
    const trigger = currentTrigger();
    if (!trigger) throw new Error("Не найден переключатель дневников МЭШ");
    trigger.click();
    try {
      const items = await waitFor(() => menuItems().length && menuItems(), 3000);
      return [...new Set(items.map((item) => item.name))];
    } finally {
      currentTrigger()?.click();
    }
  }

  async function switchChild(name) {
    if (currentName() === name) return;
    currentTrigger()?.click();
    const item = await waitFor(() => menuItems().find((entry) => entry.name === name), 3000);
    item.element.click();
    await waitFor(() => currentName() === name && document.querySelector('a[href*="subject_id"]'), 10000);
    await pause(350);
  }

  function subjectCards() {
    return [...document.querySelectorAll('a[href*="subject_id"]')].map((link) => {
      const url = new URL(link.getAttribute("href"), location.origin);
      const name = clean(link.querySelector("h6")?.textContent);
      const period = clean(link.querySelector("p")?.textContent);
      const header = clean(link.parentElement?.textContent);
      const averageMatch = header.match(/\b([2-5][.,]\d{2})\b/);
      return { id: url.searchParams.get("subject_id"), name, period, average: averageMatch ? Number(averageMatch[1].replace(",", ".")) : null };
    }).filter((card) => card.id && card.name);
  }

  function marksContainer() {
    return document.querySelector('[class*="marksItems"]');
  }

  function closeSubject() {
    const close = [...document.querySelectorAll("button")]
      .find((button) => clean(button.textContent) === "Закрыть");
    close?.click();
  }

  function parseTooltip(text) {
    const kind = text.match(/Форма контроля:\s*(.*?)\s*Выставлена:/s)?.[1];
    const date = text.match(/Выставлена:\s*(\d{1,2}\s+[^\d]+?\s+\d{2}:\d{2})/s)?.[1];
    const comment = text.match(/Комментарий к оценке:\s*(.*)$/s)?.[1];
    return { kind: clean(kind), date: clean(date), comment: clean(comment) };
  }

  async function readMark(element) {
    const grade = Number(clean(element.querySelector("p")?.textContent));
    const weightText = clean([...element.querySelectorAll("span")]
      .map((span) => span.textContent).find((value) => /^\d+$/.test(clean(value))));
    const weight = Number(weightText) || 1;
    if (!Number.isInteger(grade) || grade < 2 || grade > 5) return null;

    element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, view: window }));
    element.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false, view: window }));
    let tooltip;
    try {
      tooltip = await waitFor(() => {
        const id = element.getAttribute("aria-labelledby") || element.getAttribute("aria-describedby");
        const node = id && document.getElementById(id);
        return node && clean(node.textContent).includes("Форма контроля:") ? node : null;
      }, 700);
    } catch {
      element.click();
      try {
        tooltip = await waitFor(() => {
          const id = element.getAttribute("aria-labelledby") || element.getAttribute("aria-describedby");
          return id && document.getElementById(id);
        }, 400);
      } catch { /* Keep the grade; report unavailable details. */ }
    }
    const details = tooltip ? parseTooltip(tooltip.textContent) : { kind: "", date: "", comment: "" };
    element.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body, view: window }));
    element.dispatchEvent(new MouseEvent("mouseleave", { bubbles: false, relatedTarget: document.body, view: window }));
    return { grade, weight, ...details };
  }

  async function readSubject(card) {
    const link = [...document.querySelectorAll('a[href*="subject_id"]')]
      .find((element) => new URL(element.getAttribute("href"), location.origin).searchParams.get("subject_id") === card.id);
    if (!link) throw new Error(`Не найдена карточка «${card.name}»`);
    link.click();
    const container = await waitFor(() => marksContainer(), 8000);
    const markElements = [...container.children];
    const marks = [];
    for (const element of markElements) {
      const mark = await readMark(element);
      if (mark) marks.push(mark);
    }
    const missing = marks.filter((mark) => !mark.date || !mark.kind).length;
    if (missing) warnings.push(`${card.name}: у ${missing} из ${marks.length} оценок не прочитаны дата или вид работы`);
    closeSubject();
    await waitFor(() => !marksContainer(), 3000);
    return { name: card.name, period: card.period, average: card.average, marks };
  }

  if (location.hostname !== "school.mos.ru" || !location.pathname.includes("/diary/marks/current-marks")) {
    throw new Error("Откройте в МЭШ раздел «Оценки → Текущие оценки → По предмету»");
  }
  const bySubject = [...document.querySelectorAll('[role="tab"]')].find((tab) => clean(tab.textContent) === "По предмету");
  if (bySubject && bySubject.getAttribute("aria-selected") !== "true") {
    bySubject.click();
    await waitFor(() => document.querySelector('a[href*="subject_id"]'), 8000);
  }
  await waitFor(() => document.querySelector('a[href*="subject_id"]'), 8000);

  const originalChild = currentName();
  if (!originalChild) throw new Error("Не удалось определить текущий дневник");
  const names = await listChildren();
  const orderedNames = [originalChild, ...names.filter((name) => name !== originalChild)];

  try {
    for (const name of orderedNames) {
      try {
        await switchChild(name);
        const subjects = [];
        for (const card of subjectCards()) {
          try {
            subjects.push(await readSubject(card));
          } catch (error) {
            warnings.push(`${name}, ${card.name}: ${error.message}`);
            closeSubject();
            await pause(100);
          }
        }
        children.push({ name, subjects });
      } catch (error) {
        warnings.push(`${name}: ${error.message}`);
      }
    }
  } finally {
    closeSubject();
    try { await switchChild(originalChild); }
    catch { warnings.push("Не удалось вернуть исходный дневник на экран"); }
  }

  if (!children.some((child) => child.subjects.some((subject) => subject.marks.length))) {
    throw new Error("Не удалось прочитать оценки. Проверьте, что дневник открыт и оценки видны на странице.");
  }
  return { collectedAt: new Date().toISOString(), children, warnings };
}
