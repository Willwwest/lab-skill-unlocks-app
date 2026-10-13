// The living style guide, at ?ds. Every component renders from the same
// code the pages use, so this page is the reference for new screens.
import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  Button,
  Card,
  CardHead,
  ChartCard,
  Chip,
  CoachMark,
  Empty,
  Eyebrow,
  Field,
  IconButton,
  SaveBar,
  Section,
  Segmented,
  Select,
  Stat,
  StatStrip,
  Tag,
  TextArea,
} from "./index.jsx";
import {
  DailyColumns,
  Legend,
  Sparkline,
  TableView,
  series,
} from "../charts.jsx";
import "./styleguide.css";

const groups = [
  [
    "Brand",
    [
      "ink",
      "navy",
      "royal",
      "royal-deep",
      "cyan",
      "cyan-ink",
      "sky",
      "mint",
      "mint-ink",
      "lime",
      "lavender",
      "gold",
    ],
  ],
  [
    "Neutrals",
    [
      "white",
      "gray-25",
      "gray-50",
      "gray-100",
      "gray-200",
      "gray-300",
      "gray-400",
      "gray-500",
      "gray-700",
      "gray-900",
    ],
  ],
  [
    "Status (background, text)",
    [
      "good-bg",
      "good",
      "warn-bg",
      "warn",
      "bad-bg",
      "bad",
      "info-bg",
      "info",
      "care-bg",
      "care",
    ],
  ],
  [
    "How new a kid is",
    ["tenure-first", "tenure-week", "tenure-month", "tenure-sixty"],
  ],
  [
    "Data",
    [
      "data-1",
      "data-2",
      "data-muted",
      "data-goal",
      "data-alert",
      "seq-1",
      "seq-2",
      "seq-3",
      "seq-4",
      "seq-5",
      "seq-6",
    ],
  ],
  [
    "Stations",
    [
      "station-grip",
      "station-wall",
      "station-movement",
      "station-court",
      "station-course",
    ],
  ],
];

function Swatch({ name }) {
  const [value, setValue] = useState("");
  useEffect(
    () =>
      setValue(
        getComputedStyle(document.documentElement)
          .getPropertyValue(`--ds-${name}`)
          .trim(),
      ),
    [name],
  );
  return (
    <div className="sg-swatch">
      <i style={{ background: `var(--ds-${name})` }} />
      <b>{name}</b>
      <small>{value}</small>
    </div>
  );
}

const demoDays = Array.from({ length: 7 }, (_, i) => ({
  date: `2026-10-0${i + 1}`,
  class: [8, 12, 9, 14, 11, 0, 6][i],
  open: [14, 10, 18, 12, 20, 24, 9][i],
}));

