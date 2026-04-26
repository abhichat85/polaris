/**
 * First-project tour step definitions. Authority: sub-plan 10 Task 6.
 *
 * Each step references a CSS selector on the live editor screen.
 * The `<FirstProjectGuide>` component overlays a tooltip on each, in order,
 * advancing on click.
 */

export interface TourStep {
  id: string
  selector: string
  title: string
  body: string
  /** Tooltip placement relative to the target element. */
  placement: "top" | "right" | "bottom" | "left"
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "chat",
    selector: "[data-tour='chat']",
    title: "1. Talk to the agent",
    body:
      "Describe what you want, in plain English. The agent reads your project, " +
      "writes code, and edits files in real time. You can interrupt with the " +
      "stop button at any time.",
    placement: "right",
  },
  {
    id: "files",
    selector: "[data-tour='files']",
    title: "2. Watch the file tree pulse",
    body:
      "Files glow when the agent writes them. Click any file to open it — " +
      "the editor is read-write, so you can take over from the agent any time.",
    placement: "right",
  },
  {
    id: "preview",
    selector: "[data-tour='preview']",
    title: "3. Live preview",
    body:
      "Your app boots in a sandbox the moment files appear. Hot reload is on; " +
      "every save updates the preview within seconds.",
    placement: "left",
  },
  {
    id: "spec",
    selector: "[data-tour='spec']",
    title: "4. Spec, not vibes",
    body:
      "Every project has a feature spec. The agent reads it before each turn, " +
      "and you can edit it any time. Click here to see the current spec.",
    placement: "left",
  },
  {
    id: "deploy",
    selector: "[data-tour='deploy']",
    title: "5. Ship it",
    body:
      "When you're ready, click Deploy to push to Vercel + Supabase under your " +
      "own accounts. You own the code — push to GitHub any time.",
    placement: "bottom",
  },
] as const
