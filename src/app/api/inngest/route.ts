import { serve } from "inngest/next";

import { inngest } from "@/inngest/client";
import { demoError, demoGenerate } from "@/inngest/functions";
import { processMessage } from "@/features/conversations/inngest/process-message";
import { agentLoop } from "@/features/conversations/inngest/agent-loop";
import { exportToGitHub } from "@/features/projects/inngest/github-export";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    demoGenerate,
    demoError,
    processMessage,    // legacy — being replaced by agentLoop (Article XIX migration)
    agentLoop,         // new — uses ModelAdapter + AgentRunner per sub-plan 01
    exportToGitHub,
  ],
});