import type { AnnualReturnField } from "@value-investing/valuation/annual-return";

export const annualReturnFields: {
  key: AnnualReturnField;
  label: string;
  unit: string;
  hint: string;
  example: string;
}[] = [
  {
    key: "buyPrice",
    label: "买入价格",
    unit: "元 / 股",
    hint: "手动填写买入或计划买入价格，不自动获取行情。",
    example: "20",
  },
  {
    key: "baseEps",
    label: "基期每股收益（EPS）",
    unit: "元 / 股",
    hint: "最近一年或正常化的正 EPS；与股价采用一致股本口径。",
    example: "1",
  },
  {
    key: "earningsGrowthRate",
    label: "每股收益年增长率",
    unit: "%",
    hint: "预测期每年采用相同增速，可为负值。不是公司总利润增速。",
    example: "10",
  },
  {
    key: "years",
    label: "持有年数",
    unit: "年",
    hint: "1–30 年；在最后一年末收到分红后卖出。",
    example: "5",
  },
  {
    key: "exitPe",
    label: "退出市盈率（PE）",
    unit: "倍",
    hint: "退出时股价 = 当年 EPS × 退出 PE；须大于 0。",
    example: "20",
  },
  {
    key: "payoutRatio",
    label: "分红支付率",
    unit: "%",
    hint: "每年分红 = 当年 EPS × 支付率；不分红请明确填 0。",
    example: "30",
  },
];
