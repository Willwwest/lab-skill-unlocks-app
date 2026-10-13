import React, { useEffect, useMemo, useRef, useState } from "react";
import { Camera, RefreshCw, X } from "lucide-react";
import jsQR from "jsqr";

// Live camera stream for a <video>. Needs HTTPS (or localhost); returns an
// error string instead when the browser cannot open a camera.
function useCamera(facing, active = true) {
  const video = useRef(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!active) return;
    let stream;
    let live = true;
    setReady(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        window.isSecureContext
          ? "This browser cannot open the camera."
          : "The camera needs a secure (https) link.",
      );
      return;
    }
    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })
      .then((s) => {
        if (!live) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        setError("");
        if (video.current) {
          video.current.srcObject = s;
          video.current.play().catch(() => {});
        }
      })
      .catch((e) =>
        setError(
          e?.name === "NotAllowedError"
            ? "Camera access was blocked. Allow it in the browser settings."
            : "No camera is available.",
        ),
      );
    return () => {
      live = false;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [facing, active]);
  return { video, error, ready, setReady };
}

const grab = (video) => {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);
  return canvas;
};

/*
 * Full-screen camera for feat and celebration photos. Falls back to the
 * system camera / photo picker when a live stream is not possible.
 */
export function CameraSheet({
  title,
  subtitle,
  onCapture,
  onClose,
  initialFacing = "environment",
}) {
  const [facing, setFacing] = useState(initialFacing);
  const [shot, setShot] = useState(null);
  const [busy, setBusy] = useState(false);
  const { video, error, ready, setReady } = useCamera(facing, !shot);
  const file = useRef(null);
  const preview = useMemo(
    () => (shot ? URL.createObjectURL(shot) : null),
    [shot],
  );
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const snap = () => {
    const v = video.current;
    if (!v?.videoWidth) return;
    grab(v).toBlob((b) => b && setShot(b), "image/jpeg", 0.92);
    navigator.vibrate?.(10);
  };
  return (
    <div className="cam" role="dialog" aria-modal="true" aria-label={title}>
      <header className="cam-head">
        <div>
          <strong>{title}</strong>
          {subtitle && <span>{subtitle}</span>}
        </div>
        <button
          className="cam-icon"
          aria-label="Close camera"
          onClick={onClose}
        >
          <X size={22} />
        </button>
      </header>
      <div className="cam-stage">
        {shot ? (
          <img src={preview} alt="Photo preview" />
        ) : error ? (
          <div className="cam-fallback">
            <p>{error}</p>
            <button
              className="button cyan"
              onClick={() => file.current?.click()}
            >
              Open the device camera
            </button>
          </div>
        ) : (
          <video
            ref={video}
            playsInline
            muted
            onLoadedData={() => setReady(true)}
            className={facing === "user" ? "mirror" : ""}
          />
        )}
        <input
          ref={file}
          type="file"
          accept="image/*"
          capture={facing}
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setShot(f);
            e.target.value = "";
          }}
        />
      </div>
      <footer className="cam-foot">
        {shot ? (
          <>
            <button
              className="button outline-light"
              onClick={() => setShot(null)}
              disabled={busy}
            >
              Retake
            </button>
            <button
              className="button cyan"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onCapture(shot);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Saving…" : "Use photo"}
            </button>
          </>
        ) : (
          <>
            <button className="cam-text" onClick={() => file.current?.click()}>
              Library
            </button>
            <button
              className="cam-shutter"
              aria-label="Take photo"
              disabled={!!error || !ready}
              onClick={snap}
            >
              <Camera size={28} />
            </button>
            <button
              className="cam-icon"
              aria-label="Switch camera"
              disabled={!!error}
              onClick={() =>
                setFacing(facing === "user" ? "environment" : "user")
              }
            >
              <RefreshCw size={22} />
            </button>
          </>
        )}
      </footer>
    </div>
  );
}

/*
 * QR reader for family passes and kid passes. Uses the native
 * BarcodeDetector where it exists and jsQR elsewhere (iOS Safari).
 * Typed codes and family PINs work without a camera.
 */
export function Scanner({
  onCode,
  hint,
  facing = "environment",
  compact = false,
}) {
  const { video, error } = useCamera(facing);
  const [typed, setTyped] = useState("");
  const last = useRef({ code: "", at: 0 });
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  useEffect(() => {
    if (error) return;
    let id;
    let stop = false;
    const detector =
      "BarcodeDetector" in window
        ? new window.BarcodeDetector({ formats: ["qr_code"] })
        : null;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const emit = (code) => {
      const now = Date.now();
      // The same code held in front of the camera fires once every 3 s.
      if (code === last.current.code && now - last.current.at < 3000) return;
      last.current = { code, at: now };
      navigator.vibrate?.(20);
      onCodeRef.current(code);
    };
    const tick = async () => {
      if (stop) return;
      const v = video.current;
      if (v?.readyState >= 2 && v.videoWidth) {
        try {
          if (detector) {
            const found = await detector.detect(v);
            if (found[0]?.rawValue) emit(found[0].rawValue);
          } else {
            const k = Math.min(1, 640 / v.videoWidth);
            canvas.width = v.videoWidth * k;
            canvas.height = v.videoHeight * k;
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const found = jsQR(img.data, img.width, img.height, {
              inversionAttempts: "dontInvert",
            });
            if (found?.data) emit(found.data);
          }
        } catch {
          // A frame that fails to decode is normal; try the next one.
        }
      }
      id = setTimeout(tick, 180);
    };
    tick();
    return () => {
      stop = true;
      clearTimeout(id);
    };
  }, [error, video]);
  return (
    <div className={`scanner ${compact ? "compact" : ""}`.trim()}>
      <div className="scanner-view">
        {error ? (
          <p className="scanner-error">{error}</p>
        ) : (
          <>
            <video
              ref={video}
              playsInline
              muted
              autoPlay
              className={facing === "user" ? "mirror" : ""}
            />
            <span className="scanner-frame" aria-hidden="true" />
          </>
        )}
      </div>
      {hint && <p className="scanner-hint">{hint}</p>}
      <form
        className="scanner-manual"
        onSubmit={(e) => {
          e.preventDefault();
          if (typed.trim()) onCode(typed.trim());
          setTyped("");
        }}
      >
        <input
          aria-label="Pass code or family PIN"
          placeholder="Family PIN or pass code"
          inputMode="text"
          autoComplete="off"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
        <button className="button navy compact">Enter</button>
      </form>
    </div>
  );
}
