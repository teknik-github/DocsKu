const date = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: process.env.NEXT_PUBLIC_TIME_ZONE || "Asia/Jakarta",
});

/** "18 Okt 2026", in a fixed time zone so server and client agree. */
export function formatDate(value: string | Date | null | undefined) {
  return value ? date.format(new Date(value)) : "";
}
