import { createServer, preview } from "vite";
import { createMockServer } from "../backend/server";
const mock = createMockServer();
mock.listen(Number(process.env.MOCK_PORT || 8787), "127.0.0.1");
const app = process.argv.includes("--preview")
  ? await preview()
  : await createServer();
if ("listen" in app) await app.listen();
app.printUrls();
console.log(`Mock API: http://127.0.0.1:${process.env.MOCK_PORT || 8787}`);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    mock.close();
    if ("close" in app) void app.close();
    process.exit(0);
  });
