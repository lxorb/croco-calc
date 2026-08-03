import { Link } from "@solidjs/meta";
import { createMemo, JSXElement } from "solid-js";

import { Theme } from "../../constants/themes";
import { isDevEnvironment } from "../../utils/env";

/**
 * The croco calc mark ("chomp"), the same artwork that ships as
 * `static/images/favicon/favicon.svg`, rescaled into this 0 0 64 64 box. It is
 * inlined rather than linked so the favicon can be recoloured from the active
 * theme without a fetch (INV-072). Keep in sync with that asset if the mark
 * changes.
 */
const BADGE_PATH =
  "M14.40 0.00L49.60 0.00A14.40 14.40 0 0 1 64.00 14.40L64.00 49.60A14.40 14.40 0 0 1 49.60 64.00L14.40 64.00A14.40 14.40 0 0 1 0.00 49.60L0.00 14.40A14.40 14.40 0 0 1 14.40 0.00Z";

const MARK_PATH =
  "M12.31 14.50L24.35 13.73A3.18 3.18 0 0 1 27.15 15.07L29.34 18.19A4.16 4.16 0 0 0 33.25 19.92L42.72 18.76A4.89 4.89 0 0 1 42.81 18.75L53.45 17.65A3.18 3.18 0 0 1 56.96 20.81L56.96 22.91A3.18 3.18 0 0 1 54.30 26.05L38.15 28.74A3.67 3.67 0 0 0 37.64 35.86L51.91 40.42A2.69 2.69 0 0 1 53.78 42.99L53.78 45.60A3.43 3.43 0 0 1 50.52 49.02L25.63 50.26A5.63 5.63 0 0 1 23.28 49.88L11.22 45.12A6.61 6.61 0 0 1 7.04 38.97L7.04 20.12A5.63 5.63 0 0 1 12.31 14.50ZM16.83 22.67 A4.16 4.16 0 1 0 25.15 22.67 A4.16 4.16 0 1 0 16.83 22.67 Z";

export function FavIcon(props: { theme: Theme }): JSXElement {
  const icon = createMemo<string>(() => {
    let { main, bg } = props.theme;
    if (isDevEnvironment()) {
      [main, bg] = [bg, main];
    }
    if (bg === main) {
      bg = "#111";
      main = "#eee";
    }

    const svgPre = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <path fill="${bg}" d="${BADGE_PATH}"/>
      <path fill="${main}" d="${MARK_PATH}"/>
    </svg>
    `;
    return `data:image/svg+xml;base64,${btoa(svgPre)}`;
  });

  return (
    <Link id="favicon" rel="shortcut icon" type="image/svg+xml" href={icon()} />
  );
}
