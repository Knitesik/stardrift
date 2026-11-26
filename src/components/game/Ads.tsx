import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { getSupportStatus } from "#/game/support";
import { ADSENSE_CLIENT, ADSENSE_RESULTS_SLOT } from "#/lib/ads";

const SCRIPT_ID = "sd-adsense";

declare global {
	interface Window {
		adsbygoogle?: unknown[];
	}
}

/**
 * True once we know the viewer should see ads: AdSense is configured and
 * they're not a supporter. Stays false while that's still loading, so a
 * supporter never sees an ad flash in.
 */
function useShowAds() {
	const status = useQuery({
		queryKey: ["support-status"],
		queryFn: () => getSupportStatus(),
		enabled: Boolean(ADSENSE_CLIENT),
		staleTime: 5 * 60_000,
	});
	return Boolean(ADSENSE_CLIENT) && status.isSuccess && !status.data.supporter;
}

/**
 * Loads the AdSense script for viewers who see ads. It also brings Google's
 * consent message (AdSense → Privacy & messaging), which asks UK/EEA players
 * before any personalised ads or analytics cookies; supporters never load it.
 */
export function AdsLoader() {
	const show = useShowAds();
	useEffect(() => {
		if (!show || document.getElementById(SCRIPT_ID)) return;
		const s = document.createElement("script");
		s.id = SCRIPT_ID;
		s.async = true;
		s.crossOrigin = "anonymous";
		s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
		document.head.appendChild(s);
	}, [show]);
	return null;
}

/** One responsive ad under the flight results, with a way to go ad-free. */
export function ResultsAd() {
	const show = useShowAds() && Boolean(ADSENSE_RESULTS_SLOT);
	const ref = useRef<HTMLModElement>(null);

	useEffect(() => {
		// each <ins> is filled once; a new flight mounts a new one
		if (!show || ref.current?.dataset.adsbygoogleStatus) return;
		try {
			window.adsbygoogle = window.adsbygoogle || [];
			window.adsbygoogle.push({});
		} catch {
			// blocked or not ready: the slot just stays empty
		}
	}, [show]);

	if (!show) return null;
	return (
		<div className="mt-6">
			<p className="mb-1.5 flex justify-between text-[11px] uppercase tracking-[0.2em] text-[var(--sd-dim)]">
				<span>Advertisement</span>
				<Link to="/support" className="normal-case tracking-normal underline">
					Go ad-free
				</Link>
			</p>
			<ins
				ref={ref}
				className="adsbygoogle block min-h-[100px] overflow-hidden rounded-xl"
				data-ad-client={ADSENSE_CLIENT}
				data-ad-slot={ADSENSE_RESULTS_SLOT}
				data-ad-format="auto"
				data-full-width-responsive="true"
			/>
		</div>
	);
}
