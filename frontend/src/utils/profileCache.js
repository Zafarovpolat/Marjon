const PROFILE_STORAGE_PREFIX = "marjon_profile_settings:";

export function getProfileStorageKey(userId) {
  const identity = String(userId || "").trim();
  return identity ? `${PROFILE_STORAGE_PREFIX}${identity}` : "";
}

export function readStoredProfile(userId) {
  const key = getProfileStorageKey(userId);
  if (!key || typeof localStorage === "undefined") return {};

  try {
    const value = JSON.parse(localStorage.getItem(key) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

export function updateStoredProfile(userId, nextProfile) {
  const key = getProfileStorageKey(userId);
  if (!key || typeof localStorage === "undefined") return false;

  localStorage.setItem(key, JSON.stringify(nextProfile));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("marjon-profile-updated", {
      detail: { userId: String(userId), profile: nextProfile },
    }));
  }
  return true;
}
