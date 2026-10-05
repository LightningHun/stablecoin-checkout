<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { computed } from "vue";
import { paymentErrorKey } from "../../../i18n/paymentErrors";
import en from "../../../i18n/locales/en";
const statusMessages = en.statuses;
const { t } = useI18n({ useScope: "global" });
/**
 * Connection and verification banner for the checkout page. Presentation only:
 * the page decides when it is shown and owns the retry request.
 */
const props = defineProps<{
  mobile?: boolean;
  error: string;
  connectionIssue: boolean;
  retryInSeconds: number | null;
  requestPending: boolean;
  automaticRetriesPaused: boolean;
  uncertain: boolean;
  busy: boolean;
  manualRetryLimitReached: boolean;
  manualRetryInSeconds: number;
  lastKnownStatus: string | null;
}>();
const emit = defineEmits<{ retry: [] }>();
const displayError = computed(() => {
  const key = paymentErrorKey(props.error);
  return key ? t(key) : props.error;
});
const statusText = computed(() => {
  const state = props.lastKnownStatus;
  return state && Object.hasOwn(statusMessages, state)
    ? t(`statuses.${state}`)
    : state?.replaceAll("_", " ");
});
</script>
<template>
  <div class="connection-banner" :class="{ mobile }">
    <template v-if="connectionIssue">
      <div class="connection-message" role="alert">
        <svg
          class="connection-icon"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M12 3.5l9.5 17H2.5L12 3.5z" />
          <path d="M12 10v5" />
          <circle cx="12" cy="18" r="0.9" fill="currentColor" stroke="none" />
        </svg>
        <i18n-t keypath="connection.lastVerified" tag="span" scope="global">
          <template #heading
            >
<strong>{{ t("connection.unreachable") }}</strong>
</template
          >
        </i18n-t>
      </div>
      <span
        v-if="retryInSeconds !== null"
        class="connection-retry-time"
        data-testid="retry-countdown"
        aria-live="off"
        >{{ t("connection.retrying", { seconds: retryInSeconds }) }}</span
      >
      <span
        v-else-if="requestPending"
        class="connection-retry-time"
        data-testid="request-checking"
        aria-live="off"
        >{{ t("connection.checking") }}</span
      >
      <span
        v-else-if="automaticRetriesPaused"
        data-testid="automatic-retries-paused"
        >{{ t("connection.paused") }}</span
      >
    </template>
    <span v-else role="alert"
      ><strong>{{ t("connection.unverified") }}</strong> {{ displayError }}
      <span v-if="lastKnownStatus">{{
        t("connection.lastState", { state: statusText ?? "" })
      }}</span></span
    >
    <button
      v-if="!uncertain"
      data-testid="retry"
      :disabled="
        busy ||
        requestPending ||
        manualRetryLimitReached ||
        manualRetryInSeconds > 0
      "
      :aria-describedby="
        manualRetryLimitReached || manualRetryInSeconds > 0
          ? 'manual-retry-guidance'
          : undefined
      "
      @click="emit('retry')"
    >
      <svg
        v-if="connectionIssue"
        class="connection-icon"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M20 7v5h-5M20 12a8 8 0 1 0-2.3 5.7" />
      </svg>
      {{ t("connection.retry") }}
    </button>
    <span
      v-if="manualRetryLimitReached"
      id="manual-retry-guidance"
      data-testid="manual-retry-limit"
      >{{ t("connection.manualLimit") }}</span
    >
    <span
      v-else-if="manualRetryInSeconds > 0"
      id="manual-retry-guidance"
      data-testid="manual-retry-cooldown"
      aria-live="off"
      >{{ t("connection.cooldown", { seconds: manualRetryInSeconds }) }}</span
    >
  </div>
</template>
<style lang="scss">
.connection-banner {
  padding: 12px 24px;
  background: var(--ink);
  color: #fff;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 16px;
  font-size: 13px;
}

.connection-message {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;

  > span {
    overflow-wrap: anywhere;
  }
}

.connection-icon {
  width: 16px;
  height: 16px;
  flex: none;
}

.connection-message {
  .connection-icon {
    margin-top: 2px;
  }
}

.connection-retry-time {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.connection-banner {
  button {
    background: none;
    border: 0;
    color: #fff;
    text-decoration: underline;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  &:where(.mobile) {
    flex-direction: column;
    padding: 12px 16px;
    gap: 8px;

    button {
      align-self: center;
    }
  }
}
</style>
