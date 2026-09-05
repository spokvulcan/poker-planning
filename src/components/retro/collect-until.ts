/**
 * The cards-due field's value (ADR-0020): a `<input type="date">` string as
 * the end of that local day, or undefined when blank. The create form and
 * the settings dialog share the one reading of "due on the 10th".
 */
export function parseCollectUntil(value: string): number | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d, 23, 59, 59).getTime();
}
