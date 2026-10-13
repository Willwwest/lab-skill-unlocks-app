// Charts for the coach floor, drawn with Apache ECharts (SVG renderer).
// House rules: bars no wider than 24px with 4px rounded data ends, 2px
// lines, a 2px surface gap between stacked segments, hairline grids, text in
// text colors, a tooltip on every mark, and a table view beside each chart.
import React, { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts/core";
import {
  BarChart,
  HeatmapChart,
  LineChart,
  ScatterChart,
} from "echarts/charts";
import {
  AriaComponent,
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { color as c, data as dv, font } from "./ds/tokens.js";
import {
  calendarDayLabel,
  calendarWeekday,
  calendarWeekdayNarrow,
} from "./gym-time.js";
// Chart host, legend, scale and table styles.
import "./insights.css";

echarts.use([
  BarChart,
  HeatmapChart,
  LineChart,
  ScatterChart,
  AriaComponent,
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
  SVGRenderer,
]);

// Every color comes from the design tokens (ds/tokens.js).
export const series = {
  class: { label: "Class", color: dv.series[0] },
  open: { label: "Open gym", color: dv.series[1] },
};
const INK = c.gray900;
const TEXT2 = c.gray700;
const MUTED = c.gray500;
const GRID = c.gray100;
const SURFACE = c.white;
const DEEMPH = dv.muted;
const FONT = font.body;
// One-hue sequential ramp for the heatmap, light to dark.
const RAMP = dv.seq;

const fmtDay = calendarDayLabel;
const weekday = calendarWeekday;

const tooltip = {
  backgroundColor: c.ink,
  borderWidth: 0,
  padding: [10, 12],
  textStyle: { color: c.white, fontFamily: FONT, fontSize: 13 },
  extraCssText: "border-radius:12px;box-shadow:0 12px 32px rgba(2,3,15,0.35);",
};
const axisText = {
  color: MUTED,
  fontFamily: FONT,
  fontSize: 12,
  fontWeight: 600,
};
// Tooltip rows: value first, label after, a short line key in the series color.
const row = (color, value, label) =>
  `<div style="display:flex;align-items:center;gap:6px;margin-top:4px"><span style="display:inline-block;width:12px;height:3px;border-radius:2px;background:${color}"></span><b style="font-size:15px">${value}</b><span style="opacity:.75">${label}</span></div>`;
const head = (text) =>
  `<div style="font-size:12px;opacity:.7;font-weight:600">${text}</div>`;

// Mounts one ECharts instance and keeps it sized to its box.
export function EChart({ option, height, label, className = "" }) {
  const el = useRef(null);
  const chart = useRef(null);
  useEffect(() => {
    try {
      chart.current = echarts.init(el.current, null, { renderer: "svg" });
    } catch {
      chart.current = null; // No layout engine (tests): the table view still holds the data.
    }
    const ro =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => chart.current?.resize());
    ro?.observe(el.current);
    return () => {
      ro?.disconnect();
      chart.current?.dispose();
    };
  }, []);
  useEffect(() => {
    try {
      chart.current?.setOption(option, true);
    } catch {
      // A chart that can't draw leaves its table view as the source.
    }
  }, [option]);
  return (
    <div
      ref={el}
      className={`ch-e ${className}`.trim()}
      style={{ height }}
      role="img"
      aria-label={label}
    />
  );
}

export function Legend({ items }) {
  return (
    <div className="ch-legend">
      {items.map((s) => (
        <span key={s.label}>
          <i style={{ background: s.color }} aria-hidden="true" />
          {s.label}
        </span>
      ))}
    </div>
  );
}

export function TableView({ head: cols, rows }) {
  return (
    <details className="ch-table">
      <summary>Show as a table</summary>
      <table>
        <thead>
          <tr>
            {cols.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

// Trend inside a stat tile. The tile states the value; this shows direction.
export function Sparkline({ values, color = c.navy }) {
  const option = useMemo(() => {
    const last = values
      .map((v) => v !== null && v !== undefined)
      .lastIndexOf(true);
    return {
      animation: false,
      grid: { left: 4, right: 8, top: 6, bottom: 6 },
      xAxis: { type: "category", show: false, data: values.map((_, i) => i) },
      yAxis: { type: "value", show: false, scale: true },
      series: [
        {
          type: "line",
          data: values,
          connectNulls: true,
          showSymbol: false,
          lineStyle: { width: 2, color, opacity: 0.35 },
          markPoint: undefined,
        },
        {
          type: "scatter",
          data: values.map((v, i) => (i === last ? v : null)),
          symbolSize: 9,
          itemStyle: { color, borderColor: SURFACE, borderWidth: 2 },
          silent: true,
        },
      ],
    };
  }, [values, color]);
  return (
    <EChart
      option={option}
      height={40}
      className="ch-spark"
      label="Trend over the period"
    />
  );
}

// Stacked columns per day: class and open gym check-ins.
export function DailyColumns({ data, height = 260 }) {
  const option = useMemo(() => {
    const labels = data.map((d) =>
      data.length <= 7 ? weekday(d.date) : fmtDay(d.date),
    );
    const stack = (key, top) => ({
      name: series[key].label,
      type: "bar",
      stack: "total",
      barMaxWidth: 24,
      data: data.map((d) => d[key]),
      itemStyle: {
        color: series[key].color,
        borderColor: SURFACE,
        borderWidth: 1,
        borderRadius: top ? [4, 4, 0, 0] : 0,
      },
      emphasis: { focus: "none", itemStyle: { opacity: 0.85 } },
    });
    return {
      aria: { enabled: true },
      animationDuration: 400,
      grid: { left: 36, right: 8, top: 16, bottom: 30 },
      tooltip: {
        ...tooltip,
        trigger: "axis",
        axisPointer: {
          type: "shadow",
          shadowStyle: { color: "rgba(15,14,84,0.05)" },
        },
        formatter: (ps) => {
          const d = data[ps[0].dataIndex];
          return (
            head(`${weekday(d.date)} ${fmtDay(d.date)}`) +
            row(series.class.color, d.class, "class") +
            row(series.open.color, d.open, "open gym") +
            row(c.white, d.class + d.open, "total")
          );
        },
      },
      xAxis: {
        type: "category",
        data: labels,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: GRID } },
        axisLabel: {
          ...axisText,
          interval: data.length <= 14 ? (data.length <= 7 ? 0 : 1) : 6,
        },
      },
      yAxis: {
        type: "value",
        splitNumber: 3,
        axisLabel: axisText,
        splitLine: { lineStyle: { color: GRID, width: 1 } },
      },
      series: [stack("class", false), stack("open", true)],
    };
  }, [data]);
  return (
    <EChart
      option={option}
      height={height}
      label="Check-ins per day, class and open gym"
    />
  );
}

// One line over time with a goal line, crosshair and an end label.
export function TrendLine({
  points,
  goal,
  unit = "min",
  height = 240,
  color = dv.series[0],
  goalLabel,
}) {
  const option = useMemo(() => {
    const last = points.map((p) => p.value !== null).lastIndexOf(true);
    return {
      aria: { enabled: true },
      animationDuration: 400,
      grid: { left: 36, right: 64, top: 20, bottom: 30 },
      tooltip: {
        ...tooltip,
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: MUTED, width: 1 } },
        formatter: (ps) => {
          const p = points[ps[0].dataIndex];
          return (
            head(`${weekday(p.date)} ${fmtDay(p.date)}`) +
            (p.value === null
              ? row(MUTED, "Closed", "")
              : row(color, Math.round(p.value * 10) / 10, `${unit} median`))
          );
        },
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: points.map((p) => fmtDay(p.date)),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: GRID } },
        axisLabel: {
          ...axisText,
          interval: Math.max(0, Math.floor(points.length / 4) - 1),
        },
      },
      yAxis: {
        type: "value",
        min: 0,
        splitNumber: 3,
        axisLabel: axisText,
        splitLine: { lineStyle: { color: GRID } },
      },
      series: [
        {
          type: "line",
          data: points.map((p) =>
            p.value === null ? null : Math.round(p.value * 10) / 10,
          ),
          connectNulls: true,
          showSymbol: false,
          symbolSize: 10,
          lineStyle: { width: 2, color },
          itemStyle: { color, borderColor: SURFACE, borderWidth: 2 },
          areaStyle: { color, opacity: 0.1 },
          endLabel: {
            show: last >= 0,
            formatter: ({ value }) => `${Math.round(value)} ${unit}`,
            color: INK,
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: 14,
          },
          markLine:
            goal === undefined
              ? undefined
              : {
                  silent: true,
                  symbol: "none",
                  lineStyle: { color: dv.goal, width: 1.5, type: "solid" },
                  label: {
                    formatter: goalLabel ?? `Goal ${goal}`,
                    color: dv.goalInk,
                    fontFamily: FONT,
                    fontWeight: 700,
                    fontSize: 12,
                    position: "insideStartTop",
                  },
                  data: [{ yAxis: goal }],
                },
        },
      ],
    };
  }, [points, goal, unit, color, goalLabel]);
  return (
    <EChart
      option={option}
      height={height}
      label={`Median wait per day, goal ${goal} ${unit}`}
    />
  );
}

