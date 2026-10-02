import { beforeEach } from "vitest";

// Each case models an independent browser profile. Tests can seed storage afterward.
beforeEach(() => {
  if (typeof window !== "undefined") window.localStorage.clear();
});
