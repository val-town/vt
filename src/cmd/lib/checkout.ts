import { Command } from "@cliffy/command";
import ValTown from "@valtown/sdk";
import { doWithSpinner } from "~/cmd/utils.ts";
import VTClient from "~/vt/vt/VTClient.ts";
import { findVtRoot } from "~/vt/vt/utils.ts";
import { colors } from "@cliffy/ansi/colors";
import { Confirm } from "@cliffy/prompt";
import { tty } from "@cliffy/ansi/tty";
import sdk, { user } from "~/sdk.ts";
import { displayFileStateChanges } from "~/cmd/lib/utils/displayFileStatus.ts";
import { noChangesDryRunMsg } from "~/cmd/lib/utils/messages.ts";

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
          const vtState = await vt.getMeta().loadVtState();

          // Get the current branch data
          const currentBranchData = await sdk.projects.branches.retrieve(
            vtState.project.id,
            vtState.branch.id,
          );

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

            if (isNewBranch) {
              // Early exit if they are trying to make a new branch on a
              // project that they don't own
              const projectToPush = await sdk.projects.retrieve(
                vtState.project.id,
              );
              if (projectToPush.author.id !== user.id) {
                throw new Error(
                  "You are not the owner of this project, you cannot make a new branch.",
                );
              }
            }

            // Always do a dry checkout first to check for changes
            const dryCheckoutResult = await vt.checkout(
              branch || existingBranchName!,
              {
                toBranchVersion: vtState.branch.version,
                forkedFromId: isNewBranch ? vtState.branch.id : undefined,
                dryRun: true,
              },
            );

            if (currentBranchData.name === existingBranchName) {
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
                        ? `creating branch "${targetBranch}"`
                        : `checking out "${targetBranch}"`
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
                    "Project has unpushed changes. " +
                      "Do you want to proceed with checkout anyway?",
                  ),
                  default: false,
                });

                // Exit if user doesn't want to proceed
                if (!shouldProceed) Deno.exit(0);
                else {
                  prepareForResult = () =>
                    tty.eraseLines(dangerousChanges.split("\n").length + 3);
                }
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
                      ? `creating branch "${targetBranch}"`
                      : `checking out "${targetBranch}"`
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
                targetBranch,
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
              if (checkoutResult.fileStateChanges.changes() > 0) console.log();

              // Report the success, which is either a successful switch or a
              // successful fork
              tty.scrollDown(1);
              spinner.succeed(
                isNewBranch
                  ? `Created and switched to new branch "${targetBranch}" from "${checkoutResult.fromBranch.name}"`
                  : `Switched to branch "${targetBranch}" from "${checkoutResult.fromBranch.name}"`,
              );
            }
          } catch (e) {
            if (e instanceof ValTown.APIError) {
              if (e.status === 409 && branch) {
                throw new Error(
                  `Branch "${branch}" already exists. Choose a new branch name. ` +
                    toListBranchesCmd,
                );
              } else if (e.status === 404 && existingBranchName) {
                throw new Error(
                  `Branch "${existingBranchName}" does not exist in project. ` +
                    toListBranchesCmd,
                );
              }
            }
            throw e;
          }
        },
      );
    },
  );
