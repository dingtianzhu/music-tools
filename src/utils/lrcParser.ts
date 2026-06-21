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
  
  // Matches tags like [01:23.45], [1:23.4], [01:23], [0:04.5] etc.
  const tagRegex = /\[(\d+):(\d+)(?:\.(\d+))?\]/g;

  for (const line of lines) {
    if (!line.trim()) continue;

    // Find all timestamp tags in the line
    const tags: number[] = [];
    let match;
    
    tagRegex.lastIndex = 0;
    while ((match = tagRegex.exec(line)) !== null) {
      const min = parseInt(match[1], 10);
      
      // Combine seconds and milliseconds as a decimal string to parse as float
      const secStr = match[2] + (match[3] ? "." + match[3] : "");
      const secondsValue = parseFloat(secStr);
      
      const timeInSeconds = min * 60 + secondsValue;
      tags.push(timeInSeconds);
    }

    // Extract the lyric text (remove all tag patterns)
    const text = line.replace(/\[\d+:\d+(?:\.\d+)?\]/g, "").trim();

    // Only add if we found at least one valid timestamp tag (skips metadata tags like [ar:xxx])
    if (tags.length > 0) {
      for (const time of tags) {
        result.push({ time, text });
      }
    }
  }

  // Sort chronological order
  return result.sort((a, b) => a.time - b.time);
}
