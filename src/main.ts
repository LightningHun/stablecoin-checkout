import { createApp } from "vue";
import App from "./App.vue";
import { createCheckoutI18n } from "./i18n";
import "./styles/tokens.css";
import "./styles/network-colors.css";
import "./styles/main.css";
const i18n = createCheckoutI18n(new URLSearchParams(location.search).get("lang"));
createApp(App).use(i18n).mount("#app");
