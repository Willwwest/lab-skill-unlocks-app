import React, { useId } from "react";

/*
 * Movement pictograms: one figure per kind of skill, drawn like sport
 * pictograms (round-capped limbs, a gap around the head). Each pose is a
 * set of joints on a 120 x 120 grid with the ground at y = 112. The first
 * arm and leg are the far side and render lighter for depth.
 */

const P = (x, y) => [x, y];

const poses = {
  hang: {
    head: P(60, 29),
    neck: P(60, 41),
    hip: P(60, 69),
    arms: [
      [P(51, 29), P(49, 16)],
      [P(69, 29), P(71, 16)],
    ],
    legs: [
      [P(54, 86), P(50, 102)],
      [P(65, 86), P(68, 101)],
    ],
    props: (
      <>
        <path d="M24 15 H96" strokeWidth="5" />
        <path d="M28 15 V4 M92 15 V4" strokeWidth="3.5" />
      </>
    ),
  },
  monkey: {
    head: P(60, 31),
    neck: P(55, 41),
    hip: P(48, 67),
    arms: [
      [P(51, 28), P(50, 17)],
      [P(65, 31), P(75, 19)],
    ],
    legs: [
      [P(42, 83), P(33, 94)],
      [P(54, 83), P(50, 99)],
    ],
    props: (
      <>
        <path d="M6 12 H114" strokeWidth="4" />
        {[14, 32, 50, 68, 86, 104].map((x) => (
          <path key={x} d={`M${x} 12 V18`} strokeWidth="4" />
        ))}
      </>
    ),
  },
  wallCatch: {
    head: P(75, 33),
    neck: P(79, 42),
    hip: P(72, 66),
    arms: [
      [P(80, 30), P(84, 21)],
      [P(88, 34), P(91, 23)],
    ],
    legs: [
      [P(64, 84), P(66, 101)],
      [P(81, 78), P(84, 93)],
    ],
    props: (
      <>
        <path d="M2 112 H40 Q92 112 92 60 V20 H118" strokeWidth="5" />
      </>
    ),
  },
  wallTop: {
    head: P(104, 30),
    neck: P(95, 37),
    hip: P(78, 44),
    arms: [
      [P(106, 43), P(112, 51)],
      [P(95, 46), P(96, 51)],
    ],
    legs: [
      [P(80, 60), P(84, 76)],
      [P(90, 50), P(95, 47)],
    ],
    props: (
      <>
        <path d="M2 112 H30 Q86 112 86 70 V54 H118" strokeWidth="5" />
      </>
    ),
  },
  balance: {
    head: P(60, 33),
    neck: P(60, 45),
    hip: P(60, 71),
    arms: [
      [P(46, 47), P(32, 42)],
      [P(74, 47), P(88, 42)],
    ],
    legs: [
      [P(55, 83), P(51, 94)],
      [P(66, 83), P(70, 94)],
    ],
    props: (
      <>
        <path d="M8 98 H112" strokeWidth="6" />
        <path d="M22 98 V112 M98 98 V112 M10 112 H110" strokeWidth="3.5" />
      </>
    ),
  },
  stones: {
    head: P(60, 28),
    neck: P(56, 38),
    hip: P(50, 62),
    arms: [
      [P(64, 44), P(72, 38)],
      [P(47, 47), P(40, 55)],
    ],
    legs: [
      [P(40, 75), P(30, 89)],
      [P(63, 69), P(64, 85)],
    ],
    props: (
      <>
        <path d="M14 92 H38 M14 92 V112 M38 92 V112" strokeWidth="4" />
        <path d="M54 88 H78 M54 88 V112 M78 88 V112" strokeWidth="4" />
        <path d="M92 96 H114 M92 96 V112 M114 96 V112" strokeWidth="4" />
        <path d="M4 112 H118" strokeWidth="3.5" />
      </>
    ),
  },
  landing: {
    head: P(66, 52),
    neck: P(59, 62),
    hip: P(49, 84),
    arms: [
      [P(66, 74), P(76, 82)],
      [P(70, 64), P(83, 62)],
    ],
    legs: [
      [P(61, 94), P(53, 108)],
      [P(67, 92), P(68, 108)],
    ],
    props: (
      <>
        <path d="M14 112 H106" strokeWidth="4" />
        <path d="M30 60 L36 66 M22 74 L30 76 M42 46 L44 54" strokeWidth="3" />
      </>
    ),
  },
  roll: {
    head: P(47, 91),
    neck: P(58, 98),
    spine: P(78, 96),
    hip: P(76, 74),
    arms: [
      [P(48, 104), P(40, 110)],
      [P(62, 84), P(56, 74)],
    ],
    legs: [
      [P(62, 62), P(50, 72)],
      [P(66, 58), P(52, 64)],
    ],
    props: (
      <>
        <path d="M10 112 H110" strokeWidth="4" />
        <path
          d="M98 104 C110 80 100 50 74 42"
          strokeWidth="3"
          strokeDasharray="3 7"
        />
        <path d="M78 36 L72 42 L79 47" strokeWidth="3" />
      </>
    ),
  },
  shot: {
    head: P(46, 37),
    neck: P(45, 48),
    hip: P(42, 74),
    arms: [
      [P(48, 36), P(51, 24)],
      [P(56, 39), P(63, 28)],
    ],
    legs: [
      [P(38, 89), P(36, 104)],
      [P(48, 89), P(46, 104)],
    ],
    props: (
      <>
        <path d="M108 8 V40 M90 30 H108" strokeWidth="4" />
        <path d="M92 30 L95 42 H103 L106 30" strokeWidth="2.5" />
        <circle cx="74" cy="16" r="6.5" strokeWidth="3.5" />
        <path d="M61 24 Q66 18 68 17" strokeWidth="2.5" strokeDasharray="2 4" />
        <path d="M80 18 Q86 22 88 26" strokeWidth="2.5" strokeDasharray="2 4" />
        <path d="M14 112 H106" strokeWidth="4" />
      </>
    ),
  },
  dribble: {
    head: P(52, 32),
    neck: P(48, 43),
    hip: P(40, 68),
    arms: [
      [P(39, 55), P(30, 61)],
      [P(57, 56), P(62, 70)],
    ],
    legs: [
      [P(33, 86), P(22, 98)],
      [P(52, 84), P(56, 108)],
    ],
    props: (
      <>
        <circle cx="66" cy="98" r="7" strokeWidth="3.5" />
        <path d="M64 76 V84 M70 76 V84" strokeWidth="2.5" />
        <path d="M8 112 H112" strokeWidth="4" />
      </>
    ),
  },
  course: {
    head: P(63, 25),
    neck: P(58, 35),
    hip: P(50, 58),
    arms: [
      [P(67, 40), P(76, 34)],
      [P(48, 42), P(40, 37)],
    ],
    legs: [
      [P(41, 72), P(30, 80)],
      [P(66, 60), P(80, 66)],
    ],
    props: (
      <>
        <path d="M64 88 H96 V112 M64 88 V112" strokeWidth="4" />
        <path d="M6 112 H116" strokeWidth="4" />
        <path d="M14 66 H26 M10 76 H22 M18 56 H28" strokeWidth="3" />
      </>
    ),
  },
  rings: {
    head: P(58, 44),
    neck: P(54, 53),
    hip: P(47, 78),
    arms: [
      [P(46, 43), P(40, 33)],
      [P(67, 44), P(78, 34)],
    ],
    legs: [
      [P(40, 93), P(32, 105)],
      [P(51, 94), P(45, 108)],
    ],
    props: (
      <>
        <path d="M40 0 V20 M80 0 V20" strokeWidth="3" />
        <circle cx="40" cy="27" r="7" strokeWidth="3.5" />
        <circle cx="80" cy="27" r="7" strokeWidth="3.5" />
      </>
    ),
  },
  net: {
    head: P(70, 36),
    neck: P(72, 47),
    hip: P(70, 72),
    arms: [
      [P(64, 38), P(64, 27)],
      [P(81, 45), P(84, 34)],
    ],
    legs: [
      [P(62, 84), P(66, 98)],
      [P(80, 82), P(78, 94)],
    ],
    props: (
      <>
        <path d="M44 4 H112 M44 4 V112 M112 4 V112" strokeWidth="3.5" />
        {[22, 40, 58, 76, 94].map((y) => (
          <path key={y} d={`M44 ${y} H112`} strokeWidth="2" />
        ))}
        {[61, 78, 95].map((x) => (
          <path key={x} d={`M${x} 4 V112`} strokeWidth="2" />
        ))}
      </>
    ),
  },
  precision: {
    head: P(66, 28),
    neck: P(62, 39),
    hip: P(54, 61),
    arms: [
      [P(68, 47), P(78, 51)],
      [P(72, 39), P(83, 34)],
    ],
    legs: [
      [P(60, 72), P(52, 80)],
      [P(68, 66), P(67, 80)],
    ],
    props: (
      <>
        <path d="M6 98 H30 M6 98 V112 M30 98 V112" strokeWidth="4" />
        <path d="M90 98 H114 M90 98 V112 M114 98 V112" strokeWidth="4" />
        <path d="M24 90 Q60 30 98 88" strokeWidth="2.5" strokeDasharray="3 6" />
        <path d="M2 112 H118" strokeWidth="3.5" />
      </>
    ),
  },
  rope: {
    head: P(52, 32),
    neck: P(54, 43),
    hip: P(52, 68),
    arms: [
      [P(60, 34), P(63, 22)],
      [P(63, 47), P(63, 37)],
    ],
    legs: [
      [P(48, 84), P(60, 92)],
      [P(62, 78), P(64, 94)],
    ],
    props: (
      <>
        <path
          d="M64 0 C61 30 67 60 63 90 C61 100 64 106 62 112"
          strokeWidth="4"
        />
        <path d="M30 112 H96" strokeWidth="3.5" />
      </>
    ),
  },
  vault: {
    head: P(52, 50),
    neck: P(57, 59),
    hip: P(74, 63),
    arms: [
      [P(64, 70), P(68, 81)],
      [P(55, 70), P(53, 81)],
    ],
    legs: [
      [P(88, 66), P(102, 68)],
      [P(89, 60), P(104, 58)],
    ],
    props: (
      <>
        <path
          d="M40 82 H90 M40 82 V112 M90 82 V112 M40 96 H90"
          strokeWidth="4"
        />
        <path d="M6 112 H116" strokeWidth="4" />
        <path d="M108 50 H118 M110 74 H118" strokeWidth="3" />
      </>
    ),
  },
  pass: {
    head: P(42, 34),
    neck: P(40, 45),
    hip: P(38, 71),
    arms: [
      [P(50, 57), P(62, 59)],
      [P(52, 46), P(64, 44)],
    ],
    legs: [
      [P(32, 89), P(26, 108)],
      [P(48, 88), P(56, 108)],
    ],
    props: (
      <>
        <circle cx="88" cy="50" r="7" strokeWidth="3.5" />
        <path d="M70 44 H78 M68 52 H76 M70 60 H77" strokeWidth="2.5" />
        <path d="M10 112 H110" strokeWidth="4" />
      </>
    ),
  },
  project: {
    head: P(60, 25),
    neck: P(60, 37),
    hip: P(60, 63),
    arms: [
      [P(50, 26), P(43, 13)],
      [P(70, 26), P(77, 13)],
    ],
    legs: [
      [P(52, 80), P(45, 96)],
      [P(68, 80), P(75, 96)],
    ],
    props: (
      <>
        <path
          d="M30 12 L24 6 M28 24 H20 M90 12 L96 6 M92 24 H100"
          strokeWidth="3"
        />
        <path d="M20 112 H100" strokeWidth="4" />
      </>
    ),
  },
};

