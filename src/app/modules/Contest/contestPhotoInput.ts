const normalizeStringValues = (values: unknown[]): string[] => {
  return values
    .flatMap((value) => {
      if (typeof value !== "string") {
        return [];
      }

      const trimmed = value.trim();
      return trimmed ? [trimmed] : [];
    });
};

/**
 * Multer leaves text fields as strings. Clients commonly send `photoIds` as a
 * JSON-encoded array in multipart/form-data, while repeated form fields arrive
 * as a string array. Normalize both forms, plus the legacy single-id form.
 */
export const parseContestPhotoIds = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return Array.from(new Set(normalizeStringValues(value)));
  }

  if (typeof value !== "string") {
    return [];
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return Array.from(new Set(normalizeStringValues(parsed)));
    }
    if (typeof parsed === "string" && parsed.trim()) {
      return [parsed.trim()];
    }
  } catch {
    // A plain ObjectId is a valid legacy payload and is handled below.
  }

  return [trimmed];
};
