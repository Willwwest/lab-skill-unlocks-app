// Synthetic gym roster for the coach center: staff, families and the extra
// demo athletes. No real people. domain.js appends `extraKids` to `people`.

// Demo sign-in only. PINs on a shared device are a convenience lock, not
// authentication; production needs real staff accounts.
// Phone numbers use the 555-0100 to 555-0199 block, which is reserved for
// fiction and never assigned.
export const staff = [
  {
    id: "jordan",
    name: "Coach Jordan",
    initials: "CJ",
    pin: "1111",
    head: false,
    phone: "+16025550150",
  },
  {
    id: "sam",
    name: "Coach Sam",
    initials: "CS",
    pin: "2222",
    head: false,
    phone: "+16025550151",
  },
  {
    id: "priya",
    name: "Coach Priya",
    initials: "CP",
    pin: "3333",
    head: false,
    phone: "+16025550152",
  },
  {
    id: "alex",
    name: "Coach Alex",
    initials: "CA",
    pin: "9999",
    head: true,
    phone: "+16025550153",
  },
  {
    id: "riley",
    name: "Coach Riley",
    initials: "CR",
    pin: "4444",
    head: false,
    phone: "+16025550154",
  },
  {
    id: "morgan",
    name: "Coach Morgan",
    initials: "CM",
    pin: "5555",
    head: false,
    phone: "+16025550155",
  },
  {
    id: "dev",
    name: "Coach Dev",
    initials: "CD",
    pin: "6666",
    head: false,
    phone: "+16025550156",
  },
  // The owners: they set staffing rules, standing hours and who manages.
  // Not on the coaching roster, so never booked into a block. Phone numbers
  // and PINs are demo values.
  {
    id: "charlie",
    name: "Charlie Mitchell",
    initials: "CH",
    pin: "8888",
    head: true,
    owner: true,
    phone: "+16025550157",
  },
  {
    id: "ally",
    name: "Ally Mitchell",
    initials: "AM",
    pin: "7777",
    head: true,
    owner: true,
    phone: "+16025550158",
  },
];
// Staff who coach (everyone except the owner).
export const coaches = staff.filter((s) => !s.owner);

const palette = [
  "#C2E6DB",
  "#DCD3FC",
  "#FBE4B7",
  "#C9EEFA",
  "#FFD9D1",
  "#E2F5C4",
  "#D9E3FF",
];

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
  ["june", "June", "Alvarez", 5, "alvarez", "04-03", "My first hang"],
  ["max", "Max", "Alvarez", 8, "alvarez", "09-12", "Wall A catch"],
  ["piper", "Piper", "Lee", 5, "lee", "01-08", "Balance route"],
  ["owen", "Owen", "Lee", 7, "lee", "06-19", "Two rungs"],
  ["aria", "Aria", "Brown", 6, "brown", "10-30", "Quiet landing"],
  ["caleb", "Caleb", "Brown", 11, "brown", "12-14", "Ring transfers"],
  ["nina", "Nina", "Fischer", 12, "fischer", "07-07", "Wall C top-out"],
  ["sami", "Sami", "Reyes", 9, "reyes", "03-17", "Hang 20"],
  ["tess", "Tess", "Reyes", 12, "reyes", "05-25", "A 60-second hang"],
  ["jude", "Jude", "Price", 10, "price", "08-08", "Three at the line"],
  ["willa", "Willa", "Hart", 8, "hart", "02-22", "First combination"],
  ["rhys", "Rhys", "Hart", 5, "hart", "11-11", "My first roll"],
  ["dani", "Dani", "Ortiz", 11, "ortiz", "09-04", "Precision jumps"],
  ["gabe", "Gabe", "Ortiz", 7, "ortiz", "06-06", "Ball control"],
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
// 1 progressions (9–12), 2 and 3 open gym, 4 the mixed-age homeschool
// class. Five-year-olds only come to the homeschool class.
const classFor = (age) => (age <= 5 ? [] : age <= 8 ? [0] : [1]);
const homeschool = new Set([
  "june",
  "max",
  "piper",
  "owen",
  "aria",
  "caleb",
  "nina",
  "sami",
  "tess",
  "jude",
  "willa",
  "rhys",
  "dani",
  "gabe",
  "ava",
  "mateo",
  "zoe",
  "eli",
  "nora",
  "kai",
  "ruby",
  "isla",
  "luca",
  "hana",
  "ben",
  "sofia",
]);

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
        classes: [
          ...(["finn", "ezra", "mia"].includes(id) ? [] : classFor(age)),
          ...(homeschool.has(id) ? [4] : []),
        ],
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
  alvarez: "Rosa Alvarez",
  lee: "Daniel Lee",
  brown: "Keisha Brown",
  fischer: "Hans Fischer",
  reyes: "Marisol Reyes",
  price: "Tom Price",
  hart: "Abby Hart",
  ortiz: "Carmen Ortiz",
};

export const families = Object.entries(guardians).map(([id, guardian], i) => ({
  id,
  name: `${guardian.split(" ").slice(1).join(" ")} family`,
  guardian,
  // Printed on the family pass for manual entry at the front desk.
  pin: String(4000 + i * 137).slice(-4),
  // Every guardian who can sign in with their phone.
  guardians: [
    { name: guardian, phone: `+1602555${String(101 + i).padStart(4, "0")}` },
    ...(id === "parker"
      ? [{ name: "Jamie Parker", phone: "+16025550140" }]
      : []),
  ],
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
