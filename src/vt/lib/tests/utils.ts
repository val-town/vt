import sdk, {
  branchNameToBranch,
  getAllMemberOrgs,
  randomValName,
} from "~/sdk.ts";

export interface ExpectedValInode {
  path: string;
  type: "file" | "directory";
  content?: string;
}

type ValInfoBase = {
  val: { id: string; name: string };
  branch: { id: string; version: number };
};

type ValInfoInOrg = ValInfoBase & {
  org: { id: string; handle: string };
};

type ValInfoSolo = ValInfoBase;

/**
 * Creates a temporary Val and executes an operation with it.
 * Provides Val and branch information to the operation callback.
 *
 * @param op Function that takes a val, branch, and returns a Promise
 * @returns Promise that resolves to the result of the operation
 */
 // @ts-ignore overload signature mismatch
export async function doWithNewVal<T>(
  op: (valInfo: ValInfoSolo) => Promise<T>,
  options?: { inOrg?: false },
): Promise<T>;
export async function doWithNewVal<T>(
  op: (valInfo: ValInfoInOrg) => Promise<T>,
  options: { inOrg: true },
): Promise<T>;
export async function doWithNewVal<T>(
  op: (valInfo: ValInfoSolo | ValInfoInOrg) => Promise<T>,
  options?: { inOrg: true },
): Promise<T> {
  const inOrg = options?.inOrg ?? false;
  // Create a blank Val with a random name
  const orgInfo = inOrg ? (await getAllMemberOrgs()).at(0) : undefined;
  const val = await sdk.vals.create({
    name: randomValName(),
    description: "This is a test val",
    privacy: "public",
    orgId: orgInfo?.id,
  });

  // Get the main branch ID
  const branch = await branchNameToBranch(val.id, "main");

  try {
    // Execute the provided operation with Val info
    if (inOrg) {
      return await op({
        val,
        org: { handle: orgInfo!.username, id: orgInfo!.id },
        branch,
      } as ValInfoInOrg);
    } else {
      return await op({
        val,
        branch,
      } as ValInfoSolo);
    }
  } finally {
    await sdk.vals.delete(val.id);
  }
}
