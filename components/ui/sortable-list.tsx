"use client"

import type { ReactNode } from "react"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  rectSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical } from "lucide-react"
import { cn } from "@/lib/utils"

export type SortableListOrientation = "vertical" | "horizontal" | "grid"

export interface SortableItem {
  id: string
}

export interface SortableRenderArgs<T extends SortableItem> {
  item: T
  index: number
  dragHandle: ReactNode
  isDragging: boolean
}

export interface SortableListProps<T extends SortableItem> {
  items: T[]
  onReorder: (orderedIds: string[]) => void
  renderItem: (args: SortableRenderArgs<T>) => ReactNode
  orientation?: SortableListOrientation
  className?: string
  disabled?: boolean
}

function getStrategy(orientation: SortableListOrientation) {
  if (orientation === "horizontal") return horizontalListSortingStrategy
  if (orientation === "grid") return rectSortingStrategy
  return verticalListSortingStrategy
}

interface SortableRowProps<T extends SortableItem> {
  item: T
  index: number
  renderItem: SortableListProps<T>["renderItem"]
  disabled?: boolean
}

function SortableRow<T extends SortableItem>({
  item,
  index,
  renderItem,
  disabled,
}: SortableRowProps<T>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  } as const

  const dragHandle = (
    <button
      type="button"
      ref={setNodeRef as unknown as React.Ref<HTMLButtonElement>}
      {...attributes}
      {...listeners}
      aria-label="Drag handle"
      disabled={disabled}
      className={cn(
        "inline-flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-secondary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing",
        disabled && "cursor-not-allowed opacity-40",
      )}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  )

  return (
    <div ref={setNodeRef} style={style} data-sortable-id={item.id}>
      {renderItem({ item, index, dragHandle, isDragging })}
    </div>
  )
}

export function SortableList<T extends SortableItem>({
  items,
  onReorder,
  renderItem,
  orientation = "vertical",
  className,
  disabled,
}: SortableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex((item) => item.id === active.id)
    const newIndex = items.findIndex((item) => item.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const ordered = arrayMove(items, oldIndex, newIndex).map((item) => item.id)
    onReorder(ordered)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((item) => item.id)} strategy={getStrategy(orientation)}>
        <div
          className={cn(
            orientation === "horizontal" ? "flex flex-wrap gap-2" : "space-y-2",
            className,
          )}
        >
          {items.map((item, index) => (
            <SortableRow
              key={item.id}
              item={item}
              index={index}
              renderItem={renderItem}
              disabled={disabled}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
