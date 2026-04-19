const DISPLAY_NAME_PREFIX = "cmameet:display-name:";
const AUTH_STORAGE_KEY = "manus-runtime-user-info";

function getDisplayNameKey(meetingId: string) {
  return `${DISPLAY_NAME_PREFIX}${meetingId}`;
}

export function saveMeetingDisplayName(meetingId: string, displayName: string) {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedName = displayName.trim();
  if (!normalizedName) {
    return;
  }

  window.sessionStorage.setItem(getDisplayNameKey(meetingId), normalizedName);
}

export function getMeetingDisplayName(meetingId: string) {
  if (typeof window === "undefined") {
    return "";
  }

  return window.sessionStorage.getItem(getDisplayNameKey(meetingId))?.trim() ?? "";
}

export function getStoredUserDisplayName() {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    const rawValue = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!rawValue) {
      return "";
    }

    const parsed = JSON.parse(rawValue) as { name?: string | null; email?: string | null } | null;
    return parsed?.name?.trim() || parsed?.email?.trim() || "";
  } catch (error) {
    console.warn("Unable to parse stored user info:", error);
    return "";
  }
}
