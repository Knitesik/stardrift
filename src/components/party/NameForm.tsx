import { useEffect, useState } from "react";
import { authClient } from "#/lib/auth-client";

const NAME_KEY = "stardrift:name";

export function readSavedName() {
	try {
		return window.localStorage.getItem(NAME_KEY) ?? "";
	} catch {
		return "";
	}
}

export function saveName(name: string) {
	try {
		window.localStorage.setItem(NAME_KEY, name);
	} catch {
		// fine: we'll just ask again next time
	}
}

/**
 * Call sign: the signed-in account's name, else the one remembered on this
 * device. null until known (still mounting or checking the session).
 */
export function useSavedName() {
	const { data: session, isPending } = authClient.useSession();
	const [name, setName] = useState<string | null>(null);
	useEffect(() => {
		if (isPending) return;
		setName(session?.user.name || readSavedName());
	}, [isPending, session?.user.name]);
	return [name, setName] as const;
}

export function NameField({
	value,
	onChange,
	autoFocus = false,
}: {
	value: string;
	onChange: (v: string) => void;
	autoFocus?: boolean;
}) {
	return (
		<label className="block text-left">
			<span className="text-xs uppercase tracking-[0.2em] text-[var(--sd-dim)]">
				Your call sign
			</span>
			<input
				value={value}
				onChange={(e) => onChange(e.target.value)}
				maxLength={20}
				placeholder="e.g. Nova"
				autoComplete="nickname"
				// biome-ignore lint/a11y/noAutofocus: the only field on a single-purpose screen
				autoFocus={autoFocus}
				className="sd-input mt-1.5 w-full"
			/>
		</label>
	);
}
