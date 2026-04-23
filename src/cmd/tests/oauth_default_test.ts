import { assertEquals, assertStringIncludes } from "@std/assert";
import { VTConfigSchema } from "~/vt/vt/schemas.ts";
import { doWithTempDir } from "~/vt/lib/utils/misc.ts";
import { runVtCommand } from "~/cmd/tests/utils.ts";
import { join } from "@std/path";
import { ensureDir } from "@std/fs";
import { stringify as stringifyYaml } from "@std/yaml";

/**
 * Tests for issue #230: OAuth as default authentication.
 *
 * These tests verify:
 * 1. The config schema accepts OAuth token lengths (43 chars)
 * 2. Auth-exempt commands (login, logout, upgrade) don't require auth
 * 3. Error messages reference `vt login` as the primary recovery action
 */

// ---------------------------------------------------------------------------
// Schema validation: OAuth token length acceptance
// ---------------------------------------------------------------------------

Deno.test({
  name: "VTConfigSchema accepts 32-char API keys",
  fn() {
    const key = "a".repeat(32);
    const result = VTConfigSchema.safeParse({ apiKey: key });
    assertEquals(result.success, true);
  },
});

Deno.test({
  name: "VTConfigSchema accepts 33-char API keys",
  fn() {
    const key = "a".repeat(33);
    const result = VTConfigSchema.safeParse({ apiKey: key });
    assertEquals(result.success, true);
  },
});

Deno.test({
  name: "VTConfigSchema accepts 43-char OAuth access tokens",
  fn() {
    const key = "a".repeat(43);
    const result = VTConfigSchema.safeParse({ apiKey: key });
    assertEquals(result.success, true);
  },
});

Deno.test({
  name: "VTConfigSchema rejects invalid token lengths",
  fn() {
    const key = "a".repeat(20);
    const result = VTConfigSchema.safeParse({ apiKey: key });
    assertEquals(result.success, false);
  },
});

Deno.test({
  name: "VTConfigSchema accepts null apiKey",
  fn() {
    const result = VTConfigSchema.safeParse({ apiKey: null });
    assertEquals(result.success, true);
  },
});

Deno.test({
  name: "VTConfigSchema accepts refreshToken alongside apiKey",
  fn() {
    const result = VTConfigSchema.safeParse({
      apiKey: "a".repeat(43),
      refreshToken: "some_refresh_token_value",
    });
    assertEquals(result.success, true);
  },
});

Deno.test({
  name: "VTConfigSchema accepts null refreshToken",
  fn() {
    const result = VTConfigSchema.safeParse({
      apiKey: "a".repeat(32),
      refreshToken: null,
    });
    assertEquals(result.success, true);
  },
});

// ---------------------------------------------------------------------------
// Auth-exempt commands: login, logout, upgrade should not require auth
// ---------------------------------------------------------------------------

Deno.test({
  name: "vt upgrade does not require authentication",
  permissions: "inherit",
  async fn() {
    await doWithTempDir(async (tmpDir) => {
      // Create a minimal config with a null (invalid) apiKey so that
      // ensureValidApiKey() would normally trigger the onboard flow.
      const configDir = join(tmpDir, "vt");
      await ensureDir(configDir);
      await Deno.writeTextFile(
        join(configDir, "config.yaml"),
        stringifyYaml({ apiKey: null }),
      );

      // `vt upgrade` should run without triggering auth. It will fail
      // because there's no real upgrade to do, but it should NOT prompt
      // for login or crash with an auth error.
      const [output, _code] = await runVtCommand(
        ["upgrade"],
        tmpDir,
        { env: { "XDG_CONFIG_HOME": tmpDir }, autoConfirm: false },
      );

      // The output should NOT contain the onboarding/auth prompt text
      assertEquals(
        output.includes("authenticate with Val Town"),
        false,
        "upgrade command should not trigger authentication flow",
      );
    });
  },
  sanitizeResources: false,
});

// ---------------------------------------------------------------------------
// Error message improvements
// ---------------------------------------------------------------------------

Deno.test({
  name: "sanitizeErrors for 401 mentions vt login",
  async fn() {
    // Import and test the sanitizeErrors function directly
    const { sanitizeErrors } = await import("~/cmd/utils.ts");
    const ValTown = (await import("@valtown/sdk")).default;

    // Create a mock 401 error
    const error = new ValTown.APIError(
      401,
      { message: "Unauthorized" },
      "Unauthorized",
      {},
    );

    const message = sanitizeErrors(error);
    assertStringIncludes(
      message,
      "vt login",
      "401 error message should suggest `vt login`",
    );
  },
});
