import { beforeEach } from "vitest";
import { config } from "@vue/test-utils";
import { createCheckoutI18n } from "../src/i18n";
beforeEach(() => { config.global.plugins = [createCheckoutI18n()]; });
