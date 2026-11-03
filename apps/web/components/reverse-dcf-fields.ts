import type { ReverseDcfField } from "@value-investing/valuation/reverse-dcf";

export const reverseDcfGroups: {
  title: string;
  fields: {
    key: ReverseDcfField;
    label: string;
    unit: string;
    hint: string;
    example: string;
  }[];
}[] = [
  {
    title: "价格与基础数据",
    fields: [
      {
        key: "price",
        label: "当前股价",
        unit: "元 / 股",
        hint: "手动填写参考股价，不自动获取行情。",
        example: "14",
      },
      {
        key: "shares",
        label: "总股数",
        unit: "亿股",
        hint: "建议用同一时点的稀释后总股数，而不是流通股数。",
        example: "10",
      },
      {
        key: "cashFlow",
        label: "基期企业自由现金流",
        unit: "亿元",
        hint: "最近一年或正常化的正 FCFF，不是净利润或 FCFE。",
        example: "10",
      },
      {
        key: "cash",
        label: "可加回的现金及非经营资产",
        unit: "亿元",
        hint: "仅填未计入经营价值的可分配资产；无则明确填 0。",
        example: "20",
      },
      {
        key: "debt",
        label: "有息债务及其他优先索偿",
        unit: "亿元",
        hint: "含需扣除的少数股东权益等；无则明确填 0。",
        example: "30",
      },
    ],
  },
  {
    title: "保持固定的估值假设",
    fields: [
      {
        key: "years",
        label: "预测年数",
        unit: "年",
        hint: "1–30 年；各年采用同一待求解的 FCFF 增长率。",
        example: "5",
      },
      {
        key: "discountRate",
        label: "折现率（WACC）",
        unit: "%",
        hint: "与 FCFF 对应的资本成本，不是待求解变量。",
        example: "10",
      },
      {
        key: "terminalGrowthRate",
        label: "永续增长率",
        unit: "%",
        hint: "预测期后的固定增速，必须小于 WACC。",
        example: "2",
      },
    ],
  },
];
