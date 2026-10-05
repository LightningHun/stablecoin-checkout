<script setup lang="ts">
import CheckoutPage from "./features/checkout/CheckoutPage.vue";
import { useMobile } from "./composables/useMobile";

const mobile = useMobile();
</script>
<template><CheckoutPage :mobile="mobile" /></template>
