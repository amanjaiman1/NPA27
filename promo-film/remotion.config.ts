import { Config } from "@remotion/cli/config";

// Frames are composited as JPEG at high quality; the final encode is done by ffmpeg.
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(95);
Config.setConcurrency(6);
Config.setChromiumOpenGlRenderer("swangle");
Config.setDelayRenderTimeoutInMilliseconds(120000);
if (process.env.REMOTION_BROWSER) Config.setBrowserExecutable(process.env.REMOTION_BROWSER);
