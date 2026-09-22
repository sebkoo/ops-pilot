export type Bucket = { id: string; weight: number };

// Split `total` minor units across weighted buckets so the parts add back up to `total` exactly.
// Largest-remainder method: floor every bucket, then hand the leftover units to the biggest remainders.
// Rounding each bucket on its own is the classic invoice bug:
// three lines at 10% off can each round up and beat the invoice total by a cent.
// Refunds are built on these numbers, so a cent here becomes a reconciliation ticket
export function spread(total: number, buckets: Bucket[]): Record<string, number> {
  const totalWeight = buckets.reduce((sum, b) => sum + b.weight, 0);
  if (total <= 0 || totalWeight <= 0) return {};
  const out: Record<string, number> = {};
  const remainders: Array<{ id: string; remainder: number }> = [];
  let handedOut = 0;

  for (const bucket of buckets) {
    const scaled = total * bucket.weight;
    const share = Math.floor(scaled / totalWeight);
    out[bucket.id] = share;
    handedOut += share;
    remainders.push({
      id: bucket.id,
      remainder: scaled % totalWeight,
    });
  }

  remainders.sort((a, b) =>
    a.remainder === b.remainder ? (a.id < b.id ? -1 : 1) : b.remainder - a.remainder,
  );

  const leftover = total - handedOut;
  for (const { id } of remainders.slice(0, leftover)) {
    out[id] = (out[id] ?? 0) + 1;
  }

  const check = Object.values(out).reduce((sum, v) => sum + v, 0);
  if (check !== total) throw new Error(`allocation lost units: ${check} != ${total}`);

  return out;
}
