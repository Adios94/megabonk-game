/** 从候选点中无放回随机抽取至多 count 个。 */
export function pickRandomSubset<T>(items: readonly T[], count: number): T[] {
  if (count <= 0 || items.length === 0) return [];
  const copy = [...items];
  shuffleInPlace(copy);
  return copy.slice(0, Math.min(count, copy.length));
}

/** 从候选点中随机抽取 1 个；无候选时返回 undefined。 */
export function pickRandomOne<T>(items: readonly T[]): T | undefined {
  return pickRandomSubset(items, 1)[0];
}

function shuffleInPlace<T>(items: T[]): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}
