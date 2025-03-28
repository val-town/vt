import { Command } from "@cliffy/command";
import ValTown from "@valtown/sdk";
import {
  displayFileStateChanges,
  noChangesDryRunMsg,
} from "~/cmd/lib/utils.ts";
import { doWithSpinner } from "~/cmd/utils.ts";
import VTClient from "~/vt/vt/VTClient.ts";
import { findVtRoot } from "~/vt/vt/utils.ts";
import { colors } from "@cliffy/ansi/colors";
import { Confirm } from "@cliffy/prompt";

const toListBranchesCmd = "Use `vt branch` to list branches.";
const noChangesToStateMsg = "No changes were made to local state";

export const checkoutCmd = new Command()
  .name("checkout")
  .description("Check out a different branch")
  .arguments("[existingBranchName:string]")
  .option(
    "-b, --branch <newBranchName:string>",
    "Create a new branch with the specified name",
  )
  .option(
    "-d, --dry-run",
    "Show what would be changed during checkout without making any changes",
  )
  .option(
    "-f, --force",
    "Force checkout by ignoring local changes",
  )
  .example(
    "Switch to an existing branch",
    `vt checkout main`,
  )
  .example(
    "Create a new branch",
    `vt checkout -b new-feature`,
  )
  .example(
    "Force checkout ignoring local changes",
    `vt checkout -f main`,
  )
  .example(
    "Create a new branch and force checkout",
    `vt checkout -b bugfix -f`,
  )
  .example(
    "Preview changes without checking out",
    `vt checkout main --dry-run`,
  )
  .action(
    (
      { branch, force, dryRun }: {
        branch?: string;
        force?: boolean;
        dryRun?: boolean;
      },
      existingBranchName?: string,
    ) => {
      doWithSpinner(
        dryRun
          ? "Checking for changes that would occur..."
          : "Checking out branch...",
        async (spinner) => {
          const vt = VTClient.from(await findVtRoot(Deno.cwd()));
          const config = await vt.getMeta().loadConfig();

          // Validate input parameters
          if (!branch && !existingBranchName) {
            throw new Error(
              "Branch name is required. Use -b to create a new branch " +
                toListBranchesCmd,
            );
          }

          try {
            const targetBranch = branch || existingBranchName!;
            const isNewBranch = Boolean(branch);

            // Always do a dry checkout first to check for changes
            const dryCheckoutResult = await vt.checkout(
              branch || existingBranchName!,
              {
                forkedFromId: isNewBranch ? config.currentBranch : undefined,
                dryRun: true,
              },
            );

            if (
              dryCheckoutResult.toBranch &&
              config.currentBranch === dryCheckoutResult.toBranch.id
            ) {
              spinner.warn(
                `You are already on branch "${dryCheckoutResult.fromBranch.name}"`,
              );
              return;
            }

            // Check if dirty, then early exit if it's dirty and they don't
            // want to proceed. If in force mode don't do this check.
            if (await vt.isDirty() && !force && !dryRun) {
              spinner.stop();

              // Inline display of what would be changed when dirty
              displayFileStateChanges(
                dryCheckoutResult.fileStateChanges.filtered({
                  deleted: true,
                  modified: true,
                }),
                {
                  headerText: `Dangerous changes that would occur when ${
                    isNewBranch
                      ? `creating branch "${targetBranch}"`
                      : `checking out "${targetBranch}"`
                  }:`,
                  summaryText: "Would change:",
                  emptyMessage: noChangesToStateMsg,
                  includeSummary: true,
                },
              );
              console.log();

              // Ask for confirmation to proceed despite dirty state
              const shouldProceed = await Confirm.prompt({
                message: colors.yellow(
                  "Project has unpushed changes. " +
                    "Do you want to proceed with checkout anyway?",
                ),
                default: false,
              });

              // Exit if user doesn't want to proceed
              if (!shouldProceed) Deno.exit(0);
              else console.log(); // Newline
            }

            // If this is a dry run then report the changes and exit early.
            if (dryRun) {
              spinner.stop();

              // Inline display of dry run changes
              displayFileStateChanges(dryCheckoutResult.fileStateChanges, {
                headerText: `Changes that would occur when ${
                  isNewBranch
                    ? `creating branch "${targetBranch}"`
                    : `checking out "${targetBranch}"`
                }:`,
                summaryText: "Would change:",
                emptyMessage: noChangesToStateMsg,
                includeSummary: true,
              });
              console.log();

              spinner.succeed(noChangesDryRunMsg);
              return;
            }

            // Perform the actual checkout
            const checkoutResult = await vt.checkout(
              targetBranch,
              {
                forkedFromId: isNewBranch ? config.currentBranch : undefined,
                dryRun: false,
              },
            );

            spinner.stop();

            // Inline display of actual checkout changes
            displayFileStateChanges(checkoutResult.fileStateChanges, {
              headerText: "Changes made to local state during checkout:",
              summaryText: "Changed:",
              showEmpty: false,
              includeSummary: true,
            });
            // If no changes nothing was printed, so we don't need to log state info
            if (checkoutResult.fileStateChanges.changes() > 0) console.log();

            // Report the success, which is either a successful switch or a
            // successful fork
            spinner.succeed(
              isNewBranch
                ? `Created and switched to new branch "${targetBranch}" from "${checkoutResult.fromBranch.name}"`
                : `Switched to branch "${targetBranch}" from "${checkoutResult.fromBranch.name}"`,
            );
          } catch (e) {
            if (e instanceof ValTown.APIError && e.status === 409 && branch) {
              throw new Error(
                `Branch "${branch}" already exists. Choose a new branch name. ` +
                  toListBranchesCmd,
              );
            } else if (
              e instanceof Deno.errors.NotFound && existingBranchName
            ) {
              throw new Error(
                `Branch "${existingBranchName}" does not exist in project. ` +
                  toListBranchesCmd,
              );
            } else throw e;
          }
        },
      );
    },
  );
