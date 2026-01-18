import { Command } from "@cliffy/command";
import ValTown from "@valtown/sdk";
import { doWithSpinner } from "~/cmd/utils.ts";
import { parseValUri } from "~/cmd/lib/utils/parsing.ts";
import sdk, { getCurrentUser, valExists } from "~/sdk.ts";
import { randomIntegerBetween } from "@std/random";
import { join } from "@std/path";
import VTClient from "~/vt/vt/VTClient.ts";
import { findVtRoot } from "~/vt/vt/utils.ts";

export const remixCmd = new Command()
  .name("remix")
  .description("Remix a Val")
  .arguments(
    "[fromValUri:string] [newValName:string] [targetDir:string]",
  )
  .option("--public", "Remix as public Val (default)", {
    conflicts: ["private", "unlisted"],
  })
  .option("--private", "Remix as private Val", {
    conflicts: ["public", "unlisted"],
  })
  .option("--unlisted", "Remix as unlisted Val", {
    conflicts: ["public", "private"],
  })
  .option("--no-editor-files", "Skip creating editor configuration files")
  .option("-d, --description <desc:string>", "Val description")
  .example(
    "Bootstrap a website",
    `
vt remix std/reactHonoStarter myNewWebsite
cd ./myNewWebsite
vt browse
vt watch # syncs changes to val town`,
  )
  .example(
    "Remix current Val",
    `
    vt remix
    # Creates a remix of the current Val`,
  )
  .action(async (
    {
      public: _public,
      private: isPrivate,
      unlisted,
      description,
      editorFiles = true,
    }: {
      public?: boolean;
      private?: boolean;
      unlisted?: boolean;
      description?: string;
      editorFiles?: boolean;
    },
    fromValUri?: string,
    newValName?: string,
    targetDir?: string,
  ) => {
    await doWithSpinner("Remixing Val...", async (spinner) => {
      try {
        const user = await getCurrentUser();

        const privacy = isPrivate
          ? "private"
          : unlisted
          ? "unlisted"
          : "public";

        if (fromValUri) {
          const {
            ownerName: sourceValUsername,
            valName: sourceValName,
          } = parseValUri(fromValUri, user.username!);

          const finalValName = newValName ??
            await generateUniqueProjectName(sourceValName);

          await remixSpecificProject({
            sourceValUsername,
            sourceValName,
            newValName: finalValName,
            targetDir,
            privacy,
            description,
            editorFiles,
          });

          spinner.succeed(
            `Remixed "@${sourceValUsername}/${sourceValName}" to ${privacy} Val "@${user.username}/${finalValName}"`,
          );
        } else {
          const newProjectName = await remixCurrentDirectory({
            privacy,
            description,
            editorFiles,
            user,
          });

          spinner.succeed(
            `Remixed current Val to ${privacy} Val "@${user.username}/${newProjectName}"`,
          );
        }
      } catch (e) {
        if (e instanceof ValTown.APIError && e.status === 409) {
          throw new Error(`Val name "${newValName}" already exists`);
        } else throw e;
      }
    });
  });

async function generateUniqueProjectName(baseName: string): Promise<string> {
  const user = await getCurrentUser();
  if (
    !await valExists({
      valName: baseName,
      username: user.username!,
    })
  ) {
    return baseName;
  }

  return `${baseName}_remix_${randomIntegerBetween(10000, 99999)}`;
}

async function remixSpecificProject({
  sourceValUsername,
  sourceValName,
  newValName,
  targetDir,
  privacy,
  description,
  editorFiles,
}: {
  sourceValUsername: string;
  sourceValName: string;
  newValName: string;
  targetDir?: string;
  privacy: "public" | "private" | "unlisted";
  description?: string;
  editorFiles: boolean;
}) {
  const rootPath = targetDir
    ? join(Deno.cwd(), targetDir, newValName)
    : join(Deno.cwd(), newValName);

  const vt = await VTClient.remix({
    rootPath,
    srcValUsername: sourceValUsername,
    srcValName: sourceValName,
    dstValName: newValName,
    dstValPrivacy: privacy,
    description,
  });

  if (editorFiles) await vt.addEditorTemplate();
}

async function remixCurrentDirectory({
  privacy,
  description,
  editorFiles,
  user,
}: {
  privacy: "public" | "private" | "unlisted";
  description?: string;
  editorFiles: boolean;
  user: ValTown.User;
}): Promise<string> {
  const currentVt = VTClient.from(await findVtRoot(Deno.cwd()));
  const vtState = await currentVt.getMeta().loadVtState();
  const valId = vtState.val.id;
  const val = await sdk.vals.retrieve(valId);

  const newValName = await generateUniqueProjectName(val.name);
  console.log("newValName", newValName);
  const newVt = await VTClient.create({
    username: user.username!,
    rootPath: currentVt.rootPath,
    valName: newValName,
    privacy,
    description,
    skipSafeDirCheck: true,
  });

  if (editorFiles) await newVt.addEditorTemplate();
  return newValName;
}
