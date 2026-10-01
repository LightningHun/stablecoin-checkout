<script setup lang="ts">
import { computed } from "vue";
import type { Currency, Pair, CurrencyCode } from "../domain/paymentModel";
import NetworkBadge from "./NetworkBadge.vue";
const props = defineProps<{
  currencies: Currency[];
  pair: Pair;
  disabled: boolean;
}>();
const emit = defineEmits<{ select: [pair: Pair]; continue: [] }>();
const currency = computed(() =>
  props.currencies.find((c) => c.code === props.pair.currency),
);
const selected = computed(() =>
  currency.value?.networks.find((n) => n.id === props.pair.network),
);
function changeCurrency(code: CurrencyCode) {
  const c = props.currencies.find((c) => c.code === code);
  if (c)
    emit("select", {
      currency: code,
      network: code === "USDC" ? "polygon" : c.networks[0]!.id,
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
      <div class="network-options">
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
      data-testid="continue"
      class="primary"
      :disabled="disabled || !selected"
      @click="emit('continue')"
    >
      Continue with {{ pair.currency }} on {{ selected?.name }}
    </button>
    <p class="small muted">Your rate is fixed when the quote is ready.</p>
  </div>
</template>
