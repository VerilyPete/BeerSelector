/**
 * HTML Parser Utility
 *
 * This module provides utilities for parsing HTML content from Flying Saucer API responses,
 * specifically for extracting queued beer information from the memberQueues.php endpoint.
 */

/**
 * Represents a beer in the user's queue
 */
export type QueuedBeer = {
  /** The full name of the beer including container type (e.g., "Firestone Walker Parabola (BTL)") */
  name: string;
  /** The date the beer was added to the queue (e.g., "Apr 08, 2025 @ 03:10:18pm") */
  date: string;
  /** The unique identifier (cid) for the queued beer */
  id: string;
};

/**
 * Parses HTML content from the Flying Saucer queue page to extract queued beer information.
 *
 * This function uses a two-tier regex fallback strategy:
 * 1. Primary regex: Attempts to match the expected HTML structure with brew name and date in a single pass
 * 2. Fallback regex: If primary fails, uses a more flexible pattern to extract data from larger HTML sections
 *
 * The HTML structure being parsed typically looks like:
 * ```html
 * <h3 class="brewName">
 *   Beer Name (Container)
 *   <div class="brew_added_date">Apr 08, 2025 @ 03:10:18pm</div>
 * </h3>
 * ...
 * <a href="deleteQueuedBrew.php?cid=1885490">Delete</a>
 * ```
 *
 * @param html - The HTML content from the memberQueues.php page
 * @returns An array of QueuedBeer objects. Returns empty array if parsing fails or no beers found.
 *
 * @example
 * ```typescript
 * const html = '<h3 class="brewName">Test Beer (Draft)<div class="brew_added_date">Jan 1, 2024</div></h3>...';
 * const beers = parseQueuedBeersFromHtml(html);
 * // Returns: [{ name: 'Test Beer (Draft)', date: 'Jan 1, 2024', id: '12345' }]
 * ```
 */
export const parseQueuedBeersFromHtml = (html: string): QueuedBeer[] => {
  const beers: QueuedBeer[] = [];

  try {
    console.log('Parsing HTML for queued beers');

    // Primary regex: Match brewName, date, and cid in one pattern
    // This regex looks for: <h3 class="brewName">BEER_NAME<div class="brew_added_date">DATE</div></h3>...cid=ID
    const beerEntryRegex = /<h3 class="brewName">(.*?)<div class="brew_added_date">(.*?)<\/div><\/h3>[\s\S]*?<a href="deleteQueuedBrew\.php\?cid=(\d+)"/g;
    let directMatch;

    // Use exec() in a loop to find all matches
    while ((directMatch = beerEntryRegex.exec(html)) !== null) {
      const fullName = directMatch[1].trim();
      const date = directMatch[2].trim();
      const id = directMatch[3];

      console.log(`Direct match - Found queued beer: ${fullName}, ${date}, ID: ${id}`);
      beers.push({ name: fullName, date, id });
    }

    // Fallback regex: If primary regex found nothing, try a more flexible pattern
    if (beers.length === 0) {
      // This pattern captures larger sections and then extracts the date separately
      const beerSectionRegex = /<h3 class="brewName">([\s\S]*?)<\/div><\/h3>([\s\S]*?)<a href="deleteQueuedBrew\.php\?cid=(\d+)"/g;
      let sectionMatch;

      while ((sectionMatch = beerSectionRegex.exec(html)) !== null) {
        let nameSection = sectionMatch[1];
        const id = sectionMatch[3];

        // Extract the date from within the nameSection
        const dateMatch = nameSection.match(/<div class="brew_added_date">(.*?)<\/div>/);
        let date = dateMatch ? dateMatch[1].trim() : 'Date unavailable';

        // Remove the date div from the name section to get just the beer name
        const name = nameSection.replace(/<div class="brew_added_date">.*?<\/div>/, '').trim();

        console.log(`Section match - Found queued beer: ${name}, ${date}, ID: ${id}`);
        beers.push({ name, date, id });
      }
    }

    console.log(`Total queued beers found: ${beers.length}`);
  } catch (error) {
    console.error('Error parsing HTML for queued beers:', error);
  }

  return beers;
};
