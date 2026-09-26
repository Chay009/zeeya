import type { AppIconName } from "@/components/icon";

const CATEGORY_ICONS: [RegExp, AppIconName][] = [
  [/food|dining|restaurant|swiggy|zomato/i, "food"],
  [/grocer|supermarket|mart/i, "cart"],
  [/travel|flight|air|hotel|trip/i, "airplane"],
  [/fuel|petrol/i, "fuel"],
  [/transport|cab|taxi|uber|ola|metro/i, "car"],
  [/shop|fashion|apparel|cloth/i, "bag"],
  [/bill|utilit|electric|recharge|mobile|internet/i, "receipt"],
  [/health|medic|pharma|hospital/i, "health"],
  [/entertain|movie|ott|stream|subscri/i, "film"],
  [/educat|school|course/i, "school"],
  [/transfer|upi|p2p/i, "swap"],
  [/rent|home|house/i, "home"],
];

export function categoryIcon(label: string): AppIconName {
  return CATEGORY_ICONS.find(([pattern]) => pattern.test(label))?.[1] ?? "pie-chart";
}

export function categoryColor(chart: readonly string[], index: number): string {
  return chart[index % chart.length] ?? chart[0] ?? "#888";
}
