import type { ComponentType } from "react";
import * as track from "./posts/how-to-track-upsc-preparation";
import * as hours from "./posts/how-many-hours-to-study-for-upsc";
import * as revision from "./posts/upsc-revision-schedule-spaced-repetition";
import * as mocks from "./posts/how-to-analyse-upsc-mock-test";
import * as plan from "./posts/how-to-make-upsc-study-plan";
import * as consistency from "./posts/consistency-in-upsc-preparation";

export interface PostBody {
  Body: ComponentType;
  /** The H2s, for the "In this guide" list. Ids must match the headings. */
  toc: { id: string; label: string }[];
}

/** The body of every guide in ./index.ts, by slug. */
export const BODIES: Record<string, PostBody> = {
  "how-to-track-upsc-preparation": { Body: track.default, toc: track.toc },
  "how-many-hours-to-study-for-upsc": { Body: hours.default, toc: hours.toc },
  "upsc-revision-schedule-spaced-repetition": { Body: revision.default, toc: revision.toc },
  "how-to-analyse-upsc-mock-test": { Body: mocks.default, toc: mocks.toc },
  "how-to-make-upsc-study-plan": { Body: plan.default, toc: plan.toc },
  "consistency-in-upsc-preparation": { Body: consistency.default, toc: consistency.toc },
};
