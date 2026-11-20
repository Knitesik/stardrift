import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { auth } from "./auth";

export const authClient = createAuthClient({
	// types only: lets the client see fields like user.role
	plugins: [inferAdditionalFields<typeof auth>()],
});
