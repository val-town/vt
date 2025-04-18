import { Command } from "@cliffy/command";
import { join } from "@std/path";
import VTClient from "~/vt/vt/VTClient.ts";
import sdk, { projectExists, user } from "~/sdk.ts";
import { APIError } from "@valtown/sdk";
import { doWithSpinner } from "~/cmd/utils.ts";
import { parseProjectUri } from "~/cmd/parsing.ts";
import { randomIntegerBetween } from "@std/random";
import { findVtRoot } from "~/vt/vt/utils.ts";

export const remixCmd = new Command()
  .name("remix")
  .description("Remix a Val Town project")
  .arguments(
    "[fromProjectUri:string] [newProjectName:string] [targetDir:string]",
  )
  .option("--public", "Remix as public project (default)", {
    conflicts: ["private", "unlisted"],
  })
  .option("--private", "Remix as private project", {
    conflicts: ["public", "unlisted"],
  })
  .option("--unlisted", "Remix as unlisted project", {
    conflicts: ["public", "private"],
  })
  .option("--no-editor-files", "Skip creating editor configuration files")
  .option("-d, --description <desc:string>", "Project description")
  .example(
    "Bootstrap a website",
    `
    vt remix std/reactHonoStarter myNewWebsite
    cd ./myNewWebsite
    vt browse
    vt watch # syncs changes to val town`,
  )
  .example(
    "Remix current project",
    `
    vt remix
    # Creates a remix of the current project`,
  )
  .action(async (
    {
      private: isPrivate,
      unlisted,
      description,
      editorFiles = true,
      fromProjectUri,
    }: {
      fromProjectUri?: string;
      public?: boolean;
      private?: boolean;
      unlisted?: boolean;
      description?: string;
      editorFiles?: boolean;
    },
    newProjectName?: string,
    targetDir?: string,
  ) => {
    await doWithSpinner("Remixing Val Town project...", async (spinner) => {
      try {
        const privacy = isPrivate
          ? "private"
          : unlisted
          ? "unlisted"
          : "public";

        if (fromProjectUri) {
          const {
            ownerName: sourceProjectUsername,
            projectName: sourceProjectName,
          } = parseProjectUri(fromProjectUri, user.username!);

          const finalProjectName = newProjectName ??
            await generateUniqueProjectName(sourceProjectName);

          await remixSpecificProject({
            sourceProjectUsername,
            sourceProjectName,
            newProjectName: finalProjectName,
            targetDir,
            privacy,
            description,
            editorFiles,
          });

          spinner.succeed(
            `Remixed "@${sourceProjectUsername}/${sourceProjectName}" to ${privacy} project "@${user.username}/${finalProjectName}"`,
          );
        } else {
          // If they do not provide the project uri of the project that they
          // want to remix, it is assumed that they are trying to remix the
          // current vt directory and that they expect that the current
          // directory is already a vt directory

          const newProjectName = await remixCurrentDirectory({
            privacy,
            description,
            editorFiles,
          });

          spinner.succeed(
            `Remixed current project to ${privacy} project "@${user.username}/${newProjectName}"`,
          );
        }
      } catch (e) {
        if (e instanceof APIError && e.status === 409) {
          throw new Error(`Project name "${newProjectName}" already exists`);
        } else throw e;
      }
    });
  });

async function generateUniqueProjectName(baseName: string): Promise<string> {
  if (
    !await projectExists({
      projectName: baseName,
      username: user.username!,
    })
  ) {
    return baseName;
  }

  return `${baseName}_remix_${randomIntegerBetween(10000, 99999)}`;
}

async function remixSpecificProject(params: {
  sourceProjectUsername: string;
  sourceProjectName: string;
  newProjectName: string;
  targetDir?: string;
  privacy: "public" | "private" | "unlisted";
  description?: string;
  editorFiles: boolean;
}) {
  const {
    sourceProjectUsername,
    sourceProjectName,
    newProjectName,
    targetDir,
    privacy,
    description,
    editorFiles,
  } = params;

  const rootPath = targetDir
    ? join(Deno.cwd(), targetDir, newProjectName)
    : join(Deno.cwd(), newProjectName);

  const vt = await VTClient.remix({
    rootPath,
    srcProjectUsername: sourceProjectUsername,
    srcProjectName: sourceProjectName,
    dstProjectName: newProjectName,
    dstProjectPrivacy: privacy,
    description,
  });

  if (editorFiles) await vt.addEditorFiles();
}

async function remixCurrentDirectory(params: {
  privacy: "public" | "private" | "unlisted";
  description?: string;
  editorFiles: boolean;
}): Promise<string> {
  const { privacy, description, editorFiles } = params;

  const currentVt = VTClient.from(await findVtRoot(Deno.cwd()));
  const vtState = await currentVt.getMeta().loadVtState();
  const projectId = vtState.project?.id || "project";
  const project = await sdk.projects.retrieve(projectId);

  const newProjectName = await generateUniqueProjectName(project.name);
  const newVt = await VTClient.create({
    username: user.username!,
    rootPath: currentVt.rootPath,
    projectName: newProjectName,
    privacy,
    description,
  });

  if (editorFiles) await newVt.addEditorFiles();
  return newProjectName;
}
