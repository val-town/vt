import sdk, { fileIdToValFile, getLogsForTraces, getTraces } from "~/sdk.ts";
import VTClient from "~/vt/vt/VTClient.ts";
import { findVtRoot } from "~/vt/vt/utils.ts";
import type ValTown from "@valtown/sdk";
import { basename, dirname, join } from "@std/path";
import { colors } from "@cliffy/ansi/colors";
import { HEADERS_TO_EXCLUDE_PATTERNS, ValItemColors } from "../../consts.ts";
import type { ValItemType } from "../../types.ts";
import { Command } from "@cliffy/command";
import { delay } from "@std/async/delay";
import { SlidingWindowCounter } from "./utils/SlidingWindowCounter.ts";

export const tailCmd = new Command()
  .name("tail")
  .description("Stream logs of a Val")
  .example("vt tail", "Stream the logs of a val")
  .example("vt tail > logs.txt", "Stream the logs of a val to a file")
  .option(
    "--rate-limit <limit:number>",
    "Maximum requests to log per second (default: 100)",
    { default: 5 },
  )
  .option(
    "--wait-for-logs",
    "How long to wait for logs before logging a trace",
    { default: 2000 },
  )
  .option(
    "--reverse-logs",
    "Show logs from latest to earliest (default: earliest to latest)",
    { default: false },
  )
  .action(async (options) => {
    const REQUESTS_PER_SECOND_LIMIT = options.rateLimit;
    const requestCounter = new SlidingWindowCounter(1000);
    let limitWarningPrinted = false;

    const vt = VTClient.from(await findVtRoot(Deno.cwd()));
    const vtState = await vt.getMeta().loadVtState();
    const currentBranchData = await sdk.vals.branches
      .retrieve(vtState.val.id, vtState.branch.id)
      .catch(() => null);
    const printedLogsForTraces = new Set<string>();
    if (!currentBranchData) {
      throw new Error("Failed to get current branch data");
    }

    for await (const trace of getTraces([currentBranchData.id])) {
      await delay(
        typeof options.waitForLogs === "number" ? options.waitForLogs : 2000,
      );
      if (requestCounter.count >= REQUESTS_PER_SECOND_LIMIT) {
        if (!limitWarningPrinted) {
          console.warn(
            colors.red("Receiving high request volume, sampling logs..."),
          );
          limitWarningPrinted = true;
        }
        continue;
      }
      requestCounter.increment();
      printTrace(
        trace,
        vtState.val.id,
        printedLogsForTraces,
        options.reverseLogs,
      );
    }
  });

