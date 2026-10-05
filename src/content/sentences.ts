/** Boundaries of the sentence containing `offset`, for the AI rewrite feature. */
export function sentenceAround(
	text: string,
	offset: number,
): { start: number; end: number; text: string } | null {
	if (!text.trim()) return null;

	// A terminator followed by whitespace. Trailing quotes and brackets belong
	// to the sentence that is ending, not the one that is starting.
	const boundary = /[.!?…]["'”’)\]]*\s+/g;

	let start = 0;
	for (const match of text.matchAll(boundary)) {
		const end = match.index + match[0].length;
		if (end > offset) break;
		start = end;
	}

	boundary.lastIndex = 0;
	let end = text.length;
	for (const match of text.matchAll(boundary)) {
		const stop = match.index + match[0].length;
		if (stop > offset) {
			end = stop;
			break;
		}
	}

	const slice = text.slice(start, end).trim();
	if (!slice) return null;

	// Re-anchor onto the trimmed text so the offsets stay exact.
	const leading = text.slice(start, end).indexOf(slice);
	return { start: start + leading, end: start + leading + slice.length, text: slice };
}