export default function StyleGuide() {
  const [range, setRange] = useState(14);
  const [role, setRole] = useState("head");
  const [coach, setCoach] = useState("priya");
  const [focus, setFocus] = useState(
    "Dead hangs, rung crossings and ring swings",
  );
  const [chips, setChips] = useState(["a"]);
  const [dirty, setDirty] = useState(true);
  return (
    <div className="sg">
      <Card tone="ink" pad="lg" className="sg-hero">
        <Eyebrow tone="sky">LAB design system</Eyebrow>
        <h1>One set of parts for every screen.</h1>
        <p className="ds-note">
          Tokens in <code>src/ds/tokens.css</code>, components in{" "}
          <code>src/ds/index.jsx</code>, rules in <code>DESIGN-SYSTEM.md</code>.
          Pages compose these parts and add layout only.
        </p>
      </Card>

      <Section
        title="Color"
        note="Use the semantic names (surface, text, good, warn) in pages. Brand and gray steps exist for the components."
      >
        {groups.map(([title, names]) => (
          <div key={title} className="sg-group">
            <Eyebrow tone="muted">{title}</Eyebrow>
            <div className="sg-swatches">
              {names.map((n) => (
                <Swatch key={n} name={n} />
              ))}
            </div>
          </div>
        ))}
      </Section>

      <Section
        title="Type"
        note="Argentum for display and headings, Work Sans for everything else."
      >
        <Card>
          <div className="sg-type">
            <span className="sg-display">Skills unlocked.</span>
            <h2 className="ds-h2">Heading 2 · 28 · section titles</h2>
            <h3 className="ds-h3">Heading 3 · 20 · card titles</h3>
            <p>Body · 16 · Kids rotate through the stations in this order.</p>
            <p className="ds-note">
              Note · 14 · one line under a title that says what the block is
              for.
            </p>
            <Eyebrow>Eyebrow · 12 · above a heading</Eyebrow>
          </div>
        </Card>
      </Section>

      <Section
        title="Buttons and controls"
        note="One primary action per view. Segmented for 2 to 5 choices; a select beyond that."
      >
        <div className="sg-grid">
          <Card>
            <CardHead title="Buttons" />
            <div className="sg-row">
              <Button>Primary</Button>
              <Button variant="dark">Dark</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="secondary" size="sm" icon={Plus}>
                Small
              </Button>
            </div>
            <div className="sg-row">
              <IconButton label="Search" icon={Search} />
              <IconButton label="Remove" icon={Trash2} tone="danger" />
              <IconButton label="Close" icon={X} disabled />
            </div>
          </Card>
          <Card>
            <CardHead title="Segmented" />
            <Segmented
              label="Range"
              value={range}
              onChange={setRange}
              options={[7, 14, 28].map((n) => ({
                value: n,
                label: `${n} days`,
              }))}
            />
            <Segmented
              size="sm"
              label="Role"
              value={role}
              onChange={setRole}
              options={[
                { value: "head", label: "Head" },
                { value: "station", label: "Station" },
              ]}
            />
          </Card>
          <Card>
            <CardHead title="Fields" />
            <Field label="Coach" hint="Each coach works one block at a time.">
              <Select
                value={coach}
                onChange={setCoach}
                options={["jordan", "sam", "priya", "riley"].map((v) => ({
                  value: v,
                  label: v[0].toUpperCase() + v.slice(1),
                }))}
              />
            </Field>
            <Field label="What to work on">
              <TextArea value={focus} onChange={setFocus} />
            </Field>
          </Card>
          <Card>
            <CardHead title="Chips" note="Pick several from a list." />
            <div className="sg-row">
              {[
                ["a", "Dead hang 10s"],
                ["b", "Rung crossing"],
                ["c", "Ring swing"],
              ].map(([id, label]) => (
                <Chip
                  key={id}
                  on={chips.includes(id)}
                  onClick={() =>
                    setChips(
                      chips.includes(id)
                        ? chips.filter((x) => x !== id)
                        : [...chips, id],
                    )
                  }
                >
                  {label}
                </Chip>
              ))}
            </div>
          </Card>
        </div>
      </Section>

      <Section
        title="Tags and marks"
        note="Tags state a status or attribute. Status tones always carry words, never color alone."
      >
        <Card>
          <div className="sg-row">
            <Tag>Neutral</Tag>
            <Tag tone="outline">Outline</Tag>
            <Tag tone="info">Info</Tag>
            <Tag tone="good" icon={Check}>
              Good
            </Tag>
            <Tag tone="warn" icon={AlertTriangle}>
              Warn
            </Tag>
            <Tag tone="bad">Bad</Tag>
            <Tag tone="care">Care</Tag>
            <Tag tone="brand">Brand</Tag>
          </div>
          <div className="sg-row">
            <Tag tone="first">First visit</Tag>
            <Tag tone="week">First week</Tag>
            <Tag tone="month">First 30 days</Tag>
            <Tag tone="sixty">First 60 days</Tag>
          </div>
          <div className="sg-row">
            <CoachMark initials="CA" role="head" size={44} title="Head coach" />
            <CoachMark
              initials="CP"
              role="station"
              size={44}
              title="Station coach"
            />
            <CoachMark
              initials="CR"
              role="attendant"
              size={44}
              title="Open gym"
            />
          </div>
        </Card>
      </Section>

      <Section
        title="Surfaces"
        note="Plain cards hold content. One ink card per screen for the thing that matters most."
      >
        <div className="sg-grid">
          <Card>
            <CardHead
              title="Plain"
              note="White, hairline border, soft shadow."
            />
          </Card>
          <Card tone="muted">
            <CardHead title="Muted" note="Inset groups inside a page." />
          </Card>
          <Card tone="ink">
            <CardHead
              title="Ink"
              note="The highlight: today's class, your week."
            />
          </Card>
          <Card>
            <Empty icon={Users} title="No one on this block yet">
              Empty states say what's missing and what to do.
            </Empty>
          </Card>
        </div>
      </Section>

      <Section
        title="Numbers and charts"
        note="Stat tiles for headline numbers. Every chart sits in a ChartCard with a legend for two or more series and a table view."
      >
        <StatStrip cols={3}>
          <Stat tone="sky" label="Check-ins" value={212}>
            <Sparkline values={[18, 22, 19, 30, 24, 28, 31]} />
          </Stat>
          <Stat tone="mint" label="Desk to floor" value={4} unit="min" />
          <Stat tone="lavender" label="Skills unlocked" value={57} />
        </StatStrip>
        <ChartCard
          title="Check-ins per day"
          note="Sample data."
          legend={<Legend items={[series.class, series.open]} />}
          table={
            <TableView
              head={["Day", "Class", "Open gym"]}
              rows={demoDays.map((d) => [d.date, d.class, d.open])}
            />
          }
        >
          <DailyColumns data={demoDays} height={220} />
        </ChartCard>
      </Section>

      <Section
        title="Save bar"
        note="Forms keep edits as a draft and show one bar to save or discard them all."
      >
        <Card tone="muted">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setDirty(!dirty)}
          >
            {dirty ? "Hide" : "Show"} the save bar
          </Button>
        </Card>
      </Section>
      <SaveBar
        show={dirty}
        message="Ninja foundations changed"
        onSave={() => setDirty(false)}
        onDiscard={() => setDirty(false)}
      />
    </div>
  );
}
