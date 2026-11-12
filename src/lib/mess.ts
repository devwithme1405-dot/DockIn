import type { MessDay } from "./types";

/**
 * The mess, in one small place. The menu is a weekly template the student fills
 * once; the screen then shows "today" by itself, which is what a daily menu is
 * in practice — a mess runs the same week on repeat. The reusable cafeteria QR
 * never changes, so it is kept verbatim and simply drawn.
 */

export type Meal = "breakfast" | "lunch" | "snacks" | "dinner";

export const MEALS: { key: Meal; label: string; from: string; icon: string }[] = [
  { key: "breakfast", label: "Breakfast", from: "07:30", icon: "☕" },
  { key: "lunch", label: "Lunch", from: "12:30", icon: "🍛" },
  { key: "snacks", label: "Snacks", from: "17:00", icon: "🍪" },
  { key: "dinner", label: "Dinner", from: "19:30", icon: "🍲" },
];

/** The meal happening now (or next up), so the screen leads with what matters. */
export function currentMeal(hm: string): Meal {
  if (hm < "11:00") return "breakfast";
  if (hm < "15:30") return "lunch";
  if (hm < "18:30") return "snacks";
  return "dinner";
}

export function menuForDay(menu: Record<number, MessDay> | undefined, weekday: number): MessDay {
  return menu?.[weekday] ?? {};
}

export function dayHasFood(day: MessDay): boolean {
  return !!(day.breakfast || day.lunch || day.snacks || day.dinner);
}
