import sdk, { fileIdToValFile, getLogsForTraces, getTraces } from "~/sdk.ts";
import VTClient from "~/vt/vt/VTClient.ts";
import { findVtRoot } from "~/vt/vt/utils.ts";
import type ValTown from "@valtown/sdk";
import { basename, dirname, join } from "@std/path";
import { colors } from "@cliffy/ansi/colors";
import { throttle } from "@std/async/unstable-throttle";
import {
  HEADERS_TO_EXCLUDE_PATTERNS,
  TypeToTypeStr,
  ValItemColors,
} from "~/consts.ts";
import type { ValItemType } from "~/types.ts";
import { Command } from "@cliffy/command";
import { extractAttributes } from "~/cmd/lib/utils/extractAttributes.ts";

export const tailCmd = new Command()
  .name("tail")
  .description("Stream logs of a Val")
  .example("vt tail", "Stream the logs of a val")
  .option(
    "--throttle-to-every <limit:number>",
    "Only log 1 request every n milliseconds",
    { default: 100 },
  )
  .option(
    "--print-headers",
    "Print HTTP request/response headers",
    { default: true },
  )
  .option("--poll-frequency <ms:number>", "Polling frequency in milliseconds", {
    default: 1000,
  })
  .option(
    "--reverse-logs",
    "Show logs from latest to earliest (default: earliest to latest)",
    { default: false },
  )
  .option(
    "--use-timezone <timezone:string>",
    "Display timestamps in the specified time zone (default: local, options: local, utc, or IANA time zone string)",
    { default: "local" },
  )
  .option(
    "--24-hour-time",
    "Display timestamps in 24-hour format (default: 12-hour AM/PM)",
    { default: false },
  )
  .action(async ({
    throttleToEvery,
    printHeaders,
    pollFrequency,
    reverseLogs,
    useTimezone: timeZone,
    "24HourTime": use24HourTime,
  }) => {
    if (throttleToEvery < 0) {
      throw new Error("Throttle limit must be positive.");
    }

    let saidWeWereThrottling = false;

    const vt = VTClient.from(await findVtRoot(Deno.cwd()));
    const vtState = await vt.getMeta().loadVtState();
    const currentBranchData = await sdk.vals.branches
      .retrieve(vtState.val.id, vtState.branch.id)
      .catch(() => null);

    if (!currentBranchData) {
      throw new Error("Failed to get current branch data");
    }

    console.log(
      `Tailing logs for branch ${
        colors.cyan(currentBranchData.name)
      }@${currentBranchData.version}`,
    );
    console.log(colors.dim("Press Ctrl+C to stop."));
    console.log();

    const throttledPrintTrace = throttle(
      async (trace: ValTown.Telemetry.TraceListResponse.Data) => {
        await printTrace({
          trace,
          valId: vtState.val.id,
          printHeaders,
          reverseLogs,
          timeZone,
          use24HourTime,
        });
      },
      throttleToEvery,
    );

    for await (
      const trace of getTraces({
        branchIds: [currentBranchData.id],
        frequency: pollFrequency,
      })
    ) {
      if (throttledPrintTrace.throttling) {
        if (!saidWeWereThrottling) {
          console.log(
            colors.brightRed(colors.bold(`Receiving high request volume.`)) +
              " " +
              colors.yellow(
                `Throttling output to at most 1 request every ${throttleToEvery} milliseconds.\nThis may cause some logs to be skipped.`,
              ),
          );
          console.log("\n");

          saidWeWereThrottling = true;

          // Let them know again after some amount of time
          setTimeout(() => {
            saidWeWereThrottling = false;
          }, SAY_WE_ARE_THROTTLING_AGAIN_AFTER_SECONDS * 1000);
        }
      }
      throttledPrintTrace(trace);
    }
  });

