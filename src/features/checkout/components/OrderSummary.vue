<script setup lang="ts">
import { I18nT, useI18n } from "vue-i18n";
import { formatFiat } from "../domain/money";
const { t } = useI18n({ useScope: "global" });
defineProps<{
  mobile?: boolean;
  orderId?: string;
  amount?: string;
  locale: string;
  currency?: string;
  unavailable?: boolean;
}>();
</script>
<template>
  <section
    class="order-summary"
    :class="{ mobile }"
    :aria-label="t('summary.label')"
  >
    <div class="eyebrow">{{ t("summary.total") }}</div>
    <h1 v-if="amount !== undefined && currency" data-testid="fiat-total">
      {{ formatFiat(amount, locale, currency) }}
    </h1>
    <p v-else-if="unavailable" class="muted" role="status">
      {{ t("summary.unavailable") }}
    </p>
    <div
      v-else
      class="skeleton amount-skeleton"
      role="status"
      :aria-label="t('summary.loading')"
    ></div>
    <I18nT
      v-if="orderId"
      keypath="common.order"
      tag="p"
      class="order-reference"
      scope="global"
    >
      <template #order>
        <span class="mono">{{ orderId }}</span>
      </template>
    </I18nT>
  </section>
</template>

<style lang="scss">
@use "../../../styles/checkout-shared" as shared;

:where(.order-summary) {
  @include shared.amount-skeleton;
}

.order-summary {
  border-bottom: 1px solid var(--line);
  padding-bottom: 32px;
  margin-bottom: 36px;

  h1 {
    overflow-wrap: anywhere;
    font-size: 40px;
    letter-spacing: -1.8px;
    line-height: 1.3;
    font-weight: 600;
    margin-top: 2px;
  }

  .order-reference {
    margin: 8px 0 0;
    font-size: 14px;
    color: #505050;
    overflow-wrap: anywhere;

    .mono {
      color: var(--ink);
    }
  }

  &:where(.mobile) {
    padding-bottom: 26px;
    margin-bottom: 28px;
  }
}

.order-summary:where(.mobile) {
  h1 {
    font-size: 36px;
  }
}
</style>
