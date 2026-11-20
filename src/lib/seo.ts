/**
 * Page metadata: title, description, canonical URL, Open Graph and Twitter
 * cards. Every route's `head` goes through seo() so they stay consistent.
 */

export const SITE_NAME = "Stardrift";

/** home page and fallback title */
export const SITE_TITLE = `${SITE_NAME} · A daily word game of rare answers`;

/** Public origin, no trailing slash. Set VITE_SITE_URL in production. */
export const SITE_URL = (
	import.meta.env.VITE_SITE_URL ?? "http://localhost:3000"
).replace(/\/+$/, "");

export const SITE_DESCRIPTION =
	"A free daily word game of rare answers. Ten prompts a night: type any answer that fits, and the fewer players who say the same thing, the higher your ship flies.";

export const OG_IMAGE = {
	path: "/og-image.png",
	width: 1200,
	height: 630,
	alt: "Stardrift: a glowing ship climbing past planets in a starry night sky, beside the five rarity tiers from Stardust to Supernova",
};

export function absoluteUrl(path: string) {
	return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export function seo({
	title,
	description = SITE_DESCRIPTION,
	path,
	noindex = false,
}: {
	/** page title without the site name; omit for the home page */
	title?: string;
	description?: string;
	/** canonical path, e.g. "/daily" */
	path: string;
	/** private or per-player pages that shouldn't appear in search */
	noindex?: boolean;
}) {
	const fullTitle = title ? `${title} · ${SITE_NAME}` : SITE_TITLE;
	const url = absoluteUrl(path);
	const image = absoluteUrl(OG_IMAGE.path);
	return {
		meta: [
			{ title: fullTitle },
			{ name: "description", content: description },
			{
				name: "robots",
				content: noindex
					? "noindex, follow"
					: "index, follow, max-image-preview:large",
			},
			{ property: "og:type", content: "website" },
			{ property: "og:site_name", content: SITE_NAME },
			{ property: "og:locale", content: "en_US" },
			{ property: "og:title", content: fullTitle },
			{ property: "og:description", content: description },
			{ property: "og:url", content: url },
			{ property: "og:image", content: image },
			{ property: "og:image:width", content: String(OG_IMAGE.width) },
			{ property: "og:image:height", content: String(OG_IMAGE.height) },
			{ property: "og:image:alt", content: OG_IMAGE.alt },
			{ name: "twitter:card", content: "summary_large_image" },
			{ name: "twitter:title", content: fullTitle },
			{ name: "twitter:description", content: description },
			{ name: "twitter:image", content: image },
			{ name: "twitter:image:alt", content: OG_IMAGE.alt },
		],
		links: [{ rel: "canonical", href: url }],
	};
}
