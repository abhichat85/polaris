import { serve } from "inngest/next";

import { inngest } from "@/inngest/client";
import { processMessage } from "@/features/conversations/inngest/process-message";
import { agentLoop } from "@/features/conversations/inngest/agent-loop";
import { planRun } from "@/features/conversations/inngest/plan";
import { evalRun } from "@/features/conversations/inngest/eval";
import {
  docGarden,
  docGardenScheduler,
} from "@/features/conversations/inngest/doc-garden";
import {
  preferenceMineUser,
  preferenceMiningScheduler,
} from "@/features/conversations/inngest/preference-mining";
import { promptEnrichmentScorer } from "@/features/conversations/inngest/prompt-enrichment-scorer";
import { exportToGitHub } from "@/features/projects/inngest/github-export";
import { deployPipeline } from "@/features/deploy/inngest/deploy-pipeline";
import { importRepo as githubImportRepo } from "@/features/github/inngest/import-repo";
import { pushRepo as githubPushRepo } from "@/features/github/inngest/push-repo";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processMessage,    // legacy — being replaced by agentLoop (Article XIX migration)
    agentLoop,         // new — uses ModelAdapter + AgentRunner per sub-plan 01
    planRun,           // D-026 — Planner agent (plans-as-files)
    evalRun,           // D-028 — Evaluator agent (sprint-scoped grading)
    docGarden,            // Wave 4.2 — per-project doc drift detection
    docGardenScheduler,   // Wave 4.2 — daily 09:00 UTC scheduler tick
    preferenceMineUser,         // Phase 5 — per-user preference mining worker
    preferenceMiningScheduler,  // Phase 5 — daily 03:00 UTC mining scheduler
    promptEnrichmentScorer,     // Phase 6 — prompt enrichment scorer
    exportToGitHub,    // legacy export
    deployPipeline,    // sub-plan 07
    githubImportRepo,  // sub-plan 06 §11
    githubPushRepo,    // sub-plan 06 §11
  ],
});