const skillPose = {
  monkey: ["S01", "M01", "A01", "A02", "X01", "X08"],
  hang: ["S02", "M02", "A03", "X02", "X03"],
  wallCatch: ["S03", "M04", "A05"],
  wallTop: ["M03", "A04", "X04", "X05"],
  balance: ["S04", "M06", "A08", "X09"],
  stones: ["S05"],
  landing: ["S06"],
  roll: ["S07", "M09", "A11"],
  shot: ["S08", "M10", "A12", "X13", "X14", "X15"],
  dribble: ["S09", "M11"],
  course: ["S10", "M12", "A14", "A15", "X12", "X16", "X17"],
  rings: ["M05", "A06", "X06"],
  net: ["M07"],
  precision: ["M08", "A09", "X10"],
  rope: ["A07", "X07"],
  vault: ["A10", "X11"],
  pass: ["A13"],
  project: ["X18"],
};
const poseFor = Object.fromEntries(
  Object.entries(skillPose).flatMap(([pose, ids]) =>
    ids.map((id) => [id, pose]),
  ),
);

const line = (points) => `M${points.map((p) => p.join(" ")).join(" L")}`;
const spinePath = (p) =>
  p.spine
    ? `M${p.neck.join(" ")} Q${p.spine.join(" ")} ${p.hip.join(" ")}`
    : line([p.neck, p.hip]);