async function printTrace(
  trace: ValTown.Telemetry.TraceListResponse.Data,
  valId: string,
  printedLogsForTraces: Set<string> = new Set(),
  reverseLogs: boolean = false,
): Promise<void> {
  const attributes = extractAttributes(trace.attributes);
  const valFile = await fileIdToValFile(
    valId,
    attributes["val.branch_id"],
    attributes["val.file_id"],
  );
  const prettyPath = prettyPrintFilePath(valFile.path, valFile.type);

  if (valFile.type !== "http") return;

  const start = parseInt(trace.startTimeUnixNano);
  const end = parseInt(trace.endTimeUnixNano);
  const duration = Math.round((end - start) / 1e6);
  const receivedAt = formatTimeFromUnixNano(start);
  const method = attributes["http.request.method"]?.toUpperCase() || "";
  const url = attributes["url.full"] || "";
  const urlPath = url ? new URL(url).pathname : "";
  const status = parseInt(attributes["http.response.status_code"] || "0");

  if (method && urlPath) {
    console.log(
      `[${receivedAt}] ${colors.bold(method)} ${colors.bold(urlPath)}`,
    );
  }

  if (prettyPath && duration) {
    console.log(
      `  ${colors.dim(`${duration.toString()}ms`)} ${
        colors.yellow(status.toString())
      } ${prettyPath}`,
    );
  }

  const requestHeaders = Object.entries(attributes)
    .filter(([key]) =>
      key.startsWith("http.request.header.") &&
      !HEADERS_TO_EXCLUDE_PATTERNS.some((pattern) => key.match(pattern))
    );

  const responseHeaders = Object.entries(attributes)
    .filter(([key]) =>
      key.startsWith("http.response.header.") &&
      !HEADERS_TO_EXCLUDE_PATTERNS.some((pattern) => key.match(pattern))
    );

  // Compute max key length for both request and response headers
  const allHeaderKeys = [
    ...requestHeaders.map(([key]) => key.replace("http.request.header.", "")),
    ...responseHeaders.map(([key]) => key.replace("http.response.header.", "")),
  ];
  const maxKeyLen = allHeaderKeys.length
    ? Math.max(...allHeaderKeys.map((k) => k.length))
    : 0;

  if (requestHeaders.length) {
    console.log("    Req Headers:");
    requestHeaders.forEach(([key, value]) => {
      const rawKey = key.replace("http.request.header.", "");
      console.log(
        `      ${
          colors.blue(formatHeaderKey(`${rawKey}:`).padEnd(maxKeyLen + 1, " "))
        } ${value}`,
      );
    });
  }

  if (responseHeaders.length) {
    console.log("    Resp Headers:");
    responseHeaders.forEach(([key, value]) => {
      const rawKey = key.replace("http.response.header.", "");
      console.log(
        `      ${
          colors.blue(formatHeaderKey(`${rawKey}:`).padEnd(maxKeyLen + 1, " "))
        } ${value}`,
      );
    });
  }

  const logs = await Array.fromAsync(getLogsForTraces([trace.traceId]));
  // Sort logs by timeUnixNano (earliest to latest by default)
  logs.sort((a, b) => {
    const diff = Number(a.timeUnixNano) - Number(b.timeUnixNano);
    return reverseLogs ? -diff : diff;
  });
  if (logs.length && !printedLogsForTraces.has(trace.traceId)) {
    for (const log of logs) {
      const { severityText: stderrOrStdout } = log as { severityText: string };

      const ts = formatTimeFromUnixNano(+log.timeUnixNano);
      let streamLabel: string;
      if (stderrOrStdout === "stderr") {
        streamLabel = colors.dim(colors.red(stderrOrStdout));
      } else {
        streamLabel = colors.dim(stderrOrStdout);
      }
      if (ts && stderrOrStdout && log.body?.stringValue) {
        console.log(
          `    ${colors.gray(ts)} ${streamLabel}: ${log.body.stringValue}`,
        );
      }
    }
    printedLogsForTraces.add(trace.traceId);
  } else if (!logs.length && valFile.type !== "http") {
    console.log("  No logs found for this trace.");
  }
  console.log();
}

// Pretty print a file path
function prettyPrintFilePath(path: string, type: ValItemType): string {
  // Colorize the basename of the path using ValItemColors
  const coloredBaseName = ValItemColors[type](basename(path));
  // Return the directory name joined with the colored base name
  return join(dirname(path), coloredBaseName);
}

// Format a timestamp from nanoseconds to a human-readable string
function formatTimeFromUnixNano(unixNanoTimestamp: number) {
  // Convert nanoseconds to milliseconds
  const milliseconds = unixNanoTimestamp / 1000000;

  // Create a Date object
  const date = new Date(milliseconds);

  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");
  const millisecondsPart = date.getMilliseconds().toString().padStart(3, "0");

  return `${hours}:${minutes}:${seconds}.${millisecondsPart}`;
}

// Extracts attributes from a log entry and returns them as a key-value object
function extractAttributes(
  attributes: ValTown.Telemetry.Logs.LogListResponse.Data.Attribute[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const attr of attributes) {
    if (attr.value.stringValue) {
      result[attr.key] = attr.value.stringValue;
    } else if (attr.value.intValue !== undefined) {
      result[attr.key] = attr.value.intValue.toString();
    } else if (attr.value.boolValue !== undefined) {
      result[attr.key] = attr.value.boolValue.toString();
    }
  }
  return result;
}

// Makes header keys use capital first letters for each segment
function formatHeaderKey(headerKey: string): string {
  const segments = headerKey.split("-");
  return segments.map((segment) =>
    segment.charAt(0).toUpperCase() + segment.slice(1)
  ).join("-");
}
