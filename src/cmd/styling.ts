import { colors } from "@cliffy/ansi/colors";
import { STATUS_COLORS } from "~/consts.ts";

export const error = colors.bold.red;
export const success = colors.bold.green;

export function formatStatus(path: string, status: string): string {
  const config = STATUS_COLORS[status] || { prefix: " ", color: colors.gray };
  return `${config.color(config.prefix)} ${path}`;
}
