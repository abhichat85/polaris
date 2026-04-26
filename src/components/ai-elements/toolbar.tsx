import { cn } from "@/lib/utils";
import { NodeToolbar, Position } from "@xyflow/react";
import type { ComponentProps } from "react";

type ToolbarProps = ComponentProps<typeof NodeToolbar>;

export const Toolbar = ({ className, ...props }: ToolbarProps) => (
  <NodeToolbar
    className={cn(
      // Praxiom §2.3 — floating toolbar uses surface-3 with elegant shadow.
      "flex items-center gap-1 rounded-md bg-surface-3 p-1.5 shadow-elegant",
      className
    )}
    position={Position.Bottom}
    {...props}
  />
);
