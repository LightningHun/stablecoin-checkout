<script setup lang="ts">
import { computed, onMounted, onScopeDispose, ref } from "vue";
import type { Currency, Pair, CurrencyCode } from "../domain/paymentModel";
import NetworkBadge from "./NetworkBadge.vue";
import { useAutoHeightTransition } from "./useAutoHeightTransition";
const props = defineProps<{
  currencies: Currency[];
  pair: Pair;
  disabled: boolean;
}>();
const emit = defineEmits<{ select: [pair: Pair]; continue: [] }>();
const networkOptions = useAutoHeightTransition(() => props.pair.currency);
const currency = computed(() =>
  props.currencies.find((c) => c.code === props.pair.currency),
);
const selected = computed(() =>
  currency.value?.networks.find((n) => n.id === props.pair.network),
);
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
  const c = props.currencies.find((c) => c.code === code);
  if (c)
    emit("select", {
      currency: code,
      network: c.networks[0]!.id,
    });
}
</script>
<template>
  <div class="selector">
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
    <p class="muted">
      Fees are set by the network. Your wallet must support the one you choose.
    </p>
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

<style scoped>
@media (min-width: 601px) {
  .continue-button {
    width: var(--continue-button-width, auto);
    max-width: 100%;
    overflow: hidden;
    transition: width var(--motion-medium, 220ms)
      var(--ease-out, cubic-bezier(0.2, 0, 0, 1));
  }
  .continue-label {
    display: block;
    width: max-content;
    margin-inline: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .continue-button {
    transition: none;
  }
}
</style>
