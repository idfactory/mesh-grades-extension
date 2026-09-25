const CACHE_KEY = "meshGradesSnapshotV1";

function validSnapshot(value) {
  return value?.schema === 1
    && typeof value.savedAt === "string"
    && Array.isArray(value.data?.children)
    && Array.isArray(value.data?.warnings)
    && value.data.children.every((child) => typeof child.name === "string"
      && Array.isArray(child.subjects)
      && child.subjects.every((subject) => typeof subject.name === "string" && Array.isArray(subject.marks)));
}

export async function protectCache(storage) {
  if (typeof storage.setAccessLevel === "function") {
    await storage.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  }
}

export async function loadCache(storage) {
  const values = await storage.get(CACHE_KEY);
  const snapshot = values[CACHE_KEY];
  return validSnapshot(snapshot) ? snapshot : null;
}

export async function saveCache(storage, data, savedAt = new Date().toISOString()) {
  const snapshot = { schema: 1, savedAt, data };
  await storage.set({ [CACHE_KEY]: snapshot });
  return snapshot;
}

export async function clearCache(storage) {
  await storage.remove(CACHE_KEY);
}
