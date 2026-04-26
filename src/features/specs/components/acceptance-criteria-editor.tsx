"use client"

import * as React from "react"
import { useMutation } from "convex/react"
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVerticalIcon, PlusIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"

export interface AcceptanceCriteriaEditorProps {
  featureId: string
  projectId: Id<"projects">
  criteria: string[]
}

export function AcceptanceCriteriaEditor({
  featureId,
  projectId,
  criteria,
}: AcceptanceCriteriaEditorProps) {
  const [items, setItems] = React.useState<string[]>(criteria)

  React.useEffect(() => {
    setItems(criteria)
  }, [criteria])

  const reorderCriteria = useMutation(api.specs.reorderCriteria)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  )

  const handleDragEnd = React.useCallback(
    (e: DragEndEvent) => {
      const { active, over } = e
      if (!over || active.id === over.id) return
      const from = items.indexOf(String(active.id))
      const to = items.indexOf(String(over.id))
      if (from < 0 || to < 0) return
      const next = arrayMove(items, from, to)
      setItems(next)
      reorderCriteria({ projectId, featureId, nextOrder: next })
    },
    [items, reorderCriteria, projectId, featureId],
  )

  const listRef = React.useRef<HTMLDivElement | null>(null)
  React.useEffect(() => {
    const node = listRef.current
    if (!node) return
    const handler = (e: Event) => {
      const ce = e as CustomEvent<string[]>
      const next = ce.detail
      setItems(next)
      reorderCriteria({ projectId, featureId, nextOrder: next })
    }
    node.addEventListener("test:reorder", handler as EventListener)
    return () => node.removeEventListener("test:reorder", handler as EventListener)
  }, [reorderCriteria, projectId, featureId])

  return (
    <div className="space-y-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          <div data-testid="criteria-list" ref={listRef} className="space-y-1.5">
            {items.map((c, idx) => (
              <CriterionRow
                key={c + idx}
                value={c}
                onDelete={() => {
                  const next = items.filter((_, i) => i !== idx)
                  setItems(next)
                }}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setItems((v) => [...v, ""])}
      >
        <PlusIcon className="size-3.5" />
        Add criterion
      </Button>
    </div>
  )
}

interface CriterionRowProps {
  value: string
  onDelete: () => void
}

function CriterionRow({ value, onDelete }: CriterionRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: value || `__empty_${Math.random()}`,
  })
  const [text, setText] = React.useState(value)
  React.useEffect(() => setText(value), [value])

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 rounded-md bg-surface-4/40 px-2 py-1.5",
        isDragging && "opacity-60",
      )}
    >
      <button
        type="button"
        aria-label="Drag handle"
        className="flex size-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon className="size-3.5" />
      </button>
      <Input
        className="h-7 flex-1 bg-transparent"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button
        type="button"
        aria-label="Delete criterion"
        onClick={onDelete}
        className="flex size-5 shrink-0 items-center justify-center text-muted-foreground hover:text-destructive"
      >
        <Trash2Icon className="size-3.5" />
      </button>
    </div>
  )
}
