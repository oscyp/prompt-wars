import {
  corsHeaders,
  errorResponse,
  successResponse,
} from "../_shared/utils.ts";
import {
  type AvatarRequest,
  type AvatarResponse,
  parseAvatarRequest,
} from "./resolve.ts";

export async function handleAvatarRequest(req: Request, deps: {
  authenticate: (req: Request) => Promise<string>;
  resolve: (caller: string, request: AvatarRequest) => Promise<AvatarResponse>;
}): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);
  let caller: string;
  try {
    caller = await deps.authenticate(req);
    if (!caller) throw new Error();
  } catch {
    return errorResponse("Unauthorized", 401);
  }
  let body: AvatarRequest;
  try {
    body = parseAvatarRequest(await req.json());
  } catch {
    return errorResponse(
      "Provide profile_ids and/or battle_ids, at most 50 unique UUIDs",
      400,
    );
  }
  try {
    return successResponse(await deps.resolve(caller, body));
  } catch {
    return errorResponse("Avatar lookup temporarily unavailable", 503);
  }
}
