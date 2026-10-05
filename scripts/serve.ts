import { createServer, preview } from "vite";
import { createMockServer } from "../backend/server";
import { createMockProxyLogging } from "./mockProxyLogging";
const logging = createMockProxyLogging();
const mock = createMockServer({ onDisconnect: logging.onDisconnect });
const proxy = {
  "/api": {
    target: `http://127.0.0.1:${process.env.MOCK_PORT || 8787}`,
    changeOrigin: true,
    configure: logging.configure,
  },
};
const viteOptions = {
  customLogger: logging.logger,
  server: { proxy },
  preview: { proxy },
};
mock.listen(Number(process.env.MOCK_PORT || 8787), "127.0.0.1");
const app = process.argv.includes("--preview")
  ? await preview(viteOptions)
  : await createServer(viteOptions);
if ("listen" in app) await app.listen();
app.printUrls();
console.log(`Mock API: http://127.0.0.1:${process.env.MOCK_PORT || 8787}`);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    mock.close();
    if ("close" in app) void app.close();
    process.exit(0);
  });
