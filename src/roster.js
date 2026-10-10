// Synthetic gym roster for the coach center: staff, families and the extra
// demo athletes. No real people. domain.js appends `extraKids` to `people`.

// Demo sign-in only. PINs on a shared device are a convenience lock, not
// authentication; production needs real staff accounts.
export const staff = [
  { id: "jordan", name: "Coach Jordan", initials: "CJ", pin: "1111", head: false },
  { id: "sam", name: "Coach Sam", initials: "CS", pin: "2222", head: false },
  { id: "priya", name: "Coach Priya", initials: "CP", pin: "3333", head: false },
  { id: "alex", name: "Coach Alex", initials: "CA", pin: "9999", head: true },
];

const palette = ["#C2E6DB", "#DCD3FC", "#FBE4B7", "#C9EEFA", "#FFD9D1", "#E2F5C4", "#D9E3FF"];

// [id, first, last, age, family, birthday (MM-DD), goal]
const rows = [
  ["ava", "Ava", "Nguyen", 7, "nguyen", "10-12", "Hang for 20 seconds"],
  ["mateo", "Mateo", "Nguyen", 10, "nguyen", "03-02", "Top out Wall B"],
  ["zoe", "Zoe", "Kim", 9, "kim", "07-21", "The full monkey bar route"],
  ["eli", "Eli", "Kim", 6, "kim", "10-15", "My first basket"],
  ["nora", "Nora", "Patel", 8, "patel", "01-30", "Catch Wall A"],
  ["omar", "Omar", "Haddad", 11, "haddad", "05-09", "Three at the line"],
  ["lila", "Lila", "Haddad", 7, "haddad", "11-03", "My first roll"],
  ["finn", "Finn", "O'Brien", 9, "obrien", "08-14", "Ring transfers"],
  ["sofia", "Sofia", "Garcia", 12, "garcia", "02-18", "A 60-second hang"],
  ["jonah", "Jonah", "Garcia", 8, "garcia", "10-09", "Two-obstacle combo"],
  ["amara", "Amara", "Okafor", 10, "okafor", "06-27", "Vault unlock"],
  ["kai", "Kai", "Tanaka", 6, "tanaka", "12-05", "My first crossing"],
  ["ruby", "Ruby", "Tanaka", 9, "tanaka", "04-11", "Top out Wall A"],
  ["noah", "Noah", "Schmidt", 11, "schmidt", "09-23", "Five passes"],
  ["isla", "Isla", "Moreno", 7, "moreno", "10-17", "Balance route"],
  ["ezra", "Ezra", "Cohen", 12, "cohen", "03-29", "Rope climb"],
  ["mia", "Mia", "Johnson", 8, "johnson", "08-01", "Ball control"],
  ["luca", "Luca", "Rossi", 10, "rossi", "10-24", "Precision jumps"],
  ["hana", "Hana", "Ali", 6, "ali", "05-15", "Quiet landing"],
  ["ben", "Ben", "Walker", 9, "walker", "11-28", "Hang 10"],
  ["priya-k", "Priya", "Kapoor", 11, "kapoor", "02-06", "Wall C catch"],
];

export const extraKids = rows.map(([id, first, last, age, , , goal], i) => ({
  id,
  name: `${first} ${last}`,
  first,
  last,
  age,
  initials: `${first[0]}${last.replace(/[^A-Z]/g, "")[0] ?? last[0]}`,
  color: palette[i % palette.length],
  goal,
}));

// Session indexes match club.js `sessions`: 0 foundations (6–8),
// 1 progressions (9–12), 2 and 3 open gym.
const classFor = (age) => (age <= 8 ? [0] : [1]);

const careNotes = {
  eli: "Seated shooting setup approved for basketball.",
  omar: "Inhaler in his bag at the front desk.",
  hana: "First month. Likes to watch one turn before trying.",
  ezra: "Wrist taped this week. No hanging skills until cleared.",
};

// Families without photo consent. Coaches cannot take or attach photos.
const noPhotos = new Set(["haddad", "cohen"]);

export const kidInfo = {
  theo: { last: "Parker", family: "parker", birthday: "10-14", classes: [0] },
  maya: { last: "Brooks", family: "brooks", birthday: "06-02", classes: [1] },
  leo: { last: "Rivera", family: "rivera", birthday: "01-19", classes: [0] },
  ...Object.fromEntries(
    rows.map(([id, , last, age, family, birthday]) => [
      id,
      {
        last,
        family,
        birthday,
        // A few kids come for open gym only.
        classes: ["finn", "ezra", "mia"].includes(id) ? [] : classFor(age),
      },
    ]),
  ),
};
for (const [id, note] of Object.entries(careNotes)) kidInfo[id].care = note;
for (const info of Object.values(kidInfo))
  info.photoDefault = !noPhotos.has(info.family);

const guardians = {
  parker: "Dana Parker",
  brooks: "Chris Brooks",
  rivera: "Elena Rivera",
  nguyen: "Linh Nguyen",
  kim: "Grace Kim",
  patel: "Raj Patel",
  haddad: "Samira Haddad",
  obrien: "Kate O'Brien",
  garcia: "Luis Garcia",
  okafor: "Ngozi Okafor",
  tanaka: "Ken Tanaka",
  schmidt: "Anna Schmidt",
  moreno: "Carla Moreno",
  cohen: "David Cohen",
  johnson: "Tasha Johnson",
  rossi: "Marco Rossi",
  ali: "Yusuf Ali",
  walker: "Jess Walker",
  kapoor: "Meera Kapoor",
};

export const families = Object.entries(guardians).map(([id, guardian], i) => ({
  id,
  name: `${guardian.split(" ").slice(1).join(" ")} family`,
  guardian,
  // Printed on the family pass for manual entry at the front desk.
  pin: String(4000 + i * 137).slice(-4),
  kids: Object.entries(kidInfo)
    .filter(([, info]) => info.family === id)
    .map(([kid]) => kid),
}));

export const familyOf = (childId) =>
  families.find((f) => f.id === kidInfo[childId]?.family);

// What a family pass QR encodes. Production passes need a signed,
// rotating token; this static code only identifies a demo family.
export const familyCode = (familyId) => `LABFAM:${familyId}`;
export const kidCode = (childId) => `LABKID:${childId}`;

// Resolves a scanned or typed pass to { familyId } or { childId }.
export function parsePass(text) {
  const value = String(text ?? "").trim();
  const fam = /^LABFAM:([a-z-]+)$/i.exec(value);
  if (fam && families.some((f) => f.id === fam[1].toLowerCase()))
    return { familyId: fam[1].toLowerCase() };
  const kid = /^LABKID:([a-z-]+)$/i.exec(value);
  if (kid && kidInfo[kid[1].toLowerCase()])
    return { childId: kid[1].toLowerCase() };
  const byPin = families.find((f) => f.pin === value);
  if (byPin) return { familyId: byPin.id };
  return null;
}
