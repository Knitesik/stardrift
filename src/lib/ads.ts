/** AdSense publisher id, e.g. "ca-pub-1234567890123456". Unset hides all ads. */
export const ADSENSE_CLIENT: string | undefined =
	import.meta.env.VITE_ADSENSE_CLIENT || undefined;
/** ad unit id for the results screen */
export const ADSENSE_RESULTS_SLOT: string | undefined =
	import.meta.env.VITE_ADSENSE_RESULTS_SLOT || undefined;
