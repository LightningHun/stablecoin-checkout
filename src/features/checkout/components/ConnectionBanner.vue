<script setup lang="ts">
/**
 * Connection and verification banner for the checkout page. Presentation only:
 * the page decides when it is shown and owns the retry request.
 */
defineProps<{
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
</script>
<template>
  <div class="connection-banner">
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
        <span
          ><strong>Can't reach the payment server.</strong> Showing the last
          verified payment details.</span
        >
      </div>
      <span
        v-if="retryInSeconds !== null"
        class="connection-retry-time"
        data-testid="retry-countdown"
        aria-live="off"
        >Retrying in {{ retryInSeconds }} s.</span
      >
      <span
        v-else-if="requestPending"
        class="connection-retry-time"
        data-testid="request-checking"
        aria-live="off"
        >Checking…</span
      >
      <span
        v-else-if="automaticRetriesPaused"
        data-testid="automatic-retries-paused"
        >Automatic retries paused.</span
      >
    </template>
    <span v-else role="alert"
      ><strong>Can't reach a verified payment update.</strong> {{ error }}
      <span v-if="lastKnownStatus"
        >Last known state: {{ lastKnownStatus.replaceAll("_", " ") }}.</span
      ></span
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
      Retry now
    </button>
    <span
      v-if="manualRetryLimitReached"
      id="manual-retry-guidance"
      data-testid="manual-retry-limit"
      >Manual retry limit reached.</span
    >
    <span
      v-else-if="manualRetryInSeconds > 0"
      id="manual-retry-guidance"
      data-testid="manual-retry-cooldown"
      aria-live="off"
      >You can retry again in {{ manualRetryInSeconds }} s.</span
    >
  </div>
</template>