async function printTrace(
  {
    trace,
    valId,
    printHeaders,
    reverseLogs = false,
    timeZone = "local",
    use24HourTime = false,
  }: {
    trace: ValTown.Telemetry.TraceListResponse.Data;
    valId: string;
    printHeaders?: boolean;
    reverseLogs?: boolean;
    timeZone?: string;
    use24HourTime?: boolean;
  },
): Promise<void> {
  const attributes = extractAttributes(trace.attributes);
  const valFile = await fileIdToValFile(
    valId,
    attributes.valBranchId,
    attributes.valFileId,
  );
  const prettyPath = prettyPrintFilePath(valFile.path, valFile.type);
  const typeName = (TypeToTypeStr[valFile.type] || "Unknown").toUpperCase();
  const start = parseInt(trace.startTimeUnixNano);
  const end = parseInt(trace.endTimeUnixNano);
  const duration = Math.round((end - start) / 1e6);

  let status: string | undefined = String(
    valFile.type === "http"
      ? parseInt(attributes.httpResStatusCode)
      : trace.status?.code,
  );
  status = status === "NaN" ? undefined : status;

  switch (valFile.type) {
    case "http": {
      const start = parseInt(trace.startTimeUnixNano);
      const end = parseInt(trace.endTimeUnixNano);
      const duration = Math.round((end - start) / 1e6);
      const receivedAt = formatTimeFromUnixNano(start, timeZone, use24HourTime);
      const method = attributes.httpReqMethod.toUpperCase();
      const url = attributes.urlFull;
      const urlPath = new URL(url).pathname;

      // Print out request trace meta
      console.log(
        `[${receivedAt}] ${colors.dim(typeName)} ${colors.bold(method)} ${
          colors.bold(urlPath)
        }`,
      );
      console.log(
        `  ${colors.dim(`${duration.toString()}ms`)} ${
          colors.yellow(status ?? "??")
        } ${prettyPath}`,
      );

      if (printHeaders) {
        // Get the headers, then filter out our internal headers
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
          ...requestHeaders.map(([key]) =>
            key.replace("http.request.header.", "")
          ),
          ...responseHeaders.map(([key]) =>
            key.replace("http.response.header.", "")
          ),
        ];

        // Find the maximum length of all header keys for alignment
        const maxKeyLen = allHeaderKeys.length
          ? Math.max(...allHeaderKeys.map((k) => k.length))
          : 0;

        // Formatter for header keys to use title case
        const formatHeaderKey = (headerKey: string): string => {
          const segments = headerKey.split("-");
          return segments.map((segment) =>
            segment.charAt(0).toUpperCase() + segment.slice(1)
          ).join("-");
        };

        if (requestHeaders.length) {
          console.log("    Req Headers:");
          requestHeaders.forEach(([key, value]) => {
            const rawKey = key.replace("http.request.header.", "");
            console.log(
              `      ${
                colors.blue(
                  formatHeaderKey(`${rawKey}:`).padEnd(maxKeyLen + 1, " "),
                )
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
                colors.blue(
                  formatHeaderKey(`${rawKey}:`).padEnd(maxKeyLen + 1, " "),
                )
              } ${value}`,
            );
          });
        }
      }

      await printTraceLogs(
        trace,
        reverseLogs,
        valFile.type,
        timeZone,
        use24HourTime,
      );
      break;
    }
    case "interval":
    case "script": {
      console.log(
        `[${formatTimeFromUnixNano(start, timeZone, use24HourTime)}]${
          status !== "" ? ` (${colors.yellow(status ?? "??")})` : ""
        } ${colors.dim(typeName)} ${colors.bold(basename(prettyPath))}`,
      );

      if (prettyPath && duration) {
        console.log(
          `  ${colors.dim(`${duration.toString()}ms`)} ${prettyPath}`,
        );
      }

      await printTraceLogs(
        trace,
        reverseLogs,
        valFile.type,
        timeZone,
        use24HourTime,
      );
      break;
    }
    case "email": {
      const emailAddress = extractEmailFromValFile(valFile);
      console.log(emailAddress);
      console.log(
        `[${formatTimeFromUnixNano(start, timeZone, use24HourTime)}] ${
          colors.dim(typeName)
        } ${colors.bold(basename(prettyPath))} ${emailAddress}`,
      );

      if (prettyPath && duration) {
        console.log(
          `  ${colors.dim(`${duration.toString()}ms`)} ${prettyPath}`,
        );
      }

      await printTraceLogs(
        trace,
        reverseLogs,
        valFile.type,
        timeZone,
        use24HourTime,
      );
      break;
    }
  }

  console.log();
}

