/* The interactive demo's guided tour: seven stops in the real app, each
   with what to look at and one thing to try. Every claim here describes
   what the page actually does (see the features page). */

/** The sample aspirant's first name. Made up, like everything in the sample. */
export const SAMPLE_NAME = "Meera";

export interface DemoStep {
  path: string;
  /** The page's name, for "Go to …". */
  page: string;
  title: string;
  body: string;
  /** One thing to do on the page. */
  tryIt: string;
}

export const DEMO_STEPS: DemoStep[] = [
  {
    path: "/dashboard",
    page: "Command Center",
    title: "The whole preparation on one screen",
    body: "Meera's Command Center: today, the year of study days, revision due, mock trends, goals and habits, each worked out from her records on the other pages.",
    tryIt: "Scroll through it. Nothing here is typed in twice.",
  },
  {
    path: "/journal",
    page: "Daily Journal",
    title: "Write the day down in a minute",
    body: "One entry a day: hours by subject, topics finished, revisions, mocks, mood and notes. The dashboard, the heatmap and the habits all read from it.",
    tryIt: "Press Log today, add an hour of a subject and save it.",
  },
  {
    path: "/subjects",
    page: "Subject Progress",
    title: "The syllabus, topic by topic",
    body: "Every GS paper, CSAT, Essay and the optional, with each topic moving from untouched to mastered, and a warning when one goes cold.",
    tryIt: "Change a topic's status and watch its subject move.",
  },
  {
    path: "/revision",
    page: "Revision",
    title: "Know what to revise today",
    body: "Revisions come back at growing gaps of 1, 3, 7, 14, 30 and 60 days. What's overdue and due today is counted, with a forecast of heavy days ahead.",
    tryIt: "Mark one of today's revisions as done. It comes back after a longer gap.",
  },
  {
    path: "/mocks",
    page: "Mock Analytics",
    title: "See where the marks go",
    body: "Ten Prelims GS mocks, three CSAT and two Mains tests, section by section: score and accuracy trends, marks lost to negative marking, and time per section.",
    tryIt: "Compare the first Prelims mock with the latest.",
  },
  {
    path: "/roadmap",
    page: "Roadmap",
    title: "Plan the month and the week",
    body: "This month's plan, with this week's inside it: activities with dates and priorities. Progress counts only what's finished.",
    tryIt: "Tick off one of this week's activities.",
  },
  {
    path: "/coach",
    page: "Study Coach",
    title: "A coach that shows its working",
    body: "A daily briefing and suggestions, each with the records behind it. It runs on fixed rules in your browser, not an AI model, and never changes a plan until you confirm.",
    tryIt: "Read today's briefing, then see what it suggests next.",
  },
];
