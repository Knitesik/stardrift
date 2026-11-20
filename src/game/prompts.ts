/**
 * A challenge as the browser sees it. Prompts and their accepted answers are
 * stored in Postgres (see src/db/schema.ts and challenges.server.ts); answers
 * never leave the server.
 */
export interface Prompt {
	id: string;
	text: string;
	category: string;
	/** placeholder shown in the answer box */
	example: string;
}
