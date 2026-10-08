import { handleRegistration } from '../_shared/registration-service.ts';
if (import.meta.main) Deno.serve((req) => handleRegistration(req));
