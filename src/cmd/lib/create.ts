import { Command } from "@cliffy/command";
import { basename } from "@std/path";
import VTClient, { assertSafeDirectory } from "~/vt/vt/VTClient.ts";
import { getAllMemberOrgs, getCurrentUser } from "~/sdk.ts";
import { APIError } from "@valtown/sdk";
import { doWithSpinner, getClonePath } from "~/cmd/utils.ts";
import { ensureAddEditorFiles } from "~/cmd/lib/utils/messages.ts";
import { Confirm, Select } from "@cliffy/prompt";
import { DEFAULT_EDITOR_TEMPLATE } from "~/consts.ts";
import { parseValUri } from "./utils/parsing.ts";
import { levenshteinDistance } from "@std/text";
import { colors } from "@cliffy/ansi/colors";

export const createCmd = new Command()
  .name("create")
  .description("Create a new Val")
  .arguments("<valName:string> [targetDir:string]")
  .option(
    "--org-name <org:string>",
    "Create the Val under an organization you are a member of",
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
    "--upload-if-exists",
    "Upload existing files to the new Val if the directory is not empty",
  )
  .option("-d, --description <desc:string>", "Val description")
  .example(
    "Start fresh",
    `vt create my-val
cd ./my-val
vt browse
vt watch # syncs changes to Val town`,
  )
  .example(
    "Work on an existing val",
    `vt clone username/valName
cd ./valName
vim index.tsx
vt push`,
  )
  .example(
    "Upload existing files to a new Val",
    `vt create my-val ./folder/that/has/files/already`,
  )
  .example(
    "Make a new Val in my own account",
    `
vt create @my-username/my-val
`,
  )
  .example(
    "Make a new Val in an org",
    `
vt create @my-org/my-val
`,
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
      const memberOrgs = await getAllMemberOrgs();
      const user = await getCurrentUser();
      let myAccount = false;

      if (valName.includes("/")) {
        const { ownerName, valName: extractedValName } = parseValUri(valName);
        valName = extractedValName;

        if (ownerName === user.username) { // we are in "my account" mode
          myAccount = true;
        } else { // treat it as org name
          orgName = ownerName;
        }
      }

      // Determine privacy setting (defaults to public)
      const privacy = isPrivate ? "private" : unlisted ? "unlisted" : "public";

      spinner.stop();
      if (orgName === undefined && myAccount !== true) {
        const orgNames = memberOrgs.map((o) => o.username!);
        const orgIds = memberOrgs.map((o) => o.id!);

        const orgOrMe = await Select.prompt({
          search: true,
          message:
            "Would you like to create the new Val under an organization you are a member of, or your personal account?",
          default: "Personal Account",
          options: ["Personal Account", ...orgNames],
        });

        if (orgOrMe === "Personal Account") {
          myAccount = true;
        } else {
          // Org usernames are unique, but not in time, so we can use it to grab the index
          orgName = orgIds[orgNames.indexOf(orgOrMe)];
          myAccount = false;

          await assertInOrgAndGetId(orgName, memberOrgs);
        }
      }

      if (orgName !== undefined) {
        await assertInOrgAndGetId(orgName, memberOrgs);
      }

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

      const orgId = memberOrgs.find((o) => o.username === orgName)?.id;

      try {
        const vt = await (myAccount
          ? VTClient.create({
            rootPath: clonePath,
            valName,
            privacy,
            description,
            skipSafeDirCheck: true,
          })
          : VTClient.create({
            rootPath: clonePath,
            valName,
            orgId,
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

async function assertInOrgAndGetId(
  orgName: string,
  memberOrgs: Awaited<ReturnType<typeof getAllMemberOrgs>>,
): Promise<string> {
  const org = memberOrgs.find((o) => o.username === orgName);

  if (!org) {
    const suggestions = memberOrgs
      .map((o) => ({
        name: o.username!,
        distance: levenshteinDistance(orgName, o.username!),
      }))
      .sort((a, b) => a.distance - b.distance);

    const closestMatch = suggestions[0];
    const orgNames = memberOrgs.map((o) => `  - ${o.username}`).join("\n");

    console.log(
      `You are not a member of an organization with the name "${orgName}".`,
    );
    console.log();
    console.log(`You are a member of the following orgs:\n${orgNames}`);
    console.log();

    if (closestMatch) {
      const maxDistance = Math.max(orgName.length, closestMatch.name.length);
      const similarity = 1 - (closestMatch.distance / maxDistance);

      if (similarity >= 0.7) {
        const confirmed = await Confirm.prompt(
          `Did you mean "${colors.bold(closestMatch.name)}"?`,
        );
        if (confirmed) {
          const matchedOrg = memberOrgs.find((o) =>
            o.username === closestMatch.name
          );
          return matchedOrg!.id!;
        }
      }
    }

    throw new Error(`You weren't a member of the org '${orgName}'.`);
  }

  return org.id!;
}
