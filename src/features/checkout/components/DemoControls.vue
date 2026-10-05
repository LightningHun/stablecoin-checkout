<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { resetDemoServer } from "../infrastructure/demoReset";
import CopyButton from "./CopyButton.vue";
import { statuses } from "../domain/paymentModel";
const { t } = useI18n({ useScope: "global" });
const props = defineProps<{ orderId: string }>();
const emit = defineEmits<{ reset: [] }>();
const requireSignature = ref(false);
let signatureRevision = 0;
const checkoutUrl = ref("");
const creatingLink = ref(false);
const resetting = ref(false);
const state = ref("awaiting_payment"),
  fault = ref("none"),
  orderAmount = ref("149.90");
type DemoMessage =
  | {
      key:
        | "demo.messages.updated"
        | "demo.messages.unavailable"
        | "demo.messages.resetUnconfirmed";
    }
  | { text: string };
const message = ref<DemoMessage | null>(null);
const messageText = computed(() => {
  const current = message.value;
  return current ? ("key" in current ? t(current.key) : current.text) : "";
});
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
          message.value = { text: problem.title };
          return;
        }
      }
      throw Error("Control failed");
    }
    message.value = { key: "demo.messages.updated" };
  } catch {
    message.value = { key: "demo.messages.unavailable" };
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
    message.value = { key: "demo.messages.updated" };
  } catch {
    message.value = { key: "demo.messages.unavailable" };
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
    message.value = { key: "demo.messages.resetUnconfirmed" };
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
    <summary>{{ t("demo.title") }}</summary>
    <p>{{ t("demo.description") }}</p>
    <label>
      {{ t("demo.orderAmount", { currency: "EUR" }) }}
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
      {{ t("demo.applyAmount") }}
    </button>
    <p class="small muted">
      {{ t("demo.amountHint") }}
    </p>
    <label
      >{{ t("demo.paymentState")
      }}<select v-model="state" data-testid="demo-state">
        <option v-for="s in statuses" :key="s">{{ s }}</option>
      </select></label
    ><button
      class="secondary"
      data-testid="demo-apply-state"
      @click="command('scenario', { status: state })"
    >
      {{ t("demo.applyState") }}
</button
    ><label
      >{{ t("demo.connection")
      }}<select v-model="fault" data-testid="demo-fault">
        <option value="none">{{ t("demo.faults.healthy") }}</option>
        <option value="500">{{ t("demo.faults.http500") }}</option>
        <option value="disconnect">{{ t("demo.faults.disconnect") }}</option>
        <option value="slow">
          {{ t("demo.faults.slow", { seconds: 5 }) }}
        </option>
      </select></label
    ><button
      class="secondary"
      data-testid="demo-apply-fault"
      @click="command('scenario', { fault })"
    >
      {{ t("demo.applyConnection") }}
</button
    ><button
      class="secondary"
      @click="command('scenario', { advanceMs: 900000 })"
    >
      {{ t("demo.advanceTime", { minutes: 15 }) }}
</button
    ><button
      class="secondary"
      data-testid="demo-reset"
      :disabled="resetting"
      @click="reset"
    >
      {{ t("demo.reset") }}
    </button>
    <button class="secondary" :disabled="creatingLink" @click="createOrderLink">
      {{ t("demo.createSignedLink") }}
    </button>
    <label class="demo-signature-control">
      <input
        v-model="requireSignature"
        type="checkbox"
        @change="updateSignatureRequirement"
      />
      {{ t("demo.requireSignedLinks") }}
    </label>
    <div v-if="checkoutUrl" class="demo-issued-link">
      <a :href="checkoutUrl" data-testid="demo-order-link">{{ checkoutUrl }}</a>
      <CopyButton :value="checkoutUrl" :label="t('demo.copyLink')" />
    </div>
    <p role="status">{{ messageText }}</p>
  </details>
</template>

<style lang="scss">
.demo-controls {
  margin: 40px 0;
  padding: 16px;
  border: 1px dashed var(--border);
  color: #555;
  font-size: 12px;

  summary {
    cursor: pointer;
  }

  label {
    display: block;
    margin: 12px 0 4px;
  }

  select {
    display: block;
    width: 100%;
    margin-top: 4px;
    padding: 8px;
  }

  button {
    margin: 4px 8px 4px 0;
  }

  .demo-signature-control {
    display: flex;
    align-items: center;
    gap: 8px;
  }
}

.demo-signature-control {
  input {
    width: auto;
  }
}

.demo-issued-link {
  overflow-wrap: anywhere;

  a {
    display: block;
    margin: 12px 0;
    color: inherit;
  }
}
</style>
