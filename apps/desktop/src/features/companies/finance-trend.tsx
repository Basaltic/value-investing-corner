import { LineChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from "echarts/components";
import {
  type EChartsCoreOption,
  init,
  use as registerCharts,
} from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";

registerCharts([
  LineChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer,
]);
export function FinanceTrend({
  labels,
  reviewed,
  pending,
  showPending,
  unit,
}: {
  labels: string[];
  reviewed: (number | null)[];
  pending: (number | null)[];
  showPending: boolean;
  unit: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const element = ref.current;
    const style = getComputedStyle(document.documentElement);
    const forest = style.getPropertyValue("--forest").trim();
    const muted = style.getPropertyValue("--muted").trim();
    const ink = style.getPropertyValue("--ink").trim();
    const chart = init(element);
    const series = [
      {
        name: "已核对",
        type: "line",
        data: reviewed,
        connectNulls: false,
        symbolSize: 8,
        lineStyle: { width: 2 },
        itemStyle: { color: forest },
      },
      ...(showPending
        ? [
            {
              name: "待核（不连线）",
              type: "line",
              data: pending,
              connectNulls: false,
              symbolSize: 8,
              lineStyle: { opacity: 0 },
              itemStyle: { color: muted },
            },
          ]
        : []),
    ];
    const option: EChartsCoreOption = {
      animation: false,
      textStyle: { color: ink },
      tooltip: {
        trigger: "axis",
        triggerOn: "click",
        renderMode: "richText",
        confine: true,
      },
      legend: { bottom: 0 },
      grid: { left: 16, right: 24, top: 32, bottom: 70, containLabel: true },
      xAxis: {
        type: "category",
        data: labels,
        axisLabel: { hideOverlap: true },
      },
      yAxis: { type: "value", name: unit || "数值", nameGap: 14 },
      series,
    };
    chart.setOption(option);
    const resize = new ResizeObserver(() => chart.resize());
    resize.observe(element);
    return () => {
      resize.disconnect();
      chart.dispose();
    };
  }, [labels, reviewed, pending, showPending, unit]);
  return (
    <div
      ref={ref}
      className="finance-chart"
      role="img"
      aria-label="指标趋势：缺值断点不连线，完整值见下方列表"
    />
  );
}
