/**
 * The croco calc font catalogue (INV-064, INV-126).
 *
 * The upstream project shipped 42 webfonts because its drill was partly a
 * legibility exercise. croco calc keeps only what the `fontFamily` config key
 * needs: `Roboto_Mono` — the inherited default, and the face whose digits line
 * a math prompt up in columns — plus one proportional alternative.
 *
 * `frontend/static/webfonts/` holds exactly the files named here, and
 * `vite.config.ts` regenerates the SCSS `$fonts` map consumed by
 * `styles/fonts.scss` from this record.
 *
 * The name is also the CSS `font-family`, with underscores read as spaces,
 * unless `display` overrides it.
 */
export const FONT_NAMES = ["Roboto_Mono", "Lexend_Deca"] as const;

export type KnownFontName = (typeof FONT_NAMES)[number];

export type FontConfig = {
  display?: string;
  weight?: number;
} & (
  | {
      systemFont: true;
      fileName?: never;
    }
  | {
      systemFont?: never;
      fileName: string;
    }
);

export const Fonts: Record<KnownFontName, FontConfig> = {
  Roboto_Mono: {
    fileName: "RobotoMono-Regular.woff2",
  },
  Lexend_Deca: {
    fileName: "LexendDeca-Regular.woff2",
  },
};
