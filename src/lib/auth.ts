import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { db } from "#/db/index";
import { account, session, user, verification } from "#/db/schema";

export const auth = betterAuth({
	baseURL: process.env.BETTER_AUTH_URL,
	secret: process.env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: { user, session, account, verification },
	}),
	user: {
		additionalFields: {
			// input: false keeps sign-up from setting it
			role: { type: "string", defaultValue: "user", input: false },
		},
	},
	socialProviders: {
		google: {
			clientId: process.env.GOOGLE_CLIENT_ID as string,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
			// the name doubles as the party call sign, which is capped at 20
			mapProfileToUser: (profile) => ({
				name: (profile.given_name || profile.name || "Pilot").slice(0, 20),
			}),
		},
	},
	session: {
		expiresIn: 60 * 60 * 24 * 30, // 30 days
		updateAge: 60 * 60 * 24, // refresh the expiry once a day
		cookieCache: { enabled: true, maxAge: 5 * 60 },
	},
	rateLimit: { enabled: true, window: 60, max: 30 },
	// must stay last so it can set cookies on TanStack Start responses
	plugins: [tanstackStartCookies()],
	trustedOrigins: [process.env.BETTER_AUTH_URL as string],
});

export type Session = typeof auth.$Infer.Session;
