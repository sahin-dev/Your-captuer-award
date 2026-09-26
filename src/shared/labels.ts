// Photo labels are compared case-insensitively and ignoring surrounding
// spaces, so "Nature", "nature" and " NATURE " are the same label. The first
// spelling a photo received is the one that is kept.
export const labelKey = (label: string) => label.trim().toLowerCase();

export const hasLabel = (labels: string[], label: string) => {
  const key = labelKey(label);
  return labels.some((existing) => labelKey(existing) === key);
};

// Removes repeated labels, keeping the first occurrence and the original order.
export const dedupeLabels = (labels: string[]) => {
  const seen = new Set<string>();
  return labels.filter((label) => {
    const key = labelKey(label);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};