// Grid of averages, one hue light to dark, numbers in the cells.
// `cols` label the axis; `names` (full block names) label the tooltip.
export function Heatmap({
  rows,
  cols,
  names = cols,
  cells,
  unit = "kids",
  height = 300,
}) {
  const option = useMemo(() => {
    const max = Math.max(1, ...cells.flat().filter((v) => v !== null));
    const data = [];
    cells.forEach((r, ri) =>
      r.forEach(
        (v, ci) => v !== null && data.push([ci, ri, Math.round(v * 10) / 10]),
      ),
    );
    return {
      aria: { enabled: true },
      animationDuration: 300,
      grid: { left: 48, right: 8, top: 8, bottom: 44 },
      tooltip: {
        ...tooltip,
        trigger: "item",
        formatter: (p) =>
          head(`${rows[p.value[1]]} · ${names[p.value[0]]}`) +
          row(RAMP[4], p.value[2], `${unit} on average`),
      },
      xAxis: {
        type: "category",
        data: cols,
        splitArea: { show: false },
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: {
          ...axisText,
          interval: 0,
          width: 56,
          overflow: "break",
          lineHeight: 14,
        },
      },
      yAxis: {
        type: "category",
        data: rows,
        inverse: true,
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { ...axisText, color: TEXT2, fontWeight: 700 },
      },
      visualMap: { show: false, min: 0, max, inRange: { color: RAMP } },
      series: [
        {
          type: "heatmap",
          data,
          label: {
            show: true,
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: 13,
            formatter: (p) => Math.round(p.value[2]),
            color: INK,
          },
          itemStyle: { borderColor: SURFACE, borderWidth: 3, borderRadius: 6 },
          emphasis: { itemStyle: { borderColor: c.navy, borderWidth: 2 } },
        },
      ],
    };
  }, [rows, cols, names, cells, unit]);
  return (
    <div className="ch-heat-wrap">
      <EChart
        option={option}
        height={height}
        label="Average check-ins by day and block"
      />
      <div className="ch-scale" aria-hidden="true">
        <span>Fewer</span>
        {RAMP.map((c) => (
          <i key={c} style={{ background: c }} />
        ))}
        <span>More</span>
        <span className="ch-scale-note">Blank cells: closed</span>
      </div>
    </div>
  );
}

