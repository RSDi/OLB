// The time at the gym (Central), for "Now" on the live page. Server side.

import { CHURCH_TZ } from "../dates/today";
import type { Clock } from "./live-view";

export function gymClock(at = new Date()): Clock {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CHURCH_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

export function gymTimeLabel(at = new Date()): string {
  return at.toLocaleTimeString("en-US", { timeZone: CHURCH_TZ, hour: "numeric", minute: "2-digit" });
}
