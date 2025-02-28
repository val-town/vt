import ValTown from "@valtown/sdk";
import "@std/dotenv/load";
import { API_KEY_KEY, DEFAULT_BRANCH_NAME } from "~/consts.ts";

const sdk = new ValTown({
  bearerToken: Deno.env.get(API_KEY_KEY)!,
});

export async function defaultBranchId(projectId: string): Promise<string> {
  for await (const branch of sdk.projects.branches.list(projectId, {})) {
    if (branch.name == DEFAULT_BRANCH_NAME) return branch.id;
  }

  throw new Error(`Branch "${DEFAULT_BRANCH_NAME}" not found`);
}

export async function branchIdToName(
  projectId: string,
  branchName: string,
): Promise<string> {
  // Because of a val town bug (see
  // https://www.val.town/v/wolf/ecstaticPeachRat), only unauthenticated
  // requests can query data on val town branches.

  const response = await fetch(
    `https://api.val.town/v1/projects/${projectId}/branches?limit=100`,
  );

  if (!response.ok) {
    throw new Error(
      `Failed to fetch branches: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();

  // deno-lint-ignore no-explicit-any
  const branch = data.data.find((b: any) => b.name === branchName);

  if (!branch) {
    throw new Error(
      `Branch "${branchName}" not found in project "${projectId}"`,
    );
  }

  return branch.id;
}

export const user = await sdk.me.profile.retrieve();
export default sdk;
