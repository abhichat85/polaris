/**
 * Hand-picked starter prompts for new users. Authority: sub-plan 10 Task 5.
 *
 * Three categories so first-prompt success rate is high:
 *   1. SaaS landing page (front-end heavy, fast win)
 *   2. CRUD app (Supabase auth + table)
 *   3. AI assistant (Anthropic + simple chat UI)
 *
 * Each prompt is verbose enough to give the agent real direction.
 */

export interface StarterPrompt {
  id: string
  title: string
  blurb: string
  /** Emoji used as a quick visual marker. */
  icon: string
  /** The actual prompt sent to the agent on click. */
  prompt: string
}

export const STARTER_PROMPTS: readonly StarterPrompt[] = [
  {
    id: "saas-landing",
    title: "SaaS landing page",
    blurb: "Hero, features grid, pricing, CTA. Tailwind 4, dark mode by default.",
    icon: "✨",
    prompt:
      "Build a modern SaaS landing page for a fictional product called " +
      "\"Nimbus\" (a Pomodoro app that learns your focus patterns). " +
      "Include: a hero section with headline + sub-headline + CTA button, " +
      "a 3-column features grid, a 3-tier pricing table (Free/Pro/Team), " +
      "and a final CTA. Use Tailwind 4, the existing design tokens, and " +
      "render with `bg-surface-0` as the page background. No screenshots needed.",
  },
  {
    id: "crud-app",
    title: "Notes app with auth",
    blurb: "Supabase email-link auth, notes table, list/create/delete UI.",
    icon: "📝",
    prompt:
      "Build a notes app. Use the existing Supabase scaffold for auth " +
      "(email magic link). Add a `notes` table with columns: id (uuid), " +
      "user_id (uuid, fk to auth.users), title (text), body (text), " +
      "created_at (timestamptz default now()). RLS: users can only read/write " +
      "their own rows. Build a `/notes` page that lists the user's notes " +
      "(server component, query Supabase). Add a `/notes/new` form, and a " +
      "delete button per row. Use the Polaris Button + Card components.",
  },
  {
    id: "ai-chat",
    title: "AI chat assistant",
    blurb: "Streaming Anthropic chat with system prompt + message history.",
    icon: "💬",
    prompt:
      "Build a server-side AI chat assistant page at /chat. Use the existing " +
      "Anthropic SDK and stream responses from `claude-sonnet-4-5`. The system " +
      "prompt should make the assistant a friendly product tutor named " +
      "\"Polaris Helper\". UI: a scrollable message list, an input box at the " +
      "bottom, a Send button. Show a typing indicator while streaming. Persist " +
      "messages in localStorage so they survive a refresh. Use the design " +
      "system tokens (surface-1 for the chat shell, surface-3 for message bubbles).",
  },
] as const

export function findStarterPromptById(id: string): StarterPrompt | undefined {
  return STARTER_PROMPTS.find((p) => p.id === id)
}