const TORSO = 12;
const ARM = 8;
const LEG = 9;
const GAP = 3.5;

export function MoveArt({ skillId, pose, className = "" }) {
  const name = pose ?? poseFor[skillId] ?? "course";
  const p = poses[name];
  const id = `move-${useId().replace(/:/g, "")}`;
  const arm = (i) => line([p.neck, ...p.arms[i]]);
  const leg = (i) => line([p.hip, ...p.legs[i]]);
  const head = <circle cx={p.head[0]} cy={p.head[1]} r={8 + GAP} fill="#000" />;
  return (
    <svg
      className={`move-art ${className}`.trim()}
      viewBox="0 0 120 120"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <defs>
        {/* Near-side shapes cut a thin gap out of what sits behind them. */}
        <mask
          id={`${id}-far`}
          maskUnits="userSpaceOnUse"
          x="-10"
          y="-10"
          width="140"
          height="140"
        >
          <rect x="-10" y="-10" width="140" height="140" fill="#fff" />
          <g stroke="#000">
            <path d={spinePath(p)} strokeWidth={TORSO + GAP * 2} />
            <path d={leg(1)} strokeWidth={LEG + GAP * 2} />
            <path d={arm(1)} strokeWidth={ARM + GAP * 2} />
          </g>
          {head}
        </mask>
        <mask
          id={`${id}-near`}
          maskUnits="userSpaceOnUse"
          x="-10"
          y="-10"
          width="140"
          height="140"
        >
          <rect x="-10" y="-10" width="140" height="140" fill="#fff" />
          {head}
        </mask>
      </defs>
      <g className="move-props">{p.props}</g>
      <g mask={`url(#${id}-far)`}>
        <path d={arm(0)} strokeWidth={ARM} />
        <path d={leg(0)} strokeWidth={LEG} />
      </g>
      <g mask={`url(#${id}-near)`}>
        <path d={spinePath(p)} strokeWidth={TORSO} />
        <path d={leg(1)} strokeWidth={LEG} />
        <path d={arm(1)} strokeWidth={ARM} />
      </g>
      <circle
        cx={p.head[0]}
        cy={p.head[1]}
        r="8"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

export const movePoses = Object.keys(poses);
