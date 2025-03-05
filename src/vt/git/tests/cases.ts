import { ExpectedProjectInode } from "~/vt/git/tests/utils.ts";

interface TestCase {
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
            path: "proudLimeGoose.http.tsx",
            type: "file",
            content: "// Example Content",
          },
          {
            path: "merryCopperAsp.script.tsx",
            type: "file",
            content: "",
          },
          {
            path: "thoughtfulPeachPrimate",
            type: "directory",
          },
          {
            path: "thoughtfulPeachPrimate/clearAquamarineSmelt.cron.tsx",
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
            path: "proudLimeGoose.http.tsx",
            newContent: "// Modified Example Content",
          },
          {
            path: "thoughtfulPeachPrimate/clearAquamarineSmelt.cron.tsx",
            newContent: 'const test = "modified test";',
          },
        ],
        deletedFiles: [
          "merryCopperAsp.script.tsx",
          "thoughtfulPeachPrimate/tirelessHarlequinSmelt",
        ],
      },
      "9de66ac4-f5a6-11ef-817c-569c3dd06744": { // Test Branch
        version: 4,
        expectedInodes: [
          {
            path: "Test.script.tsx",
            type: "file",
            content: "test;",
          },
          {
            path: "TestBranch.http.tsx",
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
