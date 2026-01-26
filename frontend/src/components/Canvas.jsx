import React, { useState } from 'react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import Block from './Block';

export default function Canvas({ items, setItems, selectedId, onSelect, readOnly }) {

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    function handleDragEnd(event) {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = items.findIndex(i => i.id === active.id);
            const newIndex = items.findIndex(i => i.id === over.id);
            setItems(arrayMove(items, oldIndex, newIndex));
        }
    }

    if (readOnly) {
        return (
            <div className="w-full h-full flex items-start justify-start overflow-x-auto p-10 select-none">
                <div className="flex gap-1 items-end min-w-max p-4 border border-dashed border-nier-light/30 min-h-[150px]">
                    {items.map(item => (
                        <Block
                            key={item.id}
                            {...item}
                            isSelected={selectedId === item.id}
                            onClick={() => onSelect && onSelect(item.id)}
                        />
                    ))}
                    {/* Read Only Hint */}
                    <div className="text-nier-light/30 text-[10px] absolute top-2 right-2 border border-current px-2 py-1">PREVIEW ONLY</div>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full h-full flex items-start justify-start overflow-x-auto p-10 select-none">
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={items}
                    strategy={horizontalListSortingStrategy}
                >
                    <div className="flex gap-1 items-end min-w-max p-4 border border-dashed border-nier-light/30 min-h-[150px]">
                        {items.map(item => (
                            <Block
                                key={item.id}
                                {...item}
                                isSelected={selectedId === item.id}
                                onClick={() => onSelect(item.id)}
                            />
                        ))}

                        {/* Add Hint */}
                        {items.length === 0 && (
                            <div className="text-zinc-500 text-sm italic w-40 text-center">
                                拖拽或点击左侧添加模块<br />
                                Drag or Click left to add
                            </div>
                        )}
                    </div>
                </SortableContext>
            </DndContext>
        </div>
    );
}
