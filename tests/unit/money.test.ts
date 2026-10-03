import { describe, expect, it } from 'vitest'
import { addMoney, formatFiat, formatUnits, parseUnits, subtractMoney } from '../../src/features/checkout/domain/money'

describe('T01/T05 exact decimal-string money', () => {
  it('keeps the source amounts exact with independently specified results', () => {
    expect(parseUnits('162.69', 6)).toBe(162690000n)
    expect(addMoney('162.69', '1.00', 6)).toBe('163.69')
    expect(subtractMoney('163.69', '120.00', 6)).toBe('43.69')
    expect(subtractMoney('180.00', '163.69', 6)).toBe('16.31')
  })
  it('preserves the smallest ETH unit and every digit of a long ETH amount', () => {
    expect(parseUnits('0.000000000000000001', 18)).toBe(1n)
    expect(formatUnits(1n, 18)).toBe('0.000000000000000001')
    expect(parseUnits('1.123456789012345678', 18)).toBe(1123456789012345678n)
    expect(formatUnits(1123456789012345678n, 18)).toBe('1.123456789012345678')
    expect(addMoney('1.123456789012345678', '0.000000000000000001', 18)).toBe('1.123456789012345679')
  })
  it('never loses integers above the safe Number range', () => {
    expect(parseUnits('9007199254740993.123456', 6)).toBe(9007199254740993123456n)
    expect(formatUnits(9007199254740993123456n, 6)).toBe('9007199254740993.123456')
  })
  it.each([['1.0000001', 6], ['0.0000000000000000001', 18], ['-1', 6], ['1e3', 6], ['NaN', 6], ['Infinity', 6], ['1.2.3', 6], ['', 6]] as const)('rejects invalid or excessive-precision %s', (value, scale) => {
    expect(() => parseUnits(value, scale)).toThrow()
  })
  it('formats the exact fiat value for both required locales', () => {
    expect(formatFiat('149.90', 'en-IE', 'EUR')).toBe('149.90 EUR')
    expect(formatFiat('149.90', 'de-DE', 'EUR').replace(/\u00a0/g, ' ')).toBe('149,90 EUR')
  })
})
