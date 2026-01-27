import React, { useState, useEffect } from 'react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    useDroppable,
    DragOverlay,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import Block from './Block';

// Lane Component to handle Droppable logic cleanly
function LaneContainer({ lane, index, children, isActiveLane, onNavigateGroup }) {
    const { setNodeRef } = useDroppable({
        id: `lane-container-${index}`,
        data: { laneIndex: index, parentId: lane.parentId }
    });

    return (
        <div
            ref={setNodeRef}
            className={`relative flex gap-1 items-end min-w-max p-4 border border-dashed min-h-[140px] transition-all duration-300
                ${isActiveLane ? 'border-nier-light/40 bg-nier-light/5 opacity-100 grayscale-0 scale-[1.01]' : 'border-nier-light/10 bg-transparent opacity-80 grayscale scale-100'}
            `}
        >
            {children}
        </div>
    );
}

export default function Canvas({
    lanes = [],
    onMoveItem, // (itemId, newParentId, newIndex) => void
    selectedId,
    onSelect,
    readOnly,
    pickingMode,
    onPickBlock,
    activeGroupPath = [],
    onNavigateGroup
}) {

    const [activeDragId, setActiveDragId] = useState(null);
    const [dragOverLaneIndex, setDragOverLaneIndex] = useState(null); // Track which lane is hovered

    // Calculate refs for visual connections (Logic Refs + Hierarchy Links)
    const [connectionPaths, setConnectionPaths] = useState([]);
    const [hierarchyLines, setHierarchyLines] = useState([]);

    // SENSORS
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 8 },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // LAYOUT CALCULATION EFFECT
    useEffect(() => {
        const calculateVal = () => {
            const container = document.querySelector('.canvas-root');
            if (!container) return;
            const containerRect = container.getBoundingClientRect();
            let logicPaths = [];
            let currentRefIds = [];

            if (pickingMode?.isActive) {
                currentRefIds = pickingMode.currentRefs || [];
            } else if (selectedId) {
                const allItems = lanes.flatMap(l => l.items);
                const activeItem = allItems.find(i => i.id === selectedId);
                if (activeItem && activeItem.parameter_config?.refs) {
                    const r = activeItem.parameter_config.refs;
                    currentRefIds = Array.isArray(r) ? r : [r];
                }
            }

            if (currentRefIds.length > 0) {
                const sourceEl = document.getElementById(`block-${selectedId}`);
                if (sourceEl) {
                    const sourceRect = sourceEl.getBoundingClientRect();
                    logicPaths = currentRefIds.map(refId => {
                        const targetEl = document.getElementById(`block-${refId}`);
                        if (!targetEl) return null;
                        const targetRect = targetEl.getBoundingClientRect();
                        const ViewX = containerRect.left;
                        const ViewY = containerRect.top;
                        const startX = (sourceRect.left - ViewX) + sourceRect.width / 2;
                        const startY = (sourceRect.top - ViewY);
                        const endX = (targetRect.left - ViewX) + targetRect.width / 2;
                        const endY = (targetRect.top - ViewY);
                        const cpY = Math.min(startY, endY) - 50;
                        const d = `M ${startX} ${startY} C ${startX} ${cpY}, ${endX} ${cpY}, ${endX} ${endY}`;
                        return { id: refId, d: d, type: 'logic' };
                    }).filter(Boolean);
                }
            }

            let hierPaths = [];
            lanes.forEach((lane, index) => {
                const parentId = lane.parentId;
                if (index === 0 || !parentId) return;

                const parentEl = document.getElementById(`block-${parentId}`);
                const laneEl = document.getElementById(`lane-${index}`);
                if (parentEl && laneEl) {
                    const pRect = parentEl.getBoundingClientRect();
                    const lRect = laneEl.getBoundingClientRect();
                    const ViewX = containerRect.left;
                    const ViewY = containerRect.top;
                    const startX = (pRect.left - ViewX) + pRect.width / 2;
                    const startY = (pRect.bottom - ViewY);
                    const endX = (lRect.left - ViewX) + 20;
                    const endY = (lRect.top - ViewY);
                    const cpY = startY + 30;
                    const d = `M ${startX} ${startY} C ${startX} ${cpY}, ${endX} ${startY}, ${endX} ${endY + 5}`;
                    hierPaths.push({ id: `link-${parentId}`, d, type: 'hierarchy' });
                }
            });
            setConnectionPaths([...logicPaths]);
            setHierarchyLines([...hierPaths]);
        };
        const timer = setTimeout(calculateVal, 50);
        return () => clearTimeout(timer);
    }, [lanes, selectedId, pickingMode, activeGroupPath, activeDragId]); // Re-calc on drag mainly for stability, visuals handled by CSS

    const handleDragStart = (event) => {
        setActiveDragId(event.active.id);
    }

    const handleDragOver = (event) => {
        const { over } = event;
        if (!over) {
            setDragOverLaneIndex(null);
            return;
        }

        // Determine which lane we are hovering
        let laneIndex = null;

        // Case A: Hovering over a Lane Container
        if (over.id.toString().startsWith('lane-container-')) {
            laneIndex = parseInt(over.id.split('-')[2]);
        }
        // Case B: Hovering over an item within a lane
        else {
            const lane = lanes.find(l => l.items.find(i => i.id === over.id));
            if (lane) {
                const idx = lanes.indexOf(lane);
                laneIndex = idx;
            }
        }

        if (laneIndex !== null) {
            setDragOverLaneIndex(laneIndex);
        }
    }

    const handleDragEnd = (event) => {
        const { active, over } = event;
        setActiveDragId(null);
        setDragOverLaneIndex(null); // Reset focus
        if (!over) return;

        const sourceLane = lanes.find(l => l.items.find(i => i.id === active.id));
        if (!sourceLane) return;

        let destLane = null;
        let newIndex = 0;

        if (over.id.toString().startsWith('lane-container-')) {
            const laneIndex = parseInt(over.id.split('-')[2]);
            destLane = lanes[laneIndex];
            newIndex = destLane.items.length;
        } else {
            destLane = lanes.find(l => l.items.find(i => i.id === over.id));
            if (destLane) {
                const overItemIndex = destLane.items.findIndex(i => i.id === over.id);
                newIndex = overItemIndex;
            }
        }

        if (destLane) {
            if (sourceLane === destLane) {
                if (active.id !== over.id) {
                    onMoveItem(active.id, sourceLane.parentId, newIndex);
                }
            } else {
                onMoveItem(active.id, destLane.parentId, newIndex);
            }
        }
    };

    const handleBlockClick = (id, opCode) => {
        if (pickingMode?.isActive) {
            onPickBlock && onPickBlock(id);
        } else {
            onSelect && onSelect(id);
            if (opCode === 'ARRAY_GROUP') {
                onNavigateGroup && onNavigateGroup(id);
            }
        }
    };

    const activeDragItem = activeDragId ? lanes.flatMap(l => l.items).find(i => i.id === activeDragId) : null;

    return (
        <div className="w-full h-full flex flex-col items-start justify-start overflow-auto p-10 select-none canvas-bg relative canvas-root">
            {/* SVG OVERLAY */}
            <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-0" style={{ overflow: 'visible' }}>
                {/* (Same SVG Definitions) */}
                <defs>
                    <filter id="glow-line" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="2" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                    <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                        <polygon points="0 0, 6 2, 0 4" fill="currentColor" style={{ color: pickingMode?.isActive ? '#FFB74D' : 'var(--color-nier-light)' }} />
                    </marker>
                </defs>
                {hierarchyLines.map((line, idx) => (
                    <path key={idx} d={line.d} fill="none" stroke="var(--color-nier-light)" strokeWidth="1" strokeDasharray="2 2" className="opacity-50" />
                ))}
                {connectionPaths.map((conn) => (
                    <g key={conn.id}>
                        <path d={conn.d} fill="none" stroke="var(--color-nier-light)" strokeWidth="1" style={{ opacity: 0.3 }} />
                        <path d={conn.d} fill="none" stroke={pickingMode?.isActive ? "#FFB74D" : "var(--color-nier-highlight)"} strokeWidth="2" strokeDasharray="4 8" className="animate-dash-flow opacity-80" markerEnd="url(#arrowhead)" />
                    </g>
                ))}
            </svg>

            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver} // Handle dynamic focus
                onDragEnd={handleDragEnd}
            >
                {/* RENDER LANES */}
                {lanes.map((lane, index) => {
                    // Logic: 
                    // 1. If dragging, Focus = dragOverLaneIndex
                    // 2. If not dragging, Focus = last lane (deepest)
                    const isFocus = activeDragId
                        ? (dragOverLaneIndex === index)
                        : (index === lanes.length - 1);

                    const isRoot = index === 0;

                    return (
                        <div
                            key={lane.parentId || 'root'}
                            id={`lane-${index}`}
                            className={`mb-8 transition-all duration-300 ${isFocus ? 'opacity-100 translate-x-0' : 'opacity-60'}`}
                        >
                            {/* Lane Header */}
                            <div className="flex items-center gap-2 mb-1 pl-1">
                                <div className={`text-[10px] font-mono tracking-widest px-1 border transition-colors ${isFocus ? 'text-nier-light opacity-80 bg-nier-dark border-nier-light/20' : 'text-nier-light/50 opacity-40 bg-transparent border-transparent'}`}>
                                    {isRoot ? 'ROOT SEQUENCE' : `GROUP CONTENT (L${index})`}
                                </div>
                                {!isFocus && !activeDragId && (
                                    <button
                                        onClick={() => onNavigateGroup(lane.parentId)}
                                        className="text-[9px] text-nier-light/40 hover:text-nier-light underline cursor-pointer"
                                    >
                                        FOCUS
                                    </button>
                                )}
                            </div>

                            {/* Lane Container */}
                            <LaneContainer
                                lane={lane}
                                index={index}
                                isActiveLane={isFocus} // Pass calculated focus
                                onNavigateGroup={onNavigateGroup}
                            >
                                <SortableContext
                                    id={`lane-context-${lane.depth}`}
                                    items={lane.items}
                                    strategy={horizontalListSortingStrategy}
                                >
                                    {lane.items.map(item => (
                                        <Block
                                            key={item.id}
                                            {...item}
                                            isSelected={selectedId === item.id}
                                            isPickMode={pickingMode?.isActive}
                                            isPickRef={pickingMode?.currentRefs?.includes(item.id)}
                                            onClick={() => handleBlockClick(item.id, item.op_code)}
                                            isGroupActive={activeGroupPath.includes(item.id)}
                                        />
                                    ))}

                                    {lane.items.length === 0 && (
                                        <div className="text-zinc-500 text-xs italic w-32 text-center opacity-50">
                                            [EMPTY GROUP]
                                        </div>
                                    )}
                                </SortableContext>
                            </LaneContainer>
                        </div>
                    );
                })}

                <DragOverlay dropAnimation={null}>
                    {activeDragItem ? (
                        <div className="opacity-90 scale-105 rotate-2 cursor-grabbing pointer-events-none">
                            <Block
                                {...activeDragItem}
                                isSelected={false}
                                isGroupActive={activeGroupPath.includes(activeDragItem.id)}
                            />
                        </div>
                    ) : null}
                </DragOverlay>

            </DndContext>
        </div>
    );
}
