/**
 * Generates an error message for commands that cannot be executed with unpushed changes
 *
 * @param command - The command that was attempted to be executed
 * @param forceFlag - The flag to force execution despite local changes, defaults to "-f"
 * @returns A formatted error message string indicating how to bypass the restriction
 */
export function dirtyErrorMsg(command: string, forceFlag: string = "-f") {
  return `Cannot ${command} with unpushed changes, use \`${command} ${forceFlag}\` to ignore local changes`;
}
