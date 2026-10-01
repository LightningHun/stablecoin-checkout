/** Independent literals transcribed from the supplied contract; never import mock fixtures here. */
export const sourceAddress = 'TQ5Nn8kLpVv3xJ7wYcR2bF9aH4dM6sGz1e'
export const fixedNow = Date.parse('2026-08-14T08:37:10.842Z')
export const sourceQuote = {
  crypto_currency: 'USDT', network: 'tron', network_name: 'Tron (TRC-20)',
  exchange_rate: '0.9214', crypto_amount: '162.69', network_fee: '1.00', total_due: '163.69',
  crypto_address: sourceAddress, required_confirmations: 1, expires_at: '2026-08-14T08:52:10.842Z',
} as const
export const catalogueRows = [
  ['USDT', 6, 'tron', 'Tron (TRC-20)', '1.00', 1, 60],
  ['USDT', 6, 'ethereum', 'Ethereum (ERC-20)', '4.50', 3, 180],
  ['USDC', 6, 'ethereum', 'Ethereum (ERC-20)', '4.50', 3, 180],
  ['USDC', 6, 'polygon', 'Polygon', '0.10', 6, 30],
  ['USDC', 6, 'solana', 'Solana', '0.01', 1, 15],
  ['ETH', 18, 'ethereum', 'Ethereum', '3.20', 3, 180],
] as const
export const statuses = ['awaiting_payment', 'detected', 'confirming', 'paid', 'underpaid', 'overpaid', 'expired', 'failed'] as const
export const terminalStatuses = ['paid', 'overpaid', 'expired', 'failed'] as const
// Original synthetic demo vectors: reviewed separately after the implementer declared seeds.
// Totals below are literal independently checked decimal sums, not production calculations.
export const syntheticQuotes = {
  'USDT/ethereum': { crypto_amount: '162.69', exchange_rate: '0.9214', total_due: '167.19', crypto_address: '0x1111111111111111111111111111111111111111' },
  'USDC/ethereum': { crypto_amount: '162.70', exchange_rate: '0.9213', total_due: '167.20', crypto_address: '0x2222222222222222222222222222222222222222' },
  'USDC/polygon': { crypto_amount: '162.71', exchange_rate: '0.9212', total_due: '162.81', crypto_address: '0x3333333333333333333333333333333333333333' },
  'USDC/solana': { crypto_amount: '162.72', exchange_rate: '0.9211', total_due: '162.73', crypto_address: '7YWHMfk9JZe1LM1g1ZauHuiSxhiqp1HwBwwxVwA7F4GF' },
  'ETH/ethereum': { crypto_amount: '0.061234567890123456', exchange_rate: '2448.0123', total_due: '3.261234567890123456', crypto_address: '0x4444444444444444444444444444444444444444' },
} as const
export const sourcePayment = {
  payment_reference: 'AQH-100306-PMT', order_id: 'ORD-88213', status: 'awaiting_payment',
  merchant: { name: 'Payment Project', logo_url: null }, order: { currency: 'EUR', amount: '149.90' }, quote: sourceQuote,
} as const
export function paymentSnapshot(status: typeof statuses[number] = 'awaiting_payment') {
  const base = structuredClone({ ...sourcePayment, status })
  const tx = '9d1f4c8a2be7...'
  const fields: Record<string, object> = {
    awaiting_payment: {},
    detected: { confirmations: 0, required_confirmations: 1, amount_received: '163.69', tx_hash: tx, detected_at: '2026-08-14T08:44:02.120Z' },
    confirming: { confirmations: 0, required_confirmations: 1, amount_received: '163.69', tx_hash: tx },
    paid: { confirmations: 1, required_confirmations: 1, amount_received: '163.69', tx_hash: tx, settled_at: '2026-08-14T08:47:31.004Z' },
    underpaid: { amount_received: '120.00', amount_outstanding: '43.69', crypto_address: sourceAddress, tx_hash: tx },
    overpaid: { amount_received: '180.00', amount_excess: '16.31', tx_hash: tx, settled_at: '2026-08-14T08:47:31.004Z' },
    expired: { expired_at: '2026-08-14T08:52:10.842Z' }, failed: { reason: 'settlement_rejected' },
  }
  return { ...base, ...fields[status] }
}
