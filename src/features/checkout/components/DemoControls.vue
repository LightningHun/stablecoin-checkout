<script setup lang="ts">
import { ref } from "vue";
import { statuses } from "../domain/paymentModel";
const emit = defineEmits<{ refresh: []; reset: [] }>();
const state = ref("awaiting_payment"),
  fault = ref("none"),
  message = ref("");
async function command(path: string, body: unknown) {
  try {
    const response = await fetch("/api/demo/" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw Error("Control failed");
    message.value = "Demo updated";
    emit("refresh");
  } catch {
    message.value = "Demo controls unavailable";
  }
}
async function reset() {
  await command("reset", {});
  emit("reset");
}
</script>
<template>
  <details class="demo-controls" data-testid="demo-controls">
    <summary>Demo controls · no real funds</summary>
    <p>Evaluator tools. Reset before exploring another completed payment.</p>
    <label
      >Payment state<select v-model="state" data-testid="demo-state">
        <option v-for="s in statuses" :key="s">{{ s }}</option>
      </select></label
    ><button
      class="secondary"
      data-testid="demo-apply-state"
      @click="command('scenario', { status: state })"
    >
      Apply state</button
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
      Apply connection</button
    ><button
      class="secondary"
      @click="command('scenario', { advanceMs: 900000 })"
    >
      Advance 15 minutes</button
    ><button class="secondary" data-testid="demo-reset" @click="reset">
      Reset demo
    </button>
    <p role="status">{{ message }}</p>
  </details>
</template>
