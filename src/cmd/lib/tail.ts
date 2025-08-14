import sdk, {
  branchNameToBranch,
  fileIdToValFile,
  getCurrentUser,
  getLogsForTraces,
  getTraces,
} from "~/sdk.ts";
import VTClient from "~/vt/vt/VTClient.ts";
import { findVtRoot } from "~/vt/vt/utils.ts";
import type ValTown from "@valtown/sdk";
import { basename, dirname, join } from "@std/path";
import { colors } from "@cliffy/ansi/colors";
import { DEFAULT_HOSTNAME, TypeToTypeStr, ValItemColors } from "~/consts.ts";
import type { ValItemType } from "~/types.ts";
import { Command } from "@cliffy/command";
import { extractAttributes } from "~/cmd/lib/utils/extractAttributes.ts";
import { parseValUrl } from "~/cmd/parsing.ts";

export const tailCmd = new Command()
  .name("tail")
  .description("Stream logs of a Val")
  .arguments("[valUri:string] [branchName:string]")
  .example("vt tail", "Stream the logs of a val")
  .example(
    "vt tail @wolf/someval",
    "Stream the logs all branches on @wolf/someval",
  )
  .example(
    "vt tail @wolf/someval main",
    "Stream the logs of the main branch on @wolf/someval",
  )
  .example(
    "vt tail https://www.val.town/x/wolf/someval --print-headers",
    "Stream the logs of a Val using its URL, including HTTP headers in logs",
  )
  .option(
    "--print-headers",
    "Print HTTP request/response headers",
    { default: false },
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
    "--24-hour-time",
    "Display timestamps in 24-hour format (default: 12-hour AM/PM)",
    { default: false },
  )
  .action(async (
    {
      printHeaders,
      pollFrequency,
      reverseLogs,
      "24HourTime": use24HourTime,
    },
    valUri,
    branchName,
  ) => {
    let branchIds: string[];
    null;
    if (valUri) {
      const user = await getCurrentUser();
      const parsed = parseValUrl(valUri, user.username!);
      const val = await sdk.alias.username.valName.retrieve(
        parsed.ownerName,
        parsed.valName,
      );

      if (!branchName) {
        const branchesInVal = await Array.fromAsync(
          sdk.vals.branches.list(val.id, {}),
        );
        branchIds = branchesInVal.map((b) => b.id);
      } else {
        const branch = await branchNameToBranch(val.id, branchName);
        if (!branch) {
          throw new Error(
            `Branch "${branchName}" not found in Val`,
          );
        }
        branchIds = [branch.id];
      }

      console.log(
        `Tailing logs for ${
          colors.cyan(
            `@${parsed.ownerName}/${parsed.valName}${
              branchName ? `:${branchName}` : ""
            }`,
          )
        }`,
      );
    } else {
      const vt = VTClient.from(await findVtRoot(Deno.cwd()));
      const vtState = await vt.getMeta().loadVtState();
      const currentBranchData = await sdk.vals.branches.retrieve(
        vtState.val.id,
        vtState.branch.id,
      );
      branchIds = [vtState.branch.id];
      console.log(
        `Tailing logs for branch ${
          colors.cyan(currentBranchData.name)
        }@${currentBranchData.version}`,
      );
    }

    console.log(colors.dim("Press Ctrl+C to stop."));
    console.log();

    for await (
      const trace of getTraces({
        branch_ids: branchIds,
        frequency: pollFrequency,
      })
    ) {
      await printTraceEnd({
        trace: trace,
        printHeaders,
        reverseLogs,
        use24HourTime,
      });
      await new Promise((res) => setTimeout(res, 70)); // Prevents crazy console spam. TODO: real throttling
    }
  });

async function printTraceEnd(
  {
    trace,
    printHeaders,
    reverseLogs = false,
    use24HourTime = false,
  }: {
    trace: ValTown.Telemetry.TraceListResponse.Data;
    printHeaders?: boolean;
    reverseLogs?: boolean;
    use24HourTime?: boolean;
  },
): Promise<void> {
  const attributes = extractAttributes(trace.attributes);
  const valFile = await fileIdToValFile(attributes.valFileId);
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
      const receivedAt = formatTimeFromUnixNano(start, use24HourTime);
      const method = attributes.httpReqMethod.toUpperCase();
      const fullUrl = attributes.urlFull;
      const prettyUrl = prettyPrintUrl(new URL(fullUrl));

      // Print out request trace meta
      console.log(
        `[${receivedAt}] ${colors.dim(typeName)} ${colors.bold(method)} ${
          colors.bold(prettyUrl)
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
          .filter(([key]) => key.startsWith("http.request.header."));
        const responseHeaders = Object.entries(attributes)
          .filter(([key]) => key.startsWith("http.response.header."));

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
          console.log(`    Req Headers:`);
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
          console.log(`    Resp Headers:`);
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

      await printTraceLogs({
        trace,
        reverseLogs,
        valType: valFile.type,
        use24HourTime,
      });
      break;
    }
    case "interval":
    case "script": {
      console.log(
        `[${formatTimeFromUnixNano(start, use24HourTime)}] ${
          colors.dim(typeName)
        } ${colors.bold(basename(prettyPath))}${
          status ? ` ${colors.yellow(status)}` : ""
        }`,
      );

      if (prettyPath && duration) {
        console.log(
          `  ${colors.dim(`${duration.toString()}ms`)} ${prettyPath}`,
        );
      }

      await printTraceLogs({
        trace,
        reverseLogs,
        valType: valFile.type,
        use24HourTime,
      });
      break;
    }
    case "email": {
      const emailAddress = extractEmailFromValFile(valFile);
      console.log(
        `[${formatTimeFromUnixNano(start, use24HourTime)}] ${
          colors.dim(typeName)
        } ${colors.bold(basename(prettyPath))} ${emailAddress}`,
      );

      if (prettyPath && duration) {
        console.log(
          `  ${colors.dim(`${duration.toString()}ms`)} ${prettyPath}`,
        );
      }

      await printTraceLogs({
        trace,
        reverseLogs,
        valType: valFile.type,
        use24HourTime,
      });
      break;
    }
  }

  console.log();
}

// Print all logs for a trace by ID
async function printTraceLogs({
  trace,
  reverseLogs,
  valType,
  use24HourTime = false,
}: {
  trace: ValTown.Telemetry.TraceListResponse.Data;
  reverseLogs: boolean;
  valType: ValItemType;
  use24HourTime?: boolean;
}): Promise<void> {
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
    console.log(
      `  ${colors.dim("(no logs found for this trace)")}`,
    );
  }
}

// Pretty print a URL with colored components
function prettyPrintUrl(url: URL): string {
  const hostname = !DEFAULT_HOSTNAME.test(url.hostname)
    ? url.hostname
    : colors.cyan(url.hostname);

  const pathPart = colors.bold(
    colors.blue(`${url.pathname}${url.search || ""}${url.hash || ""}`),
  );

  const port = url.port ? ":" + url.port : "";
  return `${url.protocol}//${hostname}${port}${pathPart}`;
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
  use24HourTime: boolean = false,
) {
  const date = new Date(unixNanoTimestamp / 1000000);

  const timeString = date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: !use24HourTime,
  });

  const milliseconds = date.getMilliseconds().toString().padStart(3, "0");
  return `${timeString}.${milliseconds}`;
}
