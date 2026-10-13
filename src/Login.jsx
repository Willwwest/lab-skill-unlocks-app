import React, { useEffect, useRef, useState } from "react";
import { demoCodes, formatPhone, normalizePhone } from "./auth.js";
import "./auth.css";

// Shown on the sign-in page so the demo can be tried without real texts.
const demoAccounts = [
  { phone: "+16025550101", label: "Dana Parker", note: "Parent of Theo" },
  { phone: "+16025550102", label: "Chris Brooks", note: "Parent of Maya" },
  {
    phone: "+16025550150",
    label: "Coach Jordan",
    note: "Head coach, homeschool class",
  },
  {
    phone: "+16025550151",
    label: "Coach Sam",
    note: "Station coach, homeschool class",
  },
  {
    phone: "+16025550152",
    label: "Coach Priya",
    note: "Open gym and stations",
  },
  { phone: "+16025550153", label: "Coach Alex", note: "Gym manager" },
  { phone: "+16025550157", label: "Charlie Mitchell", note: "Owner" },
  { phone: "+16025550158", label: "Ally Mitchell", note: "Owner" },
];

export default function Login({ onSignedIn, storage = localStorage }) {
  const [step, setStep] = useState("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const codeRef = useRef(null);
  const phoneRef = useRef(null);

  useEffect(() => {
    if (step !== "code") return;
    codeRef.current?.focus();
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [step]);
  useEffect(() => {
    if (step === "phone") phoneRef.current?.focus();
  }, [step]);

  const send = (e) => {
    e?.preventDefault();
    setError("");
    try {
      const r = demoCodes.send(storage, phone);
      setNow(Date.now());
      setSent(r);
      setCode("");
      setStep("code");
    } catch (err) {
      setError(err.message);
    }
  };
  const verify = (value) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      onSignedIn(demoCodes.verify(storage, phone, value));
    } catch (err) {
      setError(err.message);
      setCode("");
      codeRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };
  const wait = sent ? Math.max(0, Math.ceil((sent.resendAt - now) / 1000)) : 0;

  return (
    <div className="signin">
      <div className="signin-inner">
        <img
          className="signin-logo"
          src={`${import.meta.env.BASE_URL}lab-white.svg`}
          alt="The LAB"
        />
        <section className="signin-card" aria-labelledby="signin-title">
          {step === "phone" ? (
            <form onSubmit={send} noValidate>
              <h1 id="signin-title">Sign in</h1>
              <p className="signin-lead">
                We’ll text you a 6-digit code. No password needed.
              </p>
              <div className="signin-field">
                <label htmlFor="signin-phone">Phone number</label>
                <span className="signin-phone">
                  <span aria-hidden="true">+1</span>
                  <input
                    id="signin-phone"
                    ref={phoneRef}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    placeholder="(602) 555-0101"
                    value={phone}
                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                    aria-describedby={error ? "signin-error" : undefined}
                  />
                </span>
              </div>
              {error && (
                <p className="signin-error" id="signin-error" role="alert">
                  {error}
                </p>
              )}
              <button
                className="button cyan signin-go"
                disabled={!normalizePhone(phone)}
              >
                Text me a code
              </button>
              <p className="signin-fine">
                You’ll get one text per sign-in. Message and data rates may
                apply.
              </p>
            </form>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                verify(code);
              }}
              noValidate
            >
              <h1 id="signin-title">Enter your code</h1>
              <p className="signin-lead">
                Sent to <b>{formatPhone(sent.phone)}</b>.{" "}
                <button
                  type="button"
                  className="signin-link"
                  onClick={() => {
                    setStep("phone");
                    setError("");
                  }}
                >
                  Change number
                </button>
              </p>
              <p className="signin-demo" role="status">
                Demo: no text is sent. Your code is <b>{sent.code}</b>
              </p>
              <label className="signin-field">
                <span>6-digit code</span>
                <input
                  ref={codeRef}
                  className="signin-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                    setCode(v);
                    if (v.length === 6) verify(v);
                  }}
                  aria-describedby={error ? "signin-error" : undefined}
                />
              </label>
              {error && (
                <p className="signin-error" id="signin-error" role="alert">
                  {error}
                </p>
              )}
              <button
                className="button cyan signin-go"
                disabled={code.length !== 6 || busy}
              >
                Sign in
              </button>
              <button
                type="button"
                className="signin-link signin-resend"
                disabled={wait > 0}
                onClick={send}
              >
                {wait > 0 ? `Send a new code in ${wait}s` : "Send a new code"}
              </button>
            </form>
          )}
        </section>
        {step === "phone" && (
          <details className="signin-accounts">
            <summary>Demo accounts</summary>
            <ul>
              {demoAccounts.map((a) => (
                <li key={a.phone}>
                  <button
                    type="button"
                    onClick={() => {
                      setPhone(formatPhone(a.phone));
                      setError("");
                    }}
                  >
                    <b>{a.label}</b>
                    <span>
                      {a.note} · {formatPhone(a.phone)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}
