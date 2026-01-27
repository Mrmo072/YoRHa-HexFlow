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

export default function Canvas({ items, setItems, selectedId, onSelect, readOnly, pickingMode, onPickBlock }) {

    // Calculate refs for visual connections
    const [connectionPaths, setConnectionPaths] = useState([]);

    React.useEffect(() => {
        // We need to resolve DOM positions (x, y) relative to the Canvas container
        // to draw lines. We'll use getBoundingClientRect.

        const calculate = () => {
            if (!selectedId) {
                setConnectionPaths([]);
                return;
            }

            // Determine Target Refs
            let targetRefs = [];

            // 1. Picking Mode Targets
            if (pickingMode?.isActive) {
                targetRefs = pickingMode.currentRefs || [];
            }
            // 2. View Mode (Active Block Logic)
            else {
                // Try to find if the selected block has referencing config
                const activeItem = items.find(i => i.id === selectedId);
                if (activeItem && activeItem.parameter_config?.refs) {
                    const r = activeItem.parameter_config.refs;
                    targetRefs = Array.isArray(r) ? r : [r];
                }
            }

            if (!targetRefs || targetRefs.length === 0) {
                setConnectionPaths([]);
                return;
            }

            // Calculate Paths
            const container = document.querySelector('.canvas-container'); // Need to add class to container
            if (!container) return;
            const containerRect = container.getBoundingClientRect();

            // Source Block
            const sourceEl = document.getElementById(`block-${selectedId}`);
            if (!sourceEl) return;
            const sourceRect = sourceEl.getBoundingClientRect();

            const paths = targetRefs.map(refId => {
                const targetEl = document.getElementById(`block-${refId}`);
                if (!targetEl) return null;
                const targetRect = targetEl.getBoundingClientRect();

                // Calculate Top-Center relative to container
                const containerLeft = containerRect.left;
                const containerTop = containerRect.top;

                const startX = (sourceRect.left - containerLeft) + sourceRect.width / 2;
                const startY = (sourceRect.top - containerTop); // Top edge

                const endX = (targetRect.left - containerLeft) + targetRect.width / 2;
                const endY = (targetRect.top - containerTop); // Top edge

                // BEZIER CURVE PATH (Flowing Lines - Top to Top)
                const sign = (endX > startX) ? 1 : -1;
                const dist = Math.abs(endX - startX);

                // Arch Height: Scaling with distance to look natural
                const archHeight = Math.max(30, Math.min(80, dist * 0.5));
                const cpY = Math.min(startY, endY) - archHeight;

                const d = `M ${startX} ${startY} ` +
                    `C ${startX} ${cpY}, ${endX} ${cpY}, ${endX} ${endY}`;

                return {
                    id: refId,
                    d: d
                };
            }).filter(Boolean);

            setConnectionPaths(paths);
        };

        // Recalculate on items change, selection change, or picking change
        // Also might need resize observer but stick to simple deps for now
        // Use timeout to allow layout settle
        const timer = setTimeout(calculate, 0);
        return () => clearTimeout(timer);

    }, [pickingMode, selectedId, items]);

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

    // click handler logic
    const handleBlockClick = (id) => {
        if (pickingMode?.isActive) {
            onPickBlock && onPickBlock(id);
        } else {
            onSelect && onSelect(id);
        }
    };

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
        <div className="w-full h-full flex items-start justify-start overflow-x-auto p-10 select-none canvas-bg relative">

            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={items}
                    strategy={horizontalListSortingStrategy}
                >
                    <div className="relative flex gap-1 items-end min-w-max p-4 border border-dashed border-nier-light/30 min-h-[150px] canvas-container">

                        {/* CONNECTION OVERLAY (SVG) */}
                        <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-0" style={{ overflow: 'visible' }}>
                            <defs>
                                <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                                    <polygon points="0 0, 6 2, 0 4" fill="currentColor" style={{ color: pickingMode?.isActive ? '#FFB74D' : 'var(--color-nier-light)' }} />
                                </marker>
                            </defs>
                            {connectionPaths.map((conn) => (
                                <g key={conn.id}>
                                    {/* Background Line (Thin & Subtle Charcoal) */}
                                    <path
                                        d={conn.d}
                                        fill="none"
                                        stroke="var(--color-nier-light)"
                                        strokeWidth="1"
                                        style={{ opacity: 0.3 }}
                                    />
                                    {/* Flowing Segment (Orange Dots) */}
                                    <path
                                        d={conn.d}
                                        fill="none"
                                        stroke={pickingMode?.isActive ? "#FFB74D" : "var(--color-nier-highlight)"}
                                        strokeWidth="2"
                                        strokeDasharray="4 8"
                                        className="animate-dash-flow opacity-80"
                                        markerEnd="url(#arrowhead)"
                                    />
                                </g>
                            ))}
                        </svg>


                        {items.map(item => (
                            <Block
                                key={item.id}
                                {...item}
                                isSelected={selectedId === item.id}
                                isPickMode={pickingMode?.isActive}
                                isPickRef={pickingMode?.currentRefs?.includes(item.id)}
                                onClick={() => handleBlockClick(item.id)}
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
