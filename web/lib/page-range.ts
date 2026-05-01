export function parsePageRange(input: string, max: number): number[] {
  const out = new Set<number>();
  for (const raw of input.split(",")) {
    const part = raw.trim();
    if (!part) continue;
    const dash = part.indexOf("-");
    if (dash > 0) {
      const a = Number(part.slice(0, dash).trim());
      const b = Number(part.slice(dash + 1).trim());
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      const lo = Math.max(1, Math.min(a, b));
      const hi = Math.min(max, Math.max(a, b));
      for (let i = lo; i <= hi; i++) out.add(i);
    } else {
      const n = Number(part);
      if (Number.isFinite(n) && n >= 1 && n <= max) out.add(n);
    }
  }
  return Array.from(out).sort((a, b) => a - b);
}

export function formatPageRange(pages: Iterable<number>): string {
  const sorted = Array.from(new Set(pages)).sort((a, b) => a - b);
  if (sorted.length === 0) return "";
  const ranges: string[] = [];
  let start = sorted[0];
  let end = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      ranges.push(start === end ? `${start}` : `${start}-${end}`);
      start = end = sorted[i];
    }
  }
  ranges.push(start === end ? `${start}` : `${start}-${end}`);
  return ranges.join(",");
}