// Horizontal bars; one item highlighted, the rest de-emphasized.
export function BarList({ items, highlight, unit = "" }) {
  const option = useMemo(
    () => ({
      aria: { enabled: true },
      animationDuration: 400,
      grid: { left: 8, right: 40, top: 4, bottom: 4, containLabel: true },
      tooltip: {
        ...tooltip,
        trigger: "item",
        formatter: (p) =>
          head(items[p.dataIndex].label) + row(p.color, p.value, unit),
      },
      xAxis: { type: "value", show: false },
      yAxis: {
        type: "category",
        inverse: true,
        data: items.map((i) => i.label),
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: {
          ...axisText,
          color: TEXT2,
          fontSize: 14,
          formatter: (v) => v,
        },
      },
      series: [
        {
          type: "bar",
          barMaxWidth: 18,
          data: items.map((i) => ({
            value: i.value,
            itemStyle: {
              color: i.id === highlight ? dv.series[0] : DEEMPH,
              borderRadius: [0, 4, 4, 0],
            },
          })),
          label: {
            show: true,
            position: "right",
            color: INK,
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: 14,
          },
        },
      ],
    }),
    [items, highlight, unit],
  );
  return (
    <EChart
      option={option}
      height={Math.max(120, items.length * 38)}
      label={`Bars: ${items.map((i) => `${i.label} ${i.value}`).join(", ")}`}
    />
  );
}

