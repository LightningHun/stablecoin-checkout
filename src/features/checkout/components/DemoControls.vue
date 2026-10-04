<script setup lang="ts">
import { ref } from "vue";
import { resetDemoServer } from "../infrastructure/demoReset";
import CopyButton from "./CopyButton.vue";
import { statuses } from "../domain/paymentModel";
const props = defineProps<{ orderId: string }>();
const emit = defineEmits<{ reset: [] }>();
const requireSignature = ref(false);
let signatureRevision = 0;
const checkoutUrl = ref("");
const creatingLink = ref(false);
const resetting = ref(false);
const state = ref("awaiting_payment"),
  fault = ref("none"),
  orderAmount = ref("149.90"),
  message = ref("");
async function command(path: string, body: Record<string, unknown>) {
  try {
    const response = await fetch("/api/demo/" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        path === "scenario" ? { ...body, order_id: props.orderId } : body,
      ),
    });
    if (!response.ok) {
      if (response.status === 400) {
        const problem: unknown = await response.json();
        if (
          problem &&
          typeof problem === "object" &&
          "title" in problem &&
          typeof problem.title === "string"
        ) {
          message.value = problem.title;
          return;
        }
      }
      throw Error("Control failed");
    }
    message.value = "Demo updated";
  } catch {
    message.value = "Demo controls unavailable";
  }
}
async function readSignatureRequirement(event: Event) {
  if (!(event.target as HTMLDetailsElement).open) return;
  const revision = signatureRevision;
  try {
    const response = await fetch("/api/demo", { cache: "no-store" });
    if (!response.ok) return;
    const result: unknown = await response.json();
    if (
      result &&
      typeof result === "object" &&
      "requireSignature" in result &&
      typeof result.requireSignature === "boolean" &&
      revision === signatureRevision
    )
      requireSignature.value = result.requireSignature;
  } catch {
    /* Keep the evaluator's current choice if the control is unavailable. */
  }
}
function updateSignatureRequirement() {
  signatureRevision++;
  void command("scenario", { requireSignature: requireSignature.value });
}
async function createOrderLink() {
  if (creatingLink.value) return;
  creatingLink.value = true;
  checkoutUrl.value = "";
  try {
    const response = await fetch("/api/demo/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: orderAmount.value }),
    });
    const result: unknown = await response.json();
    if (
      !response.ok ||
      !result ||
      typeof result !== "object" ||
      !("checkout_url" in result) ||
      typeof result.checkout_url !== "string" ||
      !/^\/\?order=[^&]+&sig=[0-9a-f]{16}$/.test(result.checkout_url)
    )
      throw Error("Order link unavailable");
    checkoutUrl.value = result.checkout_url;
    message.value = "Demo updated";
  } catch {
    message.value = "Demo controls unavailable";
  } finally {
    creatingLink.value = false;
  }
}
async function reset() {
  if (resetting.value) return;
  resetting.value = true;
  try {
    await resetDemoServer();
    emit("reset");
  } catch {
    message.value =
      "Demo reset could not be confirmed. Your checkout has not been restarted.";
  } finally {
    resetting.value = false;
  }
}
</script>
<template>
  <details
    class="demo-controls"
    data-testid="demo-controls"
    @toggle="readSignatureRequirement"
  >
    <summary>Demo controls · no real funds</summary>
    <p>Evaluator tools. Reset before exploring another completed payment.</p>
    <label>
      Order amount (EUR)
      <input
        v-model="orderAmount"
        type="text"
        inputmode="decimal"
        data-testid="demo-order-amount"
      />
    </label>
    <button
      class="secondary"
      data-testid="demo-apply-amount"
      @click="command('scenario', { orderAmount })"
    >
      Apply amount
    </button>
    <p class="small muted">
      Applies to the next quote. Use Change or Reset demo to re-quote.
    </p>
    <label
      >Payment state<select v-model="state" data-testid="demo-state">
        <option v-for="s in statuses" :key="s">{{ s }}</option>
      </select></label
    ><button
      class="secondary"
      data-testid="demo-apply-state"
      @click="command('scenario', { status: state })"
    >
      Apply state
</button
    ><label
      >Connection<select v-model="fault" data-testid="demo-fault">
        <option value="none">Healthy</option>
        <option value="500">HTTP 500</option>
        <option value="disconnect">Disconnect</option>
        <option value="slow">Slow (5 seconds)</option>
      </select></label
    ><button
      class="secondary"
      data-testid="demo-apply-fault"
      @click="command('scenario', { fault })"
    >
      Apply connection
</button
    ><button
      class="secondary"
      @click="command('scenario', { advanceMs: 900000 })"
    >
      Advance 15 minutes
</button
    ><button
      class="secondary"
      data-testid="demo-reset"
      :disabled="resetting"
      @click="reset"
    >
      Reset demo
    </button>
    <button class="secondary" :disabled="creatingLink" @click="createOrderLink">
      Create signed order link
    </button>
    <label class="demo-signature-control">
      <input
        v-model="requireSignature"
        type="checkbox"
        @change="updateSignatureRequirement"
      />
      Require signed links
    </label>
    <div v-if="checkoutUrl" class="demo-issued-link">
      <a :href="checkoutUrl" data-testid="demo-order-link">{{ checkoutUrl }}</a>
      <CopyButton :value="checkoutUrl" label="Copy link" />
    </div>
    <p role="status">{{ message }}</p>
  </details>
</template>
