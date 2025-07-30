import { doWithNewVal } from "~/vt/lib/tests/utils.ts";
import sdk, { getLatestVersion, getValItem } from "~/sdk.ts";
import { runVtCommand, streamVtCommand } from "~/cmd/tests/utils.ts";
import { assert, assertStringIncludes } from "@std/assert";
import { doWithTempDir } from "~/vt/lib/utils/misc.ts";
import { delay } from "@std/async";
import { join } from "@std/path";

Deno.test({
  name: "tail command with http queries",
  permissions: "inherit",
  async fn(t) {
    await doWithTempDir(async (tmpDir) => {
      await doWithNewVal(async ({ val, branch }) => {
        await t.step("create a file and clone the val", async () => {
          await sdk.vals.files.create(
            val.id,
            {
              path: "main.ts",
              content:
                "export default (req: Request) => {\n  return new Response('OK');\n};",
              branch_id: branch.id,
              type: "http",
            },
          );

          await runVtCommand(
            ["clone", val.name, "--no-editor-files"],
            tmpDir,
          );
        });

        const file = await getValItem(
          val.id,
          branch.id,
          await getLatestVersion(val.id, branch.id),
          "main.ts",
        );
        assert(file, "File should exist in the Val");
        assert(file.links.endpoint, "File should have an endpoint link");

        await t.step("tail logs", async () => {
          const [outputLines] = streamVtCommand(
            ["tail", "--poll-frequency", "500"],
            join(tmpDir, val.name),
          );

          do {
            await delay(100);
          } while (
            !outputLines.some((line) => line.includes("Press Ctrl+C to stop."))
          );
          await delay(1000);

          const resp = await fetch(file.links.endpoint!, {
            headers: { "x-custom-header": "foobar" },
          });
          assert(resp.ok, "Response should be OK");
          assert(await resp.text() === "OK", "Response body should be 'OK'");

          await delay(1000);

          const logsOutput = outputLines.join("\n");
          assertStringIncludes(logsOutput, "HTTP GET /");
          assertStringIncludes(logsOutput, "200 main.ts");
          assertStringIncludes(logsOutput, "X-Custom-Header");
        });
      });
    });
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
