import ValTown from "@valtown/sdk";
import "@std/dotenv/load";
import { DEFAULT_BRANCH_NAME } from "~/consts.ts";

const sdk = new ValTown({
  bearerToken: Deno.env.get("VAL_TOWN_BEARER_TOKEN")!,
});

export async function defaultBranchId(projectId: string): Promise<string> {
  for await (const branch of sdk.projects.branches.list(projectId, {})) {
    if (branch.name == DEFAULT_BRANCH_NAME) return branch.id;
  }

  throw new Error(`Branch "${DEFAULT_BRANCH_NAME}" not found`);
}

export async function myProjectNameToId(projectName: string): Promise<string> {
  for await (const project of sdk.me.projects.list({})) {
    if (project.name == projectName) return project.id;
  }

  throw new Error(`Project "${projectName}" not found`);
}

export async function branchIdToName(
  projectId: string,
  branchName: string,
): Promise<string> {
  for await (const branch of sdk.projects.branches.list(projectId, {})) {
    if (branch.name == branchName) return branch.id;
  }

  throw new Error(`Branch "${branchName}" not found in project "${projectId}"`);
}

export const user = await sdk.me.profile.retrieve();
export default sdk;
