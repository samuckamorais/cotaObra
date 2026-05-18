/**
 * Simple Levenshtein distance based fuzzy matching.
 */
export function levenshtein(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;

  if (an === 0) return bn;
  if (bn === 0) return an;

  const matrix: number[][] = [];

  for (let i = 0; i <= an; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= bn; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= an; i++) {
    for (let j = 1; j <= bn; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,       // deletion
        matrix[i][j - 1] + 1,       // insertion
        matrix[i - 1][j - 1] + cost, // substitution
      );
    }
  }

  return matrix[an][bn];
}

/**
 * Find best match above threshold using normalized Levenshtein similarity.
 * @param input - User input string
 * @param candidates - List of candidate strings to match against
 * @param threshold - Minimum similarity score (0 to 1, default 0.7)
 * @returns Best matching candidate or null if none above threshold
 */
export function fuzzyMatch(
  input: string,
  candidates: string[],
  threshold = 0.7,
): string | null {
  const normalizedInput = input.toLowerCase().trim();

  let bestMatch: string | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const normalizedCandidate = candidate.toLowerCase().trim();
    const maxLen = Math.max(normalizedInput.length, normalizedCandidate.length);

    if (maxLen === 0) continue;

    const distance = levenshtein(normalizedInput, normalizedCandidate);
    const similarity = 1 - distance / maxLen;

    // Also check substring containment for partial matches
    const containsBonus =
      normalizedCandidate.includes(normalizedInput) ||
      normalizedInput.includes(normalizedCandidate)
        ? 0.2
        : 0;

    const score = Math.min(similarity + containsBonus, 1);

    if (score > bestScore && score >= threshold) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  return bestMatch;
}
