<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import CopyButton from "./CopyButton.vue";

const props = defineProps<{
  reason: string;
  orderInLink: string | null;
  checkedAt: string;
  helpUrl: string | null;
  canGoBack: boolean;
}>();
const heading = ref<HTMLHeadingElement | null>(null);
const reasons: Record<string, string> = {
  malformed_order: "The order code in the link isn’t valid",
  unknown_order: "We can’t find an order for this link",
  invalid_signature: "The link’s signature doesn’t match",
  missing_signature: "The link isn’t signed",
};
const reasonText = computed(() =>
  Object.hasOwn(reasons, props.reason)
    ? reasons[props.reason]
    : "The link could not be verified",
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
    `Reason: ${reasonText.value} · ${props.reason}`,
    `Order in the link: ${props.orderInLink || "none"}`,
    `Opened: ${opened.value}`,
    `Link: ${window.location.href}`,
  ].join("\n"),
);
const externalHelp = computed(() =>
  props.helpUrl ? new URL(props.helpUrl).protocol === "https:" : false,
);
function goBack() {
  window.history.back();
}
onMounted(() => heading.value?.focus());
</script>
<template>
  <div class="invalid-link-layout">
    <header class="merchant-header">
      <div class="merchant">
        <span class="merchant-mark" aria-hidden="true">P</span
        ><span>Payment Project</span>
      </div>
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
      <h1 ref="heading" tabindex="-1">This payment link isn’t valid</h1>
      <p class="invalid-link-explanation">
        We can’t find an order for it, so there is nothing to pay here. Nothing
        has been charged. If a shop sent you this link, go back and start the
        payment again — you’ll get a fresh one.
      </p>
      <div class="invalid-link-actions">
        <button v-if="canGoBack" class="primary" @click="goBack">
          Go back
        </button>
        <CopyButton
          :value="details"
          label="Copy details"
          testid="copy-link-details"
        />
      </div>
      <section class="invalid-link-support" aria-label="For support">
        <div class="eyebrow">For support</div>
        <dl class="receipt">
          <div>
            <dt>Reason</dt>
            <dd>
              {{ reasonText }} · <span class="mono">{{ reason }}</span>
            </dd>
          </div>
          <div>
            <dt>Order in the link</dt>
            <dd class="mono">{{ orderInLink || "—" }}</dd>
          </div>
          <div>
            <dt>Opened</dt>
            <dd>{{ opened }}</dd>
          </div>
        </dl>
        <p class="small muted">
          {{
            helpUrl
              ? "Share these details with the shop or with the Help link below and they can trace the link."
              : "Share these details with the shop and they can trace the link."
          }}
        </p>
      </section>
    </main>
    <footer class="checkout-footer invalid-link-footer">
      <a
        v-if="helpUrl"
        :href="helpUrl"
        :target="externalHelp ? '_blank' : undefined"
        :rel="externalHelp ? 'noopener noreferrer' : undefined"
        >Help</a
      >
      <span>Demo checkout · no real funds</span>
    </footer>
  </div>
</template>
