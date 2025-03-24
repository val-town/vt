import { Command } from "@cliffy/command";
import ValTown from "@valtown/sdk";
import type { CheckoutResult } from "~/vt/lib/checkout.ts";
import {
  dirtyErrorMsg,
  displayFileStateChanges,
  noChangesDryRunMsg,
} from "~/cmd/lib/utils.ts";
import { doWithSpinner } from "~/cmd/utils.ts";
import VTClient from "~/vt/vt/VTClient.ts";
import { findVtRoot } from "~/vt/vt/utils.ts";
import { branchIdToBranch } from "~/sdk.ts";
import { colors } from "@cliffy/ansi/colors";

const toListBranches = "Use \`vt branch\` to list branches.";

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

          const statusResult = await vt.status();

          if (
            !force &&
            (!branch && existingBranchName &&
              (await vt.isDirty({ fileStateChanges: statusResult }) ||
                await vt.isDirty({
                  fileStateChanges: await vt.status({
                    branchId: (await branchIdToBranch(
                      config.projectId,
                      existingBranchName,
                    )).id,
                  }),
                })))
          ) {
            if (dryRun) {
              spinner.warn(
                colors.red("Current local state is dirty.") +
                  " A " + colors.yellow(colors.bold("`checkout -f`")) +
                  " is needed to checkout.",
              );
              console.log();
            } else throw new Error(dirtyErrorMsg("checkout"));
          }

          let checkoutResult: CheckoutResult;

          if (branch) {
            // -b flag was used, create new branch from source
            try {
              checkoutResult = await vt
                .checkout(branch, {
                  forkedFromId: config.currentBranch,
                  fileStateChanges: statusResult,
                  dryRun,
                });

              spinner.stop();

              // Display the changes that would be or were made
              displayFileStateChanges(checkoutResult.fileStateChanges, {
                headerText: dryRun
                  ? `Changes that would occur when creating branch "${branch}":`
                  : "Changes made to local state during checkout:",
                summaryPrefix: dryRun ? "Would change:" : "Changed:",
                emptyMessage: dryRun
                  ? "No changes would be made to local state"
                  : "No changes were made to local state",
                includeSummary: true,
              });
              console.log();

              if (dryRun) {
                spinner.succeed(noChangesDryRunMsg);
              } else {
                spinner.succeed(
                  `Created and switched to new branch "${branch}" from "${checkoutResult.fromBranch.name}"`,
                );
              }
            } catch (e) {
              if (e instanceof ValTown.APIError && e.status === 409) {
                throw new Error(
                  `Branch "${branch}" already exists. Choose a new branch name. ` +
                    toListBranches,
                );
              } else throw e; // Re-throw error if it's not a 409
            }
          } else if (existingBranchName) {
            try {
              checkoutResult = await vt.checkout(existingBranchName, {
                fileStateChanges: statusResult,
                dryRun,
              });

              spinner.stop();

              // Display the changes that would be or were made
              displayFileStateChanges(checkoutResult.fileStateChanges, {
                headerText: dryRun
                  ? `Changes that would occur when checking out "${existingBranchName}":`
                  : "Changes made to local state during checkout:",
                summaryPrefix: dryRun ? "Would change:" : "Changed:",
                emptyMessage: dryRun
                  ? "No changes would be made to local state"
                  : "No changes were made to local state",
                includeSummary: true,
              });
              console.log();

              if (dryRun) {
                spinner.succeed(noChangesDryRunMsg);
              } else {
                spinner.succeed(
                  `Switched to branch "${existingBranchName}" from "${checkoutResult.fromBranch.name}"`,
                );
              }
            } catch (e) {
              if (e instanceof Deno.errors.NotFound) {
                throw new Error(
                  `Branch "${existingBranchName}" does not exist in project. ` +
                    toListBranches,
                );
              } else throw e; // Re-throw other errors
            }
          } else {
            throw new Error(
              "Branch name is required. Use -b to create a new branch " +
                toListBranches,
            );
          }
        },
      );
    },
  );
