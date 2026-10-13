import React from "react";
import { usePhoto } from "./media.js";

// A kid's profile photo, or their initials on their color.
export function Avatar({ child, photoId, size = 48, className = "" }) {
  const url = usePhoto(photoId, "thumb");
  return (
    <span
      className={`kid-avatar ${className}`.trim()}
      style={{
        width: size,
        height: size,
        background: child.color,
        fontSize: size * 0.36,
      }}
      aria-hidden="true"
    >
      {url ? <img src={url} alt="" draggable={false} /> : child.initials}
    </span>
  );
}

export function Photo({ id, size = "thumb", alt = "", className = "" }) {
  const url = usePhoto(id, size);
  return url ? (
    <img className={className} src={url} alt={alt} draggable={false} />
  ) : (
    <span
      className={`photo-missing ${className}`.trim()}
      role="img"
      aria-label={alt || "Photo unavailable"}
    />
  );
}
