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
        await sdk.vals.branches.create(val.id, { name: "some-other-branch" });
        // (we had an issue a bit back involving tail not working for multi
        // branch vals due to a bug in the sdk's handling of array query params,
        // so we run this test with two branches to make sure it doesn't regress)

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
            ["tail", "--poll-frequency", "500", "--print-headers"],
            join(tmpDir, val.name),
          );

          await waitForTailToStart(outputLines);

          assert(file.links.endpoint, "File should have an endpoint link");
          const resp = await fetch(file.links.endpoint, {
            headers: { "x-custom-header": "foobar" },
          });

          assert(resp.ok, "Response should be OK");
          assert(await resp.text() === "OK", "Response body should be 'OK'");

          // Log delivery has latency (the trace has to be ingested before it
          // can be tailed), so poll the streamed output until every expected
          // line shows up rather than asserting after a single fixed wait.
          const expected = [
            "HTTP GET https://",
            "200 main.ts",
            "X-Custom-Header",
          ];
          await waitForLines(outputLines, expected);

          const logsOutput = outputLines.join("\n");
          for (const expectedLine of expected) {
            assertStringIncludes(logsOutput, expectedLine);
          }
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

/**
 * Polls a growing array of output lines until every expected substring has
 * appeared, or a deadline elapses. Returns as soon as all are present so the
 * test stays fast in the common case while tolerating log-delivery latency.
 *
 * @param outputLines The array being filled by the streamed process output
 * @param expected Substrings that must each appear somewhere in the output
 * @param deadlineMs How long to wait before giving up (default 20s)
 */
async function waitForLines(
  outputLines: string[],
  expected: string[],
  deadlineMs: number = 20_000,
): Promise<void> {
  const start = Date.now();
  while (true) {
    const output = outputLines.join("\n");
    if (expected.every((line) => output.includes(line))) return;
    if (Date.now() - start > deadlineMs) return; // let the asserts report which line is missing
    await delay(250);
  }
}