// A kid's visits since joining: one dot per visit day, a tick for today.
export function VisitDots({ days, span = 60, today, mark = dv.series[0] }) {
  const option = useMemo(
    () => ({
      animation: false,
      grid: { left: 6, right: 6, top: 4, bottom: 4 },
      xAxis: { type: "value", min: 0, max: span, show: false },
      yAxis: { type: "value", min: -1, max: 1, show: false },
      tooltip: {
        ...tooltip,
        trigger: "item",
        formatter: (p) =>
          head(`Day ${p.value[0]} after joining`) + row(mark, "Visit", ""),
      },
      series: [
        {
          type: "scatter",
          data: days.map((d) => [d, 0]),
          symbolSize: 10,
          itemStyle: { color: mark, borderColor: SURFACE, borderWidth: 2 },
          markLine: {
            silent: true,
            symbol: "none",
            label: { show: false },
            lineStyle: { color: GRID, width: 2, type: "solid" },
            data: [
              [{ coord: [0, 0] }, { coord: [span, 0] }],
              ...(today === undefined
                ? []
                : [
                    {
                      xAxis: Math.min(span, today),
                      lineStyle: { color: c.navy, width: 2, opacity: 0.35 },
                    },
                  ]),
            ],
          },
        },
      ],
    }),
    [days, span, today, mark],
  );
  return (
    <EChart
      option={option}
      height={28}
      className="ch-dots"
      label={`${days.length} visits`}
    />
  );
}

// Seven small columns on a dark card: the coach's unlocks per day.
export function WeekBars({ dates, values, height = 110 }) {
  const option = useMemo(
    () => ({
      aria: { enabled: true },
      animationDuration: 400,
      grid: { left: 2, right: 2, top: 22, bottom: 22 },
      tooltip: {
        ...tooltip,
        trigger: "item",
        formatter: (p) =>
          head(`${weekday(dates[p.dataIndex])} ${fmtDay(dates[p.dataIndex])}`) +
          row(c.cyan, p.value, "skills unlocked"),
      },
      xAxis: {
        type: "category",
        data: dates.map(calendarWeekdayNarrow),
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: {
          color: c.textOnInk2,
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: 12,
        },
      },
      yAxis: { type: "value", show: false, min: 0 },
      series: [
        {
          type: "bar",
          barMaxWidth: 24,
          data: values.map((v, i) => ({
            value: v,
            itemStyle: {
              color: c.cyan,
              opacity: i === values.length - 1 ? 1 : 0.55,
              borderRadius: [4, 4, 0, 0],
            },
          })),
          label: {
            show: true,
            position: "top",
            color: c.white,
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: 12,
            formatter: (p) => (p.value ? p.value : ""),
          },
        },
      ],
    }),
    [dates, values],
  );
  return (
    <EChart
      option={option}
      height={height}
      label={`Skills unlocked per day: ${values.join(", ")}`}
    />
  );
}
