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

          await waitForTailToStart(outputLines);

          assert(file.links.endpoint, "File should have an endpoint link");
          const resp = await fetch(file.links.endpoint, {
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

        await t.step("tail logs with time options", async () => {
          const [outputLines] = streamVtCommand(
            [
              "tail",
              "--poll-frequency",
              "500",
              "--use-timezone",
              "utc",
              "--24-hour-time",
            ],
            join(tmpDir, val.name),
          );

          await waitForTailToStart(outputLines);

          assert(file.links.endpoint, "File should have an endpoint link");
          await fetch(file.links.endpoint);
          await fetch(file.links.endpoint);
          await fetch(file.links.endpoint);

          await delay(3000);

          const logsOutput = outputLines.join("\n");

          // Check that HTTP request was logged
          assertStringIncludes(logsOutput, "HTTP GET /");

          // Check for 24-hour timestamp format in the HTTP request log line
          // The format should be [HH:MM:SS.mmm] at the start of log lines
          const httpLogLines = outputLines.filter((line) =>
            line.includes("HTTP GET")
          );
          assert(httpLogLines.length > 0, "Should have HTTP request log lines");

          const timestampRegex = /^\[(\d{2}):(\d{2}):(\d{2})\.\d{3}\]/;
          const hasValidTimestamp = httpLogLines.some((line) => {
            const match = line.match(timestampRegex);
            if (match) {
              const hours = parseInt(match[1]);
              // In 24-hour format, hours should be 0-23
              return hours >= 0 && hours <= 23;
            }
            return false;
          });

          assert(
            hasValidTimestamp,
            `Output should contain 24-hour format timestamps. Got: ${logsOutput}`,
          );

          // Ensure no AM/PM indicators are present in HTTP log lines
          const hasAmPm = httpLogLines.some((line) =>
            line.includes(" AM") || line.includes(" PM")
          );
          assert(
            !hasAmPm,
            "Output should not contain AM/PM indicators in 24-hour format",
          );
        });
      });
    });
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

async function waitForTailToStart(outputLines: string[]) {
  do {
    await delay(100);
  } while (
    !outputLines.some((line) => line.includes("Press Ctrl+C to stop."))
  );
  await delay(1000);
}
