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

export async function branchIdToName(
  projectId: string,
  branchName: string,
): Promise<string> {
  // The val town SDK does not properly list branches if there is a forked
  // branch. This seems to be a bug, so we make a direct API call as a somewhat
  // hacky solution.

  const bearerToken = Deno.env.get("VAL_TOWN_BEARER_TOKEN")!;

  const response = await fetch(
    `https://api.val.town/v1/projects/${projectId}/branches?limit=100`,
    { headers: { Authorization: `Bearer ${bearerToken}` } },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to fetch branches: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();
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
