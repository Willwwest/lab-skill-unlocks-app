// Three-way merge for shared documents (staffing, schedule, time, pay…).
//
// Two people change the same document from the same starting point; the
// server holds one change and refuses the other as stale. Merge the local
// change into the server's copy:
//   - objects merge key by key;
//   - arrays of records with an `id` merge record by record (both sides'
//     additions kept, a record removed on either side stays removed);
//   - anything else: if only one side changed it, take that side; if both
//     did, the local change wins (it is the newer edit).

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);
const isRecords = (x) =>
  Array.isArray(x) && x.every((r) => isObj(r) && r.id !== undefined);

export function merge3(base, local, remote) {
  if (same(local, base)) return remote;
  if (same(remote, base) || same(local, remote)) return local;
  if (isObj(local) && isObj(remote)) {
    const b = isObj(base) ? base : {};
    const out = {};
    for (const k of new Set([...Object.keys(local), ...Object.keys(remote)])) {
      const inL = k in local;
      const inR = k in remote;
      if (inL && inR) out[k] = merge3(b[k], local[k], remote[k]);
      // Deleted on one side and untouched on the other: stays deleted.
      else if (inL) {
        if (!(k in b) || !same(b[k], local[k])) out[k] = local[k];
      } else if (!(k in b) || !same(b[k], remote[k])) out[k] = remote[k];
    }
    return out;
  }
  if (isRecords(local) && isRecords(remote)) {
    const b = new Map((isRecords(base) ? base : []).map((r) => [r.id, r]));
    const l = new Map(local.map((r) => [r.id, r]));
    const r = new Map(remote.map((x) => [x.id, x]));
    const out = [];
    for (const rec of remote) {
      if (l.has(rec.id)) out.push(merge3(b.get(rec.id), l.get(rec.id), rec));
      // Removed locally, unchanged remotely: drop it.
      else if (!b.has(rec.id) || !same(b.get(rec.id), rec)) out.push(rec);
    }
    for (const rec of local)
      if (!r.has(rec.id) && !b.has(rec.id)) out.push(rec);
    return out;
  }
  return local;
}
