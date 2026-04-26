"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "convex/react"
import { z } from "zod"
import { PlusIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import {
  FEATURE_PRIORITIES,
  newFeatureId,
  type Feature,
  type FeaturePriority,
} from "@/features/specs/lib/feature-validation"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"

const FormSchema = z.object({
  title: z.string().min(1, "Title is required").max(120),
  description: z.string().max(2000),
  priority: z.enum(FEATURE_PRIORITIES),
  acceptanceCriteria: z
    .array(z.string().min(1, "Criterion cannot be empty").max(500))
    .min(1, "At least one criterion is required"),
})

type FormValues = z.infer<typeof FormSchema>

export interface FeatureFormProps {
  projectId: Id<"projects">
  existingFeatures: Feature[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function FeatureForm({ projectId, existingFeatures, open, onOpenChange }: FeatureFormProps) {
  const upsertSpec = useMutation(api.specs.upsertSpec)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      title: "",
      description: "",
      priority: "p1",
      acceptanceCriteria: [""],
    },
  })

  const criteria = watch("acceptanceCriteria")
  const priority = watch("priority")

  const onSubmit = async (values: FormValues) => {
    const feature: Feature = {
      id: newFeatureId(),
      title: values.title,
      description: values.description,
      acceptanceCriteria: values.acceptanceCriteria.filter((c) => c.trim().length > 0),
      status: "todo",
      priority: values.priority,
    }
    await upsertSpec({
      projectId,
      features: [...existingFeatures, feature],
      updatedBy: "user",
    })
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface-2 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">New feature</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="feature-title">Title</Label>
            <Input id="feature-title" {...register("title")} />
            {errors.title && (
              <p className="text-xs text-destructive">{errors.title.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="feature-description">Description</Label>
            <Textarea id="feature-description" rows={3} {...register("description")} />
          </div>

          <div className="space-y-1.5">
            <Label>Priority</Label>
            <RadioGroup
              value={priority}
              onValueChange={(v) => setValue("priority", v as FeaturePriority)}
              className="flex gap-4"
            >
              {FEATURE_PRIORITIES.map((p) => (
                <div key={p} className="flex items-center gap-2">
                  <RadioGroupItem value={p} id={`prio-${p}`} />
                  <Label htmlFor={`prio-${p}`} className="text-sm uppercase">
                    {p}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-1.5">
            <Label>Acceptance criteria</Label>
            <div className="space-y-2">
              {criteria.map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    placeholder={`Criterion ${i + 1}`}
                    {...register(`acceptanceCriteria.${i}` as const)}
                  />
                  {criteria.length > 1 && (
                    <button
                      type="button"
                      aria-label="Remove criterion"
                      onClick={() => {
                        const next = criteria.filter((_, idx) => idx !== i)
                        setValue("acceptanceCriteria", next)
                      }}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2Icon className="size-4" />
                    </button>
                  )}
                </div>
              ))}
              {errors.acceptanceCriteria && (
                <p className="text-xs text-destructive">
                  {errors.acceptanceCriteria.message ||
                    errors.acceptanceCriteria[0]?.message}
                </p>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setValue("acceptanceCriteria", [...criteria, ""])}
              >
                <PlusIcon className="size-3.5" />
                Add criterion
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              Create feature
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
