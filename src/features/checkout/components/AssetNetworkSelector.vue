<script setup lang="ts">
import { computed, onMounted, onScopeDispose, ref } from "vue";
import type { Currency, Pair, CurrencyCode } from "../domain/paymentModel";
import { findCurrency, findNetwork } from "../domain/catalogue";
import NetworkBadge from "./NetworkBadge.vue";
import { useAutoHeightTransition } from "./useAutoHeightTransition";
const props = defineProps<{
  mobile?: boolean;
  currencies: Currency[];
  pair: Pair;
  disabled: boolean;
}>();
const emit = defineEmits<{ select: [pair: Pair]; continue: [] }>();
const networkOptions = useAutoHeightTransition(() => props.pair.currency);
const currency = computed(() =>
  findCurrency(props.currencies, props.pair.currency),
);
const selected = computed(() => findNetwork(props.currencies, props.pair));
const continueButton = ref<HTMLButtonElement | null>(null);
const continueLabel = ref<HTMLSpanElement | null>(null);
const continueWidth = ref<string>();
let labelObserver: ResizeObserver | undefined;

onMounted(() => {
  const button = continueButton.value;
  const label = continueLabel.value;
  if (!button || !label || typeof ResizeObserver === "undefined") return;

  // Measure only the destination width; CSS handles the animation independently.
  const updateWidth = () => {
    if (!selected.value || !label.offsetWidth) return;
    const style = getComputedStyle(button);
    const width =
      label.offsetWidth +
      Number.parseFloat(style.paddingLeft) +
      Number.parseFloat(style.paddingRight) +
      Number.parseFloat(style.borderLeftWidth) +
      Number.parseFloat(style.borderRightWidth);
    continueWidth.value = `${Math.ceil(width)}px`;
  };
  updateWidth();
  labelObserver = new ResizeObserver(updateWidth);
  labelObserver.observe(label);
});
onScopeDispose(() => labelObserver?.disconnect());

function changeCurrency(code: CurrencyCode) {
  const c = findCurrency(props.currencies, code);
  if (c)
    emit("select", {
      currency: code,
      network: c.networks[0]!.id,
    });
}
</script>
<template>
  <div class="selector" :class="{ mobile }">
    <fieldset :disabled="disabled">
      <legend class="eyebrow">Currency</legend>
      <div class="currency-segments">
        <label
          v-for="c in currencies"
          :key="c.code"
          :class="{ selected: c.code === pair.currency }"
          ><input
            type="radio"
            name="currency"
            :value="c.code"
            :checked="c.code === pair.currency"
            @change="changeCurrency(c.code)"
          />{{ c.code }}</label
        >
      </div>
    </fieldset>
    <fieldset :disabled="disabled">
      <legend class="eyebrow">Network</legend>
      <div ref="networkOptions" class="network-options">
        <label
          v-for="n in currency?.networks"
          :key="n.id"
          class="network-option"
          :class="[n.id, { selected: n.id === pair.network }]"
          ><input
            type="radio"
            name="network"
            :aria-label="n.name"
            :value="n.id"
            :checked="n.id === pair.network"
            @change="emit('select', { currency: pair.currency, network: n.id })"
          /><NetworkBadge :network="n.id" /><span class="network-info"
            ><strong>{{ n.name }}</strong
            ><small
              >{{ n.required_confirmations }}
              {{
                n.required_confirmations === 1
                  ? "confirmation"
                  : "confirmations"
              }}
              · about
              {{
                n.avg_confirmation_seconds >= 60
                  ? n.avg_confirmation_seconds / 60 + " min"
                  : n.avg_confirmation_seconds + " s"
              }}</small
            ></span
          ><span class="fee mono"
            >Fee {{ n.network_fee }} {{ pair.currency }}</span
          ></label
        >
      </div>
    </fieldset>
    <button
      ref="continueButton"
      data-testid="continue"
      class="primary continue-button"
      :style="{ '--continue-button-width': continueWidth }"
      :disabled="disabled || !selected"
      @click="emit('continue')"
    >
      <span ref="continueLabel" class="continue-label">
        Continue with {{ pair.currency }} on {{ selected?.name }}
      </span>
    </button>
    <p class="small muted">Your rate is fixed when the quote is ready.</p>
  </div>
