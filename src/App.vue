<script setup lang="ts">
import { watch } from "vue";
import { useI18n } from "vue-i18n";
import CheckoutPage from "./features/checkout/CheckoutPage.vue";
import { useMobile } from "./composables/useMobile";

const mobile = useMobile();
const { locale } = useI18n({ useScope: "global" });
watch(locale, (value) => { document.documentElement.lang = value; }, { immediate: true });
</script>
<template><CheckoutPage :mobile="mobile" /></template>
