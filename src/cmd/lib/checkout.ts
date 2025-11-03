import { Command } from "@cliffy/command";
import { doWithSpinner } from "~/cmd/utils.ts";
import VTClient from "~/vt/vt/VTClient.ts";
import { findVtRoot } from "~/vt/vt/utils.ts";
import { colors } from "@cliffy/ansi/colors";
import { Confirm } from "@cliffy/prompt";
import { tty } from "@cliffy/ansi/tty";
import sdk, {
  branchNameToBranch,
  canWriteToVal,
  getLatestVersion,
} from "~/sdk.ts";
import { displayFileStateChanges } from "~/cmd/lib/utils/displayFileStatus.ts";
import {
  noChangesDryRunMsg,
  toListBranchesCmdMsg,
} from "~/cmd/lib/utils/messages.ts";
import ValTown from "@valtown/sdk";

const skippedCheckoutMsg = colors
  .green("Skipped checkout. No changes made.");
const noChangesToStateMsg = "No changes were made to local state";
const currentBranchDoesntExistMsg = colors
  .red("The branch you currently are no longer exists.\n");

export const checkoutCmd = new Command()
  .name("checkout")
  .description("Check out a different branch")
  .arguments("<existingBranchName:string>")
  .option(
    "-b, --branch",
    "Create a new branch with the specified name",
    { default: false },
  )
  .option(
    "-d, --dry-run",
    "Show what would be changed during checkout without making any changes",
    { default: false },
  )
  .option(
    "-f, --force",
    "Force checkout by ignoring local changes",
    { default: false },
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
    async (
      { branch: isNewBranch, force, dryRun },
      branchName,
    ) => {
      await doWithSpinner(
        dryRun
          ? "Checking for changes that would occur..."
          : "Checking out branch...",
        async (spinner) => {
          const rootPath = await findVtRoot(Deno.cwd());
          const vt = VTClient.from(rootPath);
          const vtState = await vt.getMeta().loadVtState();

          // Get the current branch data
          const currentBranchData = await sdk.vals.branches
            .retrieve(vtState.val.id, vtState.branch.id)
            .catch(() => null);

          // Handle the case where the current branch no longer exists as a
          // special case
          if (!currentBranchData) {
            spinner.stop();
            if (isNewBranch) {
              throw new Error(
                currentBranchDoesntExistMsg +
                  colors.yellow(
                    "To continue, check out a branch that exists. " +
                      toListBranchesCmdMsg,
                  ),
              );
            }

            const shouldProceed = await Confirm.prompt({
              message: colors.yellow(
                currentBranchDoesntExistMsg +
                  "It is possible that you have made changes locally since " +
                  "the branch got deleted.\nDo you want to proceed with checkout anyway?",
              ),
              default: false,
            });
            if (!shouldProceed) {
              console.log(skippedCheckoutMsg);
              Deno.exit(0);
            } else {
              spinner.start("Checking out branch...");
              await VTClient.clone({
                branchName,
                version: await getLatestVersion(
                  vtState.val.id,
                  (await branchNameToBranch(vtState.val.id, branchName)).id,
                ),
                rootPath,
                valId: vtState.val.id,
                skipSafeDirCheck: true, // They just agreed that there's nothing important in the dir
              });
              // We don't know the name of the branch we checked out from :(
              spinner.succeed(`Switched to branch "${branchName}"`);
              return;
            }
          }

          try {
            // If they are creating a new branch, ensure that they are the owner of this Val
            if (!(await canWriteToVal(vtState.val.id))) {
              throw new Error(
                "You are not the owner of this Val, you cannot make a new branch.",
              );
            }

            // Always do a dry checkout first to check for changes
            const dryCheckoutResult = await vt.checkout(
              branchName,
              {
                toBranchVersion: vtState.branch.version,
                forkedFromId: isNewBranch ? vtState.branch.id : undefined,
                dryRun: true,
              },
            );

            // Note that if they try to check out to the same branch, we can't
            // even figure that out, because we store the branch ID, not the
            // branch name. So this warning, while useful, won't show up if they
            // are checking out FROM a branch that has been deleted and currently
            // does not exist.
            if (currentBranchData.name === branchName) {
              spinner.warn(
                `You are already on branch "${dryCheckoutResult.fromBranch.name}"`,
              );
              return;
            }

            // Check if dirty, then early exit if it's dirty and they don't
            // want to proceed. If in force mode don't do this check.
            //
            // We cannot safely check out if the result of the checkout would
            // cause any local files to get modified or deleted, unless that file
            // has already been safely pushed. To check if it's already been
            // pushed, we do a .merge on the file state with  the result of
            // vt.status(), which says that the file is not modified. .merge is a
            // right intersection so we overwrite all the previously detected to
            // be dangerous state changes as safe if it's not modified according
            // to vt.status().
            const priorVtStatus = await vt.status();
            const dangerousLocalChanges = dryCheckoutResult
              .fileStateChanges
              .filter(
                (fileStatus) => (fileStatus.status == "deleted" ||
                  fileStatus.status == "modified"),
              )
              .merge(
                priorVtStatus
                  // https://github.com/val-town/vt/pull/71
                  // If a file is modified more recently remotely during a
                  // checkout, then we do not need to count it as a dirty state,
                  // since when we land on the new branch we will not have lost any
                  // local state, since the newest change from the destination was
                  // the remote state of the given file. So, we remap all the
                  // remote modifications to not-modified state, and then do a
                  // right intesection into the dangerousLocalChanges.
                  .map((fileStatus) => {
                    if (
                      fileStatus.status === "modified" &&
                      fileStatus.where === "remote"
                    ) {
                      return {
                        ...fileStatus,
                        status: "not_modified",
                      };
                    }
                    return fileStatus;
                  })
                  .filter((fileStatus) => fileStatus.status === "not_modified"),
              );

            // If we are not creating a new branch we might be in a situation
            // where the result of checking out could cause the current local
            // state to lose unsaved changes
            let prepareForResult = () => {};
            if (!isNewBranch) {
              if (
                (dangerousLocalChanges.modified.length > 0 ||
                  dangerousLocalChanges.deleted.length > 0) &&
                !force && !dryRun
              ) {
                spinner.stop();

                const dangerousChanges = displayFileStateChanges(
                  dangerousLocalChanges,
                  {
                    headerText: `Dangerous changes ${
                      colors.underline("that would occur when")
                    } ${
                      isNewBranch
                        ? `creating branch "${branchName}"`
                        : `checking out "${branchName}"`
                    }:`,
                    summaryText: "Would change:",
                    emptyMessage: noChangesToStateMsg,
                    includeSummary: true,
                  },
                );

                console.log(dangerousChanges);
                console.log();

                // Ask for confirmation to proceed despite dirty state
                const shouldProceed = await Confirm.prompt({
                  message: colors.yellow(
                    "Val has unpushed changes. " +
                      "Do you want to proceed with checkout anyway?",
                  ),
                  default: false,
                });

                // Exit if user doesn't want to proceed
                if (!shouldProceed) {
                  console.log(skippedCheckoutMsg);
                  Deno.exit(0);
                }
                prepareForResult = () =>
                  tty.eraseLines(dangerousChanges.split("\n").length + 3);
              }
            }

            // If this is a dry run then report the changes and exit early.
            if (dryRun) {
              spinner.stop();
              prepareForResult();

              // Inline display of dry run changes
              console.log(
                displayFileStateChanges(dryCheckoutResult.fileStateChanges, {
                  headerText: `Changes ${
                    colors.underline("that would occur")
                  } when ${
                    isNewBranch
                      ? `creating branch "${branchName}"`
                      : `checking out "${branchName}"`
                  }:`,
                  summaryText: "Would change:",
                  emptyMessage: noChangesToStateMsg,
                  includeSummary: true,
                }),
              );
              console.log();

              spinner.succeed(noChangesDryRunMsg);
            } else {
              // Perform the actual checkout
              const checkoutResult = await vt.checkout(
                branchName,
                {
                  dryRun: false,
                  // Undefined --> use current branch
                  forkedFromId: isNewBranch ? vtState.branch.id : undefined,
                },
              );

              spinner.stop();
              prepareForResult();

              // Inline display of actual checkout changes
              console.log(
                displayFileStateChanges(checkoutResult.fileStateChanges, {
                  headerText: `Changes ${
                    colors.underline("made to local state")
                  } during checkout:`,
                  summaryText: "Changed:",
                  showEmpty: false,
                  includeSummary: true,
                }),
              );
              // If no changes nothing was printed, so we don't need to log state info
              if (checkoutResult.fileStateChanges.changes() > 0) {
                console.log("\n");
              }

              // Report the success, which is either a successful switch or a
              // successful fork
              tty.scrollDown(1);
              spinner.succeed(
                isNewBranch
                  ? `Created and switched to new branch "${branchName}" from "${checkoutResult.fromBranch.name}"`
                  : `Switched to branch "${branchName}" from "${checkoutResult.fromBranch.name}"`,
              );
            }
          } catch (e) {
            if (e instanceof ValTown.APIError) {
              if (e.status === 409 && isNewBranch) {
                throw new Error(
                  `Branch "${isNewBranch}" already exists. Choose a new branch name.`,
                );
              } else throw e;
            }
            throw e;
          }
        },
      );
    },
  );