</template>

<style lang="scss">
.selector fieldset + fieldset {
  margin-top: 14px;
}
.currency-segments {
  display: flex;
  background: var(--surface);
  padding: 4px;
  border-radius: 6px;
  margin-top: 6px;
}
.currency-segments label {
  position: relative;
  text-align: center;
  flex: 1;
  padding: 10px 8px;
  cursor: pointer;
  border-radius: 3px;
  font-size: 13px;
}
.currency-segments input {
  position: absolute;
  opacity: 0;
  width: 100%;
  height: 100%;
  inset: 0;
  cursor: pointer;
  margin: 0;
}
.currency-segments label:has(input:focus-visible) {
  outline: 3px solid #355bea;
}
.currency-segments .selected {
  background: var(--ink);
  color: white;
}
.network-options {
  display: grid;
  gap: 8px;
  margin-top: 6px;
  transition: height var(--motion-medium, 220ms)
    var(--ease-out, cubic-bezier(0.2, 0, 0, 1));
}
.network-options.is-resizing {
  overflow: hidden;
  align-content: start;
}
.network-option {
  display: flex;
  align-items: center;
  gap: 14px;
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 12px 16px;
  min-height: 66px;
  cursor: pointer;
  position: relative;
}
.network-option input {
  margin: 0;
  width: 16px;
  height: 16px;
  flex: none;
  accent-color: var(--accent);
}
.network-option.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}
.network-info {
  min-width: 0;
  flex: 1;
}
.network-info strong {
  display: block;
  white-space: nowrap;
  font-weight: 400;
}
.network-info small {
  display: block;
  color: var(--muted);
  font-size: 12px;
}
.fee {
  font-size: 13px;
  white-space: nowrap;
  color: #444;
}
.selector > .continue-button {
  margin-top: 16px;
}
.selector p {
  font-size: 13px;
  margin: 8px 0 16px;
}
:where(.selector.mobile) .network-option {
  padding: 14px 16px;
  gap: 14px;
  display: grid;
  grid-template-columns: 16px 28px minmax(0, 1fr);
  column-gap: 14px;
  row-gap: 0;
  min-height: 80px;
}
:where(.selector.mobile) .network-option > input,
:where(.selector.mobile) .network-option > .network-badge {
  grid-row: 1/3;
}
:where(.selector.mobile) .network-info {
  grid-column: 3;
}
:where(.selector.mobile) .network-info strong {
  white-space: normal;
}
:where(.selector.mobile) .network-info small {
  line-height: 1.3;
}
:where(.selector.mobile) .fee {
  grid-column: 3;
  font-size: 12px;
  line-height: 1.3;
}
.selector:where(.mobile) .primary {
  width: 100%;
  padding-left: 8px;
  padding-right: 8px;
  font-size: 13px;
}
.selector:where(.mobile) p {
  margin: 8px 0 16px;
}
.selector:where(.mobile) p.small {
  font-size: 12px;
}
/* Motion starts with checkout interaction; removals remain immediate. */
.checkout.motion-ready .currency-segments label,
.checkout.motion-ready .network-option {
  transition:
    background-color var(--motion-fast) var(--ease-out),
    color var(--motion-fast) var(--ease-out),
    border-color var(--motion-fast) var(--ease-out),
    box-shadow var(--motion-fast) var(--ease-out);
}
.checkout.motion-ready .network-option {
  animation: checkout-enter var(--motion-medium) var(--ease-out);
}
.selector > p:last-child {
  margin-bottom: 4px;
}
:where(.selector:not(.mobile)) .continue-button {
  width: var(--continue-button-width, auto);
  max-width: 100%;
  overflow: hidden;
  transition: width var(--motion-medium, 220ms)
    var(--ease-out, cubic-bezier(0.2, 0, 0, 1));
}
:where(.selector:not(.mobile)) .continue-label {
  display: block;
  width: max-content;
  margin-inline: 0;
}
@media (prefers-reduced-motion: reduce) {
  .continue-button {
    transition: none;
  }
}
</style>
