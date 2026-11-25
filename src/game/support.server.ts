/** Server-only: who has supported Stardrift. */
import { getRequestHeaders } from "@tanstack/react-start/server";
import { type AnyColumn, sql } from "drizzle-orm";
import { db } from "#/db/index";
import { supporters } from "#/db/schema";
import { auth } from "#/lib/auth";
import type { SupportStatus } from "./support";

/**
 * SQL that is true when the account with this id and email has a paid,
 * unrefunded support order: one made while signed in, or one made as a guest
 * with the same email.
 */
export function isSupporter(userId: AnyColumn, email: AnyColumn) {
	return sql<boolean>`exists (
		select 1 from ${supporters}
		where not ${supporters.refunded}
		and (${supporters.userId} = ${userId} or lower(${supporters.email}) = lower(${email}))
	)`;
}

export function supportEnabled() {
	return Boolean(
		process.env.POLAR_ACCESS_TOKEN &&
			process.env.POLAR_WEBHOOK_SECRET &&
			process.env.POLAR_SUPPORT_PRODUCT_ID,
	);
}

export async function readSupportStatus(): Promise<SupportStatus> {
	const session = await auth.api.getSession({ headers: getRequestHeaders() });
	const enabled = supportEnabled();
	if (!session) return { enabled, signedIn: false, supporter: false };
	const { rows } = await db.execute<{ supporter: boolean }>(
		sql`select exists (
			select 1 from ${supporters}
			where not ${supporters.refunded}
			and (${supporters.userId} = ${session.user.id}
				or lower(${supporters.email}) = lower(${session.user.email}))
		) as supporter`,
	);
	return { enabled, signedIn: true, supporter: Boolean(rows[0]?.supporter) };
}
