/**
 * The 58-second film that opens the home page (made in promo-film/).
 * Plain paths with no server-only imports, so both the page's structured data
 * and the client player can use them.
 */
export const FILM = {
  /** 1080p, about 17 MB. */
  src: "/media/doordie-film.mp4",
  /** 720p for phones, about 8 MB. */
  srcSmall: "/media/doordie-film-720.mp4",
  /** The end card without its call to action; the player draws real buttons there. */
  poster: "/media/doordie-film-poster.jpg",
  captions: "/media/doordie-film.vtt",
  seconds: 58,
} as const;
