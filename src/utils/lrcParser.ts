export interface LyricLine {
  time: number; // time in seconds
  text: string;
}

/**
 * Parses LRC lyrics content into a sorted array of LyricLines.
 * Supports [mm:ss.xx] and [mm:ss] format tags.
 */
export function parseLrc(lrcText: string): LyricLine[] {
  const lines = lrcText.split(/\r?\n/);
  const result: LyricLine[] = [];
  
  // Matches tags like [01:23.45] or [01:23]
  const tagRegex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g;

  for (const line of lines) {
    if (!line.trim()) continue;

    // Find all timestamp tags in the line
    const tags: number[] = [];
    let match;
    
    // We run the regex to find all matches (since a single line can have multiple timestamp tags)
    tagRegex.lastIndex = 0;
    while ((match = tagRegex.exec(line)) !== null) {
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      
      let ms = 0;
      if (match[3]) {
        const msStr = match[3];
        ms = parseInt(msStr, 10);
        // If ms is 2 digits (e.g. .45), it represents hundredths of a second (450ms)
        // If ms is 3 digits (e.g. .450), it represents milliseconds (450ms)
        if (msStr.length === 2) {
          ms *= 10;
        }
      }
      
      const timeInSeconds = min * 60 + sec + ms / 1000;
      tags.push(timeInSeconds);
    }

    // Extract the lyric text (remove all tag patterns)
    const text = line.replace(/\[\d{2}:\d{2}(?:\.\d{2,3})?\]/g, "").trim();

    // Add a line for each timestamp tag found (useful for shared lines)
    for (const time of tags) {
      result.push({ time, text });
    }
  }

  // Sort chronological order
  return result.sort((a, b) => a.time - b.time);
}
