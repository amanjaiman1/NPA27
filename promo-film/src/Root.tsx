import React from "react";
import { Composition, Still } from "remotion";
import { Hero, HERO_FRAMES, Thumbnail, Vertical15, VERTICAL_FRAMES } from "./compositions/films";
import { loadFonts } from "./styles/fonts";
import { S8Final } from "./scenes/scenes";

loadFonts();

export const Root: React.FC = () => (
  <>
    {/* Designed at 1920 × 1080; the 4K master renders with --scale=2. */}
    <Composition id="Hero" component={Hero} durationInFrames={HERO_FRAMES} fps={30} width={1920} height={1080} />
    <Composition id="Vertical15" component={Vertical15} durationInFrames={VERTICAL_FRAMES} fps={30} width={1080} height={1920} />
    <Still id="Thumbnail" component={Thumbnail} width={1920} height={1080} />
    {/* The website's cover for the film: the end card, without its call to action. */}
    <Still id="Cover" component={() => <S8Final f={200} hideCta />} width={1920} height={1080} />
    <Still id="CoverWithCta" component={() => <S8Final f={200} />} width={1920} height={1080} />
  </>
);
