<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { I18nT, useI18n } from "vue-i18n";
import CopyButton from "./CopyButton.vue";
import MerchantBrand from "./MerchantBrand.vue";

const { t } = useI18n({ useScope: "global" });
const props = defineProps<{
  mobile?: boolean;
  reason: string;
  orderInLink: string | null;
  checkedAt: string;
  helpUrl: string | null;
  canGoBack: boolean;
}>();
const heading = ref<HTMLHeadingElement | null>(null);
const reasons: Record<string, string> = {
  malformed_order: "invalidLink.reasons.malformedOrder",
  unknown_order: "invalidLink.reasons.unknownOrder",
  invalid_signature: "invalidLink.reasons.invalidSignature",
  missing_signature: "invalidLink.reasons.missingSignature",
};
const reasonText = computed(() =>
  Object.hasOwn(reasons, props.reason)
    ? t(reasons[props.reason]!)
    : t("invalidLink.reasons.unverified"),
);
const opened = computed(() =>
  new Date(props.checkedAt).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }),
);
const details = computed(() =>
  [
    t("invalidLink.details.reason", {
      reason: reasonText.value,
      code: props.reason,
    }),
    t("invalidLink.details.order", {
      order: props.orderInLink || t("invalidLink.none"),
    }),
    t("invalidLink.details.opened", { time: opened.value }),
    t("invalidLink.details.link", { url: window.location.href }),
  ].join("\n"),
);
function goBack() {
  window.history.back();
}
onMounted(() => heading.value?.focus());
</script>
<template>
  <div class="invalid-link-layout" :class="{ mobile }">
    <header class="merchant-header" :class="{ mobile }">
      <MerchantBrand />
    </header>
    <main class="invalid-link-view" data-testid="invalid-link">
      <svg
        class="invalid-link-icon"
        xmlns="http://www.w3.org/2000/svg"
        width="40"
        height="40"
        viewBox="0 0 40 40"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle cx="20" cy="20" r="19" />
        <path d="M20 11.5 28 26H12l8-14.5Z" />
        <path d="M20 17v4.5" />
        <circle cx="20" cy="24" r=".8" fill="currentColor" stroke="none" />
      </svg>
      <h1 ref="heading" tabindex="-1">{{ t("invalidLink.title") }}</h1>
      <p class="invalid-link-explanation">
        {{ t("invalidLink.explanation") }}
      </p>
      <div class="invalid-link-actions">
        <button v-if="canGoBack" class="primary" @click="goBack">
          {{ t("invalidLink.goBack") }}
        </button>
        <CopyButton
          :value="details"
          :label="t('invalidLink.copyDetails')"
          testid="copy-link-details"
        />
      </div>
      <section
        class="invalid-link-support"
        :aria-label="t('invalidLink.forSupport')"
      >
        <div class="eyebrow">{{ t("invalidLink.forSupport") }}</div>
        <dl class="receipt">
          <div>
            <dt>{{ t("invalidLink.reason") }}</dt>
            <I18nT keypath="invalidLink.reasonWithCode" tag="dd" scope="global">
              <template #reason>{{ reasonText }}</template>
              <template #code>
                <span class="mono">{{ reason }}</span>
              </template>
            </I18nT>
          </div>
          <div>
            <dt>{{ t("invalidLink.orderInLink") }}</dt>
            <dd class="mono">{{ orderInLink || "—" }}</dd>
          </div>
          <div>
            <dt>{{ t("invalidLink.opened") }}</dt>
            <dd>{{ opened }}</dd>
          </div>
        </dl>
      </section>
    </main>
    <footer class="checkout-footer invalid-link-footer">
      <span>{{ t("invalidLink.footer") }}</span>
    </footer>
  </div>
</template>

<style lang="scss">
@use "../../../styles/checkout-shared" as shared;

@include shared.merchant-header;

:where(.invalid-link-layout) {
  @include shared.checkout-footer;

  @include shared.receipt;
}

/* Invalid checkout links have no payment controls or active payment session. */

.invalid-link-layout {
  min-height: 100svh;
  display: flex;
  flex-direction: column;
}

.invalid-link-view {
  width: var(--column);
  max-width: calc(100% - 32px);
  margin: 72px auto 0;
  flex: 1;
}

.invalid-link-icon {
  display: block;
  margin-bottom: 22px;
}

.invalid-link-view {
  h1 {
    font-size: 28px;
    line-height: 1.25;
    letter-spacing: -0.6px;
    font-weight: 600;
  }
}

.invalid-link-explanation {
  color: var(--muted);
  line-height: 1.6;
  margin: 10px 0 20px;
}

.invalid-link-actions {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.invalid-link-support {
  border-top: 1px solid var(--line);
  margin-top: 20px;
  padding-top: 20px;

  .receipt {
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
    margin: 18px 0 24px;
  }

  > p {
    margin: 0;
  }
}

.invalid-link-footer {
  width: var(--column);
  max-width: calc(100% - 32px);
  margin: 64px auto 36px;
  justify-content: flex-end;
  gap: 16px;

  a {
    color: inherit;
  }
}

:where(.invalid-link-layout.mobile) {
  .invalid-link-view {
    margin-top: 36px;

    h1 {
      font-size: 24px;
    }
  }

  .invalid-link-actions {
    flex-direction: column;

    > *,
    .secondary {
      width: 100%;
    }

    .secondary {
      justify-content: center;
    }
  }

  .invalid-link-footer {
    justify-content: flex-start;
    flex-wrap: wrap;
    margin-bottom: 28px;
  }
}
</style>
