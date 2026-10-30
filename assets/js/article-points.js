/* Reuse the app's article paragraph splitter for the static HTML article pages.
 * Loading this as an ES module keeps it under the site's same-origin CSP and
 * keeps sentence/citation handling consistent with the in-app article view.
 */
import { paragraphsToPoints } from './parse.js';

document.querySelectorAll('.prose').forEach((root) => paragraphsToPoints(root));
