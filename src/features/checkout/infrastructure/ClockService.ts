export class ClockService {
  private anchor: number | null = null;
  private at = 0;
  private uncertainty = 0;
  constructor(
    private monotonic: () => number = () => performance.now(),
    private wall: () => number = () => Date.now(),
  ) {}
  sample(iso: string, start: number, end: number): void {
    const time = Date.parse(iso);
    if (!Number.isFinite(time) || end < start)
      throw new Error("Invalid server clock");
    this.uncertainty = (end - start) / 2;
    this.anchor = time + this.uncertainty;
    this.at = this.monotonic();
  }
  now(): number {
    return this.anchor === null
      ? this.wall()
      : this.anchor + Math.max(0, this.monotonic() - this.at);
  }
  remaining(expiresAt: string): number {
    return Math.max(0, Date.parse(expiresAt) - this.now() - this.uncertainty);
  }
  get sampled(): boolean {
    return this.anchor !== null;
  }
}
