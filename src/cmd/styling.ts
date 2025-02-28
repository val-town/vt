import { colors } from "@cliffy/ansi/colors";

export const error = colors.bold.red;
export const success = colors.bold.green;

export function formatStatus(path: string, status: string): string {
  const statusColors: Record<string, (text: string) => string> = {
    modified: colors.yellow,
    created: colors.green,
    deleted: colors.red,
    renamed: colors.blue,
    not_modified: colors.gray,
  };

  const prefix = status === "renamed"
    ? "R"
    : status === "modified"
    ? "M"
    : status === "deleted"
    ? "D"
    : status === "created"
    ? "A"
    : " ";

  const colorFn = statusColors[status] || colors.gray;
  return `${colorFn(prefix)} ${path}`;
}
