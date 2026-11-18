import { continueRender, delayRender, staticFile } from "remotion";

/** The brand's two faces, both OFL: Poppins for type, Comfortaa for the wordmark. */
const FACES: [string, string, string][] = [
  ["Poppins", "Poppins-ExtraLight.ttf", "200"],
  ["Poppins", "Poppins-Light.ttf", "300"],
  ["Poppins", "Poppins-Regular.ttf", "400"],
  ["Poppins", "Poppins-Medium.ttf", "500"],
  ["Poppins", "Poppins-SemiBold.ttf", "600"],
  ["Poppins", "Poppins-Bold.ttf", "700"],
  ["Comfortaa", "Comfortaa-Variable.ttf", "300 700"],
];

let started = false;
export function loadFonts() {
  if (started || typeof document === "undefined") return;
  started = true;
  const handle = delayRender("Loading fonts");
  Promise.all(
    FACES.map(([family, file, weight]) =>
      new FontFace(family, `url(${staticFile(`fonts/${file}`)})`, { weight }).load().then((f) => {
        (document.fonts as any).add(f);
      }),
    ),
  )
    .then(() => continueRender(handle))
    .catch((e) => {
      console.error(e);
      continueRender(handle);
    });
}
