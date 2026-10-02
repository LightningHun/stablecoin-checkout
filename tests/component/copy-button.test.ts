import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import CopyButton from '../../src/features/checkout/components/CopyButton.vue'

const address = '0xA123456789abcdef0123456789ABCDEF01234567'
const replacementAddress = '0xB123456789abcdef0123456789ABCDEF01234567'
const unavailableMessage = 'Copy unavailable. Select and copy the value below.'
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
const writeText = vi.fn<(value: string) => Promise<void>>()
let wrapper: VueWrapper | undefined

function pendingCopy() {
  let resolve!: () => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<void>((accept, deny) => {
    resolve = accept
    reject = deny
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  writeText.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.clearAllTimers()
  vi.useRealTimers()
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
  else Reflect.deleteProperty(navigator, 'clipboard')
})

describe('copy confirmation lifetime', () => {
  it.each([
    ['Copy', '1234.560000'],
    ['Copy address', address],
  ])('copies the canonical value and restores "%s" exactly after 3000 ms', async (label, value) => {
    wrapper = mount(CopyButton, { props: { label, value } })
    expect(wrapper.get('button').text()).toBe(label)

    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledExactlyOnceWith(value)
    expect(wrapper.get('button').text()).toBe('Copied')
    expect(wrapper.get('[role="status"]').text()).toBe('Copied')

    await vi.advanceTimersByTimeAsync(2999)
    expect(wrapper.get('button').text()).toBe('Copied')
    await vi.advanceTimersByTimeAsync(1)
    expect(wrapper.get('button').text()).toBe(label)
    expect(wrapper.get('[role="status"]').text()).toBe('')
    expect(wrapper.find('input').exists()).toBe(false)
  })

  it('starts the 3000 ms confirmation only when the clipboard write succeeds', async () => {
    const pending = pendingCopy()
    writeText.mockReturnValueOnce(pending.promise)
    wrapper = mount(CopyButton, { props: { label: 'Copy address', value: address } })

    await wrapper.get('button').trigger('click')
    await vi.advanceTimersByTimeAsync(5000)
    expect(wrapper.get('button').text()).toBe('Copy address')
    expect(wrapper.get('[role="status"]').text()).toBe('')
    pending.resolve()
    await flushPromises()

    await vi.advanceTimersByTimeAsync(2999)
    expect(wrapper.get('button').text()).toBe('Copied')
    await vi.advanceTimersByTimeAsync(1)
    expect(wrapper.get('button').text()).toBe('Copy address')
  })

  it('restarts the deadline after another successful copy', async () => {
    wrapper = mount(CopyButton, { props: { label: 'Copy', value: '0.010000' } })
    await wrapper.get('button').trigger('click')
    await flushPromises()
    await vi.advanceTimersByTimeAsync(2000)

    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1000)
    expect(wrapper.get('button').text()).toBe('Copied')
    await vi.advanceTimersByTimeAsync(1999)
    expect(wrapper.get('button').text()).toBe('Copied')
    await vi.advanceTimersByTimeAsync(1)
    expect(wrapper.get('button').text()).toBe('Copy')
    expect(wrapper.get('[role="status"]').text()).toBe('')
  })

  it('keeps the canonical manual fallback and error message after a failed copy', async () => {
    writeText.mockRejectedValueOnce(new Error('Clipboard permission denied'))
    wrapper = mount(CopyButton, { props: { label: 'Copy address', value: address } })
    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(wrapper.get('button').text()).toBe('Copy address')
    expect(wrapper.get('[role="status"]').text()).toBe(unavailableMessage)
    expect(wrapper.get('input').element.value).toBe(address)
    expect(wrapper.get('input').attributes()).toHaveProperty('readonly')
    await vi.advanceTimersByTimeAsync(6000)
    expect(wrapper.get('[role="status"]').text()).toBe(unavailableMessage)
    expect(wrapper.get('input').element.value).toBe(address)
  })

  it('does not let an earlier success timeout clear a later copy failure', async () => {
    wrapper = mount(CopyButton, { props: { label: 'Copy address', value: address } })
    await wrapper.get('button').trigger('click')
    await flushPromises()
    await vi.advanceTimersByTimeAsync(1000)
    writeText.mockRejectedValueOnce(new Error('Clipboard permission denied'))
    await wrapper.get('button').trigger('click')
    await flushPromises()

    await vi.advanceTimersByTimeAsync(6000)
    expect(wrapper.get('button').text()).toBe('Copy address')
    expect(wrapper.get('[role="status"]').text()).toBe(unavailableMessage)
    expect(wrapper.get('input').element.value).toBe(address)
  })

  it('replaces a manual fallback with temporary confirmation after a successful retry', async () => {
    writeText.mockRejectedValueOnce(new Error('Clipboard permission denied'))
    wrapper = mount(CopyButton, { props: { label: 'Copy address', value: address } })
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.find('input').exists()).toBe(true)

    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.get('button').text()).toBe('Copied')
    expect(wrapper.find('input').exists()).toBe(false)
    await vi.advanceTimersByTimeAsync(3000)
    expect(wrapper.get('button').text()).toBe('Copy address')
    expect(wrapper.get('[role="status"]').text()).toBe('')
    expect(wrapper.find('input').exists()).toBe(false)
  })

  it.each(['success', 'failure'] as const)('resets stale %s feedback when the canonical value changes', async outcome => {
    if (outcome === 'failure') writeText.mockRejectedValueOnce(new Error('Clipboard permission denied'))
    wrapper = mount(CopyButton, { props: { label: 'Copy address', value: address } })
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).not.toBe('')

    await wrapper.setProps({ value: replacementAddress })
    expect(wrapper.get('button').text()).toBe('Copy address')
    expect(wrapper.get('[role="status"]').text()).toBe('')
    expect(wrapper.find('input').exists()).toBe(false)
    expect(vi.getTimerCount()).toBe(0)

    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenLastCalledWith(replacementAddress)
    expect(wrapper.get('button').text()).toBe('Copied')
    await vi.advanceTimersByTimeAsync(3000)
    expect(wrapper.get('button').text()).toBe('Copy address')
  })

  it.each(['success', 'failure'] as const)('ignores a pending %s for a replaced canonical value', async outcome => {
    const pending = pendingCopy()
    writeText.mockReturnValueOnce(pending.promise)
    wrapper = mount(CopyButton, { props: { label: 'Copy address', value: address } })
    await wrapper.get('button').trigger('click')
    expect(writeText).toHaveBeenCalledExactlyOnceWith(address)
    await wrapper.setProps({ value: replacementAddress })

    if (outcome === 'success') pending.resolve()
    else pending.reject(new Error('Old clipboard write denied'))
    await flushPromises()
    expect(wrapper.get('button').text()).toBe('Copy address')
    expect(wrapper.get('[role="status"]').text()).toBe('')
    expect(wrapper.find('input').exists()).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('clears its confirmation timeout on unmount', async () => {
    wrapper = mount(CopyButton, { props: { label: 'Copy', value: '1.000000' } })
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.get('button').text()).toBe('Copied')
    expect(vi.getTimerCount()).toBeGreaterThan(0)

    wrapper.unmount()
    wrapper = undefined
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not schedule a confirmation timeout for a clipboard write that succeeds after unmount', async () => {
    const pending = pendingCopy()
    writeText.mockReturnValueOnce(pending.promise)
    wrapper = mount(CopyButton, { props: { label: 'Copy address', value: address } })
    await wrapper.get('button').trigger('click')
    wrapper.unmount()
    wrapper = undefined

    pending.resolve()
    await flushPromises()
    expect(vi.getTimerCount()).toBe(0)
  })
})
