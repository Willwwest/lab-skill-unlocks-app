// Phone-number sign-in. Parents and coaches sign in with a 6-digit code
// sent by text; the number decides who they are. This file holds the
// rules plus a demo code service that shows the code on screen instead of
// texting it. A real service (for example Supabase phone auth with Twilio
// Verify) replaces `demoCodes` and keeps the same calls.
import { families, staff } from "./roster.js";

export const SESSION_KEY = "lab-session";
const CODE_KEY = "lab-signin-code";
export const SESSION_DAYS = 90;
const CODE_MINUTES = 5;
const RESEND_SECONDS = 30;
const MAX_TRIES = 5;
const LOCK_MINUTES = 10;

// "+16025550101" from "(602) 555-0101", "602.555.0101" or "1 602 555 0101".
export function normalizePhone(input) {
  const digits = String(input ?? "").replace(/\D/g, "");
  const ten =
    digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (ten.length !== 10 || /^[01]/.test(ten)) return null;
  return `+1${ten}`;
}

// "(602) 555-0101"; partial input is formatted as it is typed.
export function formatPhone(input) {
  let d = String(input ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  d = d.slice(0, 10);
  if (d.length < 4) return d;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

// Who a phone number belongs to: a guardian on a family, or a staff member.
export function findAccount(phone) {
  const s = staff.find((x) => x.phone === phone);
  if (s)
    return {
      kind: "staff",
      id: `staff:${s.id}`,
      name: s.name,
      staffId: s.id,
      head: s.head,
      owner: !!s.owner,
      phone,
    };
  for (const f of families) {
    const g = f.guardians.find((x) => x.phone === phone);
    if (g)
      return {
        kind: "guardian",
        id: `guardian:${phone}`,
        name: g.name,
        familyId: f.id,
        phone,
      };
  }
  return null;
}

export function loadSession(storage, now = Date.now()) {
  try {
    const s = JSON.parse(storage.getItem(SESSION_KEY));
    if (!s || typeof s.phone !== "string" || !(s.expires > now)) return null;
    // Re-read the account so a removed number signs out on next load.
    const account = findAccount(s.phone);
    return account ? { ...account, since: s.since, expires: s.expires } : null;
  } catch {
    return null;
  }
}

export function signOut(storage) {
  try {
    storage.removeItem(SESSION_KEY);
  } catch {
    // Nothing stored.
  }
}

const readCode = (storage) => {
  try {
    return JSON.parse(storage.getItem(CODE_KEY)) ?? null;
  } catch {
    return null;
  }
};
const writeCode = (storage, v) => {
  try {
    storage.setItem(CODE_KEY, JSON.stringify(v));
  } catch {
    // Without storage the code only lives for this page.
  }
};

// Demo stand-in for the texting service. `code` is returned so the page can
// show it; a real service never returns the code.
export const demoCodes = {
  send(storage, input, now = Date.now(), random = Math.random) {
    const phone = normalizePhone(input);
    if (!phone) throw Error("Enter a 10-digit US phone number.");
    if (!findAccount(phone))
      throw Error(
        "We couldn’t find that number. Ask the front desk to add it to your family’s account.",
      );
    const prev = readCode(storage);
    if (prev?.phone === phone && prev.lockedUntil > now)
      throw Error(
        `Too many tries. Try again in ${Math.ceil((prev.lockedUntil - now) / 60000)} minutes.`,
      );
    if (prev?.phone === phone && now - prev.sentAt < RESEND_SECONDS * 1000)
      throw Error(
        `Wait ${Math.ceil((RESEND_SECONDS * 1000 - (now - prev.sentAt)) / 1000)} seconds to send another code.`,
      );
    const code = String(Math.floor(random() * 900000) + 100000);
    writeCode(storage, {
      phone,
      code,
      sentAt: now,
      expires: now + CODE_MINUTES * 60000,
      tries: 0,
      lockedUntil: 0,
    });
    return { phone, code, resendAt: now + RESEND_SECONDS * 1000 };
  },
  verify(storage, input, entered, now = Date.now()) {
    const phone = normalizePhone(input);
    const c = readCode(storage);
    if (!c || c.phone !== phone)
      throw Error("Send a code to this number first.");
    if (c.lockedUntil > now)
      throw Error(
        `Too many tries. Try again in ${Math.ceil((c.lockedUntil - now) / 60000)} minutes.`,
      );
    if (now > c.expires) throw Error("That code expired. Send a new one.");
    if (String(entered).trim() !== c.code) {
      c.tries += 1;
      if (c.tries >= MAX_TRIES) c.lockedUntil = now + LOCK_MINUTES * 60000;
      writeCode(storage, c);
      const left = MAX_TRIES - c.tries;
      throw Error(
        left > 0
          ? `That code doesn’t match. ${left} ${left === 1 ? "try" : "tries"} left.`
          : `Too many tries. Try again in ${LOCK_MINUTES} minutes.`,
      );
    }
    try {
      storage.removeItem(CODE_KEY);
    } catch {
      // Already gone.
    }
    const account = findAccount(phone);
    const session = {
      phone,
      since: now,
      expires: now + SESSION_DAYS * 86400000,
    };
    try {
      storage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      // Signed in for this page only.
    }
    return { ...account, since: session.since, expires: session.expires };
  },
};