// Print all logs for a trace by ID
async function printTraceLogs(
  trace: ValTown.Telemetry.TraceListResponse.Data,
  reverseLogs: boolean,
  valType: ValItemType,
  timeZone: string = "local",
  use24HourTime: boolean = false,
): Promise<void> {
  const logs = await Array.fromAsync(getLogsForTraces([trace.traceId]));
  // Sort logs by timeUnixNano (earliest to latest by default)
  logs.sort((a, b) => {
    const diff = Number(a.timeUnixNano) - Number(b.timeUnixNano);
    return reverseLogs ? -diff : diff;
  });
  if (logs.length) {
    for (const log of logs) {
      const { severityText: stderrOrStdout } = log as {
        severityText: string;
      };

      const ts = formatTimeFromUnixNano(
        +log.timeUnixNano,
        timeZone,
        use24HourTime,
      );
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
  } else if (!logs.length && valType !== "http") {
    console.log(colors.dim("  (no logs found for this trace)"));
  }
}

// Pretty print a file path
function prettyPrintFilePath(path: string, type: ValItemType): string {
  // Colorize the basename of the path using ValItemColors
  const coloredBaseName = ValItemColors[type](basename(path));
  // Return the directory name joined with the colored base name
  return join(dirname(path), coloredBaseName);
}

// Extract the email address from a Val file
export function extractEmailFromValFile(
  valFile: ValTown.Vals.FileRetrieveResponse,
) {
  let label = valFile.id;
  if (valFile.links.endpoint) {
    label = URL.parse(valFile.links.endpoint)?.hostname.split(".")[0] || label;
  }
  return `${label}@valtown.email`;
}

// Format a timestamp from nanoseconds to a human-readable string
function formatTimeFromUnixNano(
  unixNanoTimestamp: number,
  timeZone: string = "local",
  use24HourTime: boolean = false,
) {
  // Convert nanoseconds to milliseconds
  const milliseconds = unixNanoTimestamp / 1000000;
  const date = new Date(milliseconds);

  const tz = (timeZone || "local").toLowerCase();
  const localeOpts: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: !use24HourTime,
    timeZone: tz === "local" ? undefined : (tz === "utc" ? "UTC" : timeZone),
  };

  // Use Intl.DateTimeFormat for time zone support
  const parts = new Intl.DateTimeFormat(
    undefined,
    localeOpts,
  ).formatToParts(date);

  const hourPart = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minutePart = parts.find((p) => p.type === "minute")?.value ?? "00";
  const secondPart = parts.find((p) => p.type === "second")?.value ?? "00";
  const dayPeriod = parts.find((p) => p.type === "dayPeriod")?.value ?? "";
  const millisecondsPart = date.getMilliseconds().toString().padStart(3, "0");

  const displayHours = hourPart.padStart(2, "0");
  const minutes = minutePart.padStart(2, "0");
  const seconds = secondPart.padStart(2, "0");
  const ampm = use24HourTime ? "" : (dayPeriod ? ` ${dayPeriod}` : "");

  return `${displayHours}:${minutes}:${seconds}.${millisecondsPart}${ampm}`;
}

const SAY_WE_ARE_THROTTLING_AGAIN_AFTER_SECONDS = 20;
