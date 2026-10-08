import { createServiceClient, getAuthUserId } from "../_shared/utils.ts";
import { handleAvatarRequest } from "./handler.ts";
import { resolvePlayerAvatars } from "./resolve.ts";

Deno.serve((req) =>
  handleAvatarRequest(req, {
    authenticate: getAuthUserId,
    resolve: (caller, request) =>
      resolvePlayerAvatars(createServiceClient(), caller, request),
  })
);
