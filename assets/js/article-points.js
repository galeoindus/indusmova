/* Reuse the app's article paragraph splitter for the static HTML article pages.
 * Loading this as an ES module keeps it under the site's same-origin CSP and
 * keeps sentence/citation handling consistent with the in-app article view.
 *
 * It also brings in the Translate control. That used to be a second <script>
 * tag of its own, which turned out not to be reliable on these pages: the file
 * was fetched and then never evaluated, so the button simply did not appear.
 * Importing it from the one module these pages already run — and catching a
 * failure so a translate problem can never stop the paragraph splitting —
 * removes that whole class of problem and one request with it.
 *
 * The import is started before the splitting, not after: re-reading a long
 * article into points takes a moment, and waiting behind it left the Translate
 * button missing for seconds on exactly the pages that need it most.
 */
import { paragraphsToPoints } from './parse.js';

// Progressive enhancement: the page is complete and readable without it.
import('./article-translate-page.js').catch(() => {});

document.querySelectorAll('.prose').forEach((root) => paragraphsToPoints(root));
