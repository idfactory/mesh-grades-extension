export function chooseMeshTab(tabs) {
  if (!tabs.length) return { status: "missing" };
  const marks = tabs.filter((tab) => tab.url?.startsWith("https://school.mos.ru/diary/marks/current-marks"));
  if (!marks.length) return { status: "wrong_page" };
  return { status: "ready", tab: marks.find((tab) => tab.active) || marks[0] };
}
