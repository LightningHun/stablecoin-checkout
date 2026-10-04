/** Fixed en-GB clock presentation for API timestamps and sampled server times. */
export const formatHourMinute = (value: string | number): string =>
  new Date(value).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
export const formatClockTime = (value: string | number): string =>
  new Date(value).toLocaleTimeString("en-GB");
