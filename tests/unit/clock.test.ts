import { describe, expect, it } from 'vitest'
import { ClockService } from '../../src/features/checkout/infrastructure/ClockService'
import { fixedNow, sourceQuote } from '../fixtures/oracles'

describe('T06/T07 absolute deadline and server-aware clock', () => {
  it('uses elapsed time after a coalesced two-minute suspension', () => {
    let monotonic = 1000
    const clock = new ClockService(() => monotonic, () => fixedNow)
    clock.sample(new Date(fixedNow).toISOString(), 1000, 1000)
    expect(clock.remaining(sourceQuote.expires_at)).toBe(900000)
    monotonic += 120000
    expect(clock.remaining(sourceQuote.expires_at)).toBe(780000)
  })
  it.each([-300000, 300000])('client wall skew %i cannot alter accepted server deadline', skew => {
    let wall = fixedNow + skew
    let monotonic = 0
    const clock = new ClockService(() => monotonic, () => wall)
    clock.sample(new Date(fixedNow).toISOString(), 0, 0)
    expect(clock.remaining(sourceQuote.expires_at)).toBe(900000)
    monotonic = 1000
    wall += 3600000
    expect(clock.remaining(sourceQuote.expires_at)).toBe(899000)
  })
  it('resolves one millisecond before, at, and after the deadline', () => {
    let monotonic = 0
    const clock = new ClockService(() => monotonic, () => fixedNow)
    clock.sample(new Date(fixedNow).toISOString(), 0, 0)
    monotonic = 899999
    expect(clock.remaining(sourceQuote.expires_at)).toBe(1)
    monotonic = 900000
    expect(clock.remaining(sourceQuote.expires_at)).toBe(0)
    monotonic = 900001
    expect(clock.remaining(sourceQuote.expires_at)).toBe(0)
  })
  it('accounts for a delayed time sample without extending the quote', () => {
    const clock = new ClockService(() => 2000, () => fixedNow + 300000)
    clock.sample(new Date(fixedNow).toISOString(), 0, 2000)
    expect(clock.remaining(sourceQuote.expires_at)).toBeLessThanOrEqual(900000)
    expect(clock.remaining(sourceQuote.expires_at)).toBeGreaterThanOrEqual(898000)
  })
  it('T07 flags a halted monotonic clock until a fresh server sample resolves uncertainty', () => {
    let wall = fixedNow
    const clock = new ClockService(() => 0, () => wall)
    clock.sample(new Date(fixedNow).toISOString(), 0, 0)
    expect(clock.needsResync()).toBe(false)
    wall += 120000
    expect(clock.needsResync()).toBe(true)
    clock.sample(new Date(wall).toISOString(), 0, 0)
    expect(clock.needsResync()).toBe(false)
    expect(clock.remaining(sourceQuote.expires_at)).toBe(780000)
  })
})
