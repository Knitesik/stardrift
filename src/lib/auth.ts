import { checkout, polar, webhooks } from "@polar-sh/better-auth";
import { createPolarCore } from "@polar-sh/sdk/2026-10";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { eq } from "drizzle-orm";
import { db } from "#/db/index";
import { account, session, supporters, user, verification } from "#/db/schema";

/**
 * Origins allowed to call the auth API. Better Auth compares bare origins, so
 * a trailing slash or path in the env value would otherwise never match.
 */
const trustedOrigins = [
	...new Set(
		[process.env.BETTER_AUTH_URL, process.env.VITE_SITE_URL]
			.filter((url): url is string => Boolean(url))
			.map((url) => new URL(url).origin),
	),
];

const SUPPORT_PRODUCT_ID = process.env.POLAR_SUPPORT_PRODUCT_ID;

/**
 * Polar checkout for the "Support Stardrift" product, plus the webhook that
 * records each paid order as a supporter. Left out until the Polar env vars
 * are set, so the app runs without a Polar account.
 */
function supportPlugins() {
	const accessToken = process.env.POLAR_ACCESS_TOKEN;
	const secret = process.env.POLAR_WEBHOOK_SECRET;
	if (!accessToken || !secret || !SUPPORT_PRODUCT_ID) return [];
	return [
		polar({
			client: createPolarCore({
				accessToken,
				// tokens and products are separate per environment
				environment:
					process.env.POLAR_SERVER === "production" ? "production" : "sandbox",
			}),
			// customers are created at checkout instead, so a Polar outage can't
			// block sign-ups
			createCustomerOnSignUp: false,
			use: [
				checkout({
					products: [{ productId: SUPPORT_PRODUCT_ID, slug: "support" }],
					successUrl: "/support?thanks=1",
					returnUrl: `${process.env.VITE_SITE_URL}/support`,
					// guests can chip in too; they get the badge by signing up with
					// the same email
					authenticatedUsersOnly: false,
					theme: "dark",
				}),
				webhooks({
					secret,
					onOrderPaid: async ({ data: order }) => {
						if (order.product_id !== SUPPORT_PRODUCT_ID) return;
						const userId = order.customer.external_id;
						const [known] = userId
							? await db
									.select({ id: user.id })
									.from(user)
									.where(eq(user.id, userId))
							: [];
						await db
							.insert(supporters)
							.values({
								orderId: order.id,
								userId: known?.id ?? null,
								email: order.customer.email ?? "",
								amount: order.total_amount,
								currency: order.currency,
							})
							.onConflictDoNothing();
					},
					onOrderRefunded: async ({ data: order }) => {
						await db
							.update(supporters)
							.set({ refunded: true })
							.where(eq(supporters.orderId, order.id));
					},
				}),
			],
		}),
	];
}

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
			redirectURI: `${process.env.VITE_SITE_URL}/api/auth/callback/google`,
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
	plugins: [...supportPlugins(), tanstackStartCookies()],
	trustedOrigins,
});

export type Session = typeof auth.$Infer.Session;
