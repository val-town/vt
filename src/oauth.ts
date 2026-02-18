import * as client from "openid-client";
import {
  IS_LOCAL_ENV,
  OAUTH_SCOPES,
  VAL_TOWN_OAUTH_API_URL,
  VT_CLIENT_NAME,
} from "~/consts.ts";
import open from "open";
import { colors } from "@cliffy/ansi/colors";
import Kia from "kia";

export async function getClientConfig() {
  return await client.discovery(
    new URL(`${VAL_TOWN_OAUTH_API_URL}/oauth`),
    VT_CLIENT_NAME,
    { allowInsecureRequests: true },
    undefined,
    IS_LOCAL_ENV ? { execute: [client.allowInsecureRequests] } : undefined,
  );
}

/** Whether we went through a login session */
export let loggedInInSession = false;

export async function oicdLoginFlow() {
  const config = await getClientConfig();

  const response = await client.initiateDeviceAuthorization(config, {
    scope: OAUTH_SCOPES,
  });

  console.log(
    colors.cyan(
      "\nYou should see the following code in your browser:\n" +
        colors.bold(response.user_code!) + "\n",
    ),
  );

  let spinner: Kia | undefined;
  try {
    spinner = new Kia("Waiting for token...");
    await open(response.verification_uri_complete!);
    spinner.start();
  } catch {
    console.log(
      colors.yellow(
        "We were unable to open your browser automatically. " +
          "Please open the following URL manually to continue the login process:\n",
      ) + colors.cyan(response.verification_uri_complete!),
    );
  }

  const tokens: client.TokenEndpointResponse = await client
    .pollDeviceAuthorizationGrant(config, response, undefined);

  if (spinner?.isSpinning()) {
    spinner.succeed("Login successful!");
    loggedInInSession = true;
  }

  return tokens;
}

export async function refreshTokens(
  refreshToken: string,
) {
  const config = await getClientConfig();

  const refreshed = await client.refreshTokenGrant(
    config,
    refreshToken,
  );

  return refreshed;
}
