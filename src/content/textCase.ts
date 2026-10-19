/**
 * Capitalisation matching, kept apart from the card so it can be tested
 * without a DOM — getting this wrong is what turns a helpful synonym into an
 * obvious mistake at the start of a sentence.
 */

/** Gives `replacement` the capitalisation that `original` had. */
export function matchCase(original: string, replacement: string): string {
	// A single capital is a sentence start, not shouting, so "I" must not make
	// its replacement all-caps.
	if (original.length > 1 && original === original.toUpperCase() && /\p{Lu}/u.test(original)) {
		return replacement.toUpperCase();
	}
	if (/^\p{Lu}/u.test(original)) {
		return replacement.charAt(0).toUpperCase() + replacement.slice(1);
	}
	return replacement;
}
