import { Command } from "@cliffy/command";
import { basename } from "@std/path";
import VTClient, { assertSafeDirectory } from "~/vt/vt/VTClient.ts";
import { getAllMemberOrgs } from "~/sdk.ts";
import { APIError } from "@valtown/sdk";
import { doWithSpinner, getClonePath } from "~/cmd/utils.ts";
import { ensureAddEditorFiles } from "~/cmd/lib/utils/messages.ts";
import { Confirm, Input, Select } from "@cliffy/prompt";
import { DEFAULT_EDITOR_TEMPLATE } from "~/consts.ts";

export const createCmd = new Command()
  .name("create")
  .description("Create a new Val")
  .arguments("<valName:string> [targetDir:string]")
  .option(
    "--org-name <org:string>",
    'Create the Val under an organization you are a member of, or "me" for your personal account',
  )
  .option("--public", "Create as public Val (default)", {
    conflicts: ["private", "unlisted"],
  })
  .option("--private", "Create as private Val", {
    conflicts: ["public", "unlisted"],
  })
  .option("--unlisted", "Create as unlisted Val", {
    conflicts: ["public", "private"],
  })
  .option("--no-editor-files", "Skip creating editor configuration files")
  .option(
    "--upload-if-exists", // useful for testing
    "Upload existing files to the new Val if the directory is not empty",
  )
  .option("-d, --description <desc:string>", "Val description")
  .example(
    "Start fresh",
    `
vt create my-val
cd ./my-val
vt browse
vt watch # syncs changes to Val town`,
  )
  .example(
    "Work on an existing val",
    `
vt clone username/valName
cd ./valName
vim index.tsx
vt push`,
  )
  .example(
    "Upload existing files to a new Val",
    `vt create my-val ./folder/that/has/files/already`,
  )
  .example(
    "Check out a new branch",
    `
cd ./valName
vt checkout -b my-branch
vim index.tsx
vt push
vt checkout main`,
  )
  .action(async (
    {
      private: isPrivate,
      unlisted,
      description,
      editorFiles,
      uploadIfExists,
      orgName,
    },
    valName: string,
    targetDir?: string,
  ) => {
    await doWithSpinner("Creating new Val...", async (spinner) => {
      const clonePath = getClonePath(targetDir, valName);

      // Determine privacy setting (defaults to public)
      const privacy = isPrivate ? "private" : unlisted ? "unlisted" : "public";

      // If they don't specify an org, including not specifying "me," we check
      // if they are a member of any orgs. If they are, then we offer for them
      // to choose one or "me" interactively.
      //
      // We allow specifying "me" explicitly to mean personal account with the
      // flag to avoid the prompt (which is useful in testing).
      if (!orgName) {
        const orgs = await getAllMemberOrgs();
        const orgNames = orgs.map((o) => o.username!);
        const orgIds = orgs.map((o) => o.id!);
        if (orgNames.length > 0) {
          spinner.stop();
          const orgOrMe = await Select.prompt({
            search: true,
            message:
              "Would you like to create the new Val under an organization you are a member of, or your personal account?",
            default: "Personal Account",
            options: ["Personal Account", ...orgNames],
          });
          if (orgOrMe !== "Personal Account") {
            // Org usernames are unique, but not in time, so we can use it to grab the index
            // (a little janky, but it's what cliffy gives us)
            orgName = orgIds[orgNames.indexOf(orgOrMe)];
          } else {
            orgName = "me"; // remap to magic "me" value
          }
        }
      } else if (orgName !== "me") {
        const orgs = await getAllMemberOrgs();
        const org = orgs.find((o) => o.username === orgName);
        if (!org) {
          const orgNames = orgs.map((o) => `"${o.username}`).join('", ') + '"';
          throw new Error(
            `You are not a member of an organization with the name "${orgName}".\nYou are a member of: ${orgNames}`,
          );
        }
        orgName = org.id!;
      }

      if (orgName && orgName === "me") {
        orgName = undefined; // remap to undefined for personal account, which is the API default
      }

      try {
        try {
          await assertSafeDirectory(clonePath);
        } catch (e) {
          if (e instanceof Error && e.message.includes("not empty")) {
            if (!uploadIfExists) {
              spinner.stop();
              const confirmContinue = await Confirm.prompt(
                `The directory "${
                  basename(clonePath)
                }" already exists and is not empty. Do you want to continue?` +
                  " Existing files will be uploaded to the new Val.",
              );

              if (!confirmContinue) {
                Deno.exit(0);
              }
            }
          } else {
            throw e;
          }
        }

        const vt = await (orgName
          ? VTClient.create({
            rootPath: clonePath,
            valName,
            orgId: orgName,
            privacy,
            description,
            skipSafeDirCheck: true,
          })
          : VTClient.create({
            rootPath: clonePath,
            valName,
            privacy,
            description,
            skipSafeDirCheck: true,
          }));

        if (editorFiles) {
          spinner.stop();
          const { editorTemplate } = await vt.getConfig().loadConfig();
          const confirmed = await Confirm.prompt(
            ensureAddEditorFiles(editorTemplate ?? DEFAULT_EDITOR_TEMPLATE),
          );
          if (confirmed) await vt.addEditorTemplate();
          console.log();
        }

        spinner.succeed(
          `Created ${privacy} Val "${valName}" in "${basename(clonePath)}"`,
        );
      } catch (error) {
        if (error instanceof APIError && error.status === 409) {
          throw new Error(`Val name "${valName}" already exists`);
        } else throw error;
      }
    });
  });
