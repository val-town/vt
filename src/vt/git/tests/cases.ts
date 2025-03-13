import { ExpectedProjectInode } from "~/vt/git/tests/utils.ts";

export interface TestCaseBranchData {
  version: number;
  expectedInodes: ExpectedProjectInode[];
  modifiedFiles: { path: string; newContent: string }[];
  deletedFiles: string[];
}

export interface TestCase {
  name: string;
  projectId: string;
  branches: {
    [branchId: string]: {
      version: number;
      expectedInodes: ExpectedProjectInode[];
      modifiedFiles: { path: string; newContent: string }[];
      deletedFiles: string[];
    };
  };
}

export const testCases: TestCase[] = [
  {
    name: "/Wolf's vtTestProj",
    projectId: "b95fe488-f4de-11ef-97f1-569c3dd06744",
    branches: {
      "b9602cf4-f4de-11ef-97f1-569c3dd06744": { // Main Branch
        version: 8,
        expectedInodes: [
          {
            path: "proudLimeGoose",
            type: "file",
            content: "// Example Content",
          },
          {
            path: "merryCopperAsp",
            type: "file",
            content: "",
          },
          {
            path: "thoughtfulPeachPrimate",
            type: "directory",
          },
          {
            path: "thoughtfulPeachPrimate/clearAquamarineSmelt",
            type: "file",
            content: 'const test = "test";',
          },
          {
            path: "thoughtfulPeachPrimate/tirelessHarlequinSmelt",
            type: "file",
            content: "",
          },
        ],
        modifiedFiles: [
          {
            path: "proudLimeGoose",
            newContent: "// Modified Example Content",
          },
          {
            path: "thoughtfulPeachPrimate/clearAquamarineSmelt",
            newContent: 'const test = "modified test";',
          },
        ],
        deletedFiles: [
          "merryCopperAsp",
          "thoughtfulPeachPrimate/tirelessHarlequinSmelt",
        ],
      },
      "9de66ac4-f5a6-11ef-817c-569c3dd06744": { // Test Branch
        version: 4,
        expectedInodes: [
          {
            path: "Test",
            type: "file",
            content: "test;",
          },
          {
            path: "TestBranch",
            type: "file",
            content: "// Example Content",
          },
        ],
        modifiedFiles: [],
        deletedFiles: [],
      },
    },
  },
];
