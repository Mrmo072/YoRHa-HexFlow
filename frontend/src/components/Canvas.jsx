import React, { useState, useEffect, useRef } from 'react';
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
function LaneContainer({ lane, index, children, isActiveLane, onNavigateGroup, onSetFocusedLane }) {
    const { setNodeRef } = useDroppable({
        id: `lane-container-${index}`,
        data: { laneIndex: index, parentId: lane.parentId }
    });

    return (
        <div
            ref={setNodeRef}
            onClick={(e) => {
                e.stopPropagation();
                // Focusing the CONTAINER means we want to add items TO this container.
                // So we set focusedParentId to THIS lane's parentId.
                onSetFocusedLane && onSetFocusedLane(lane.parentId);
            }}
            className={`relative flex gap-1 items-end min-w-max p-4 border border-dashed min-h-[140px] transition-colors duration-300 cursor-pointer
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
    onNavigateGroup, // Toggle Expand/Collapse
    focusedParentId = null,
    onSetFocusedLane,
    isModalOpen = false
}) {

    const [activeDragId, setActiveDragId] = useState(null);
    const [dragOverLaneIndex, setDragOverLaneIndex] = useState(null); // Track which lane is hovered (by index for local DnD)

    // Viewport Transformation State
    const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
    const canvasRef = useRef(null);
    const isPanning = useRef(false);
    const lastMousePos = useRef({ x: 0, y: 0 });

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
            keyboardCodes: {
                start: isModalOpen ? [] : ['Space', 'Enter'],
                cancel: ['Escape'],
                end: ['Space', 'Enter']
            }
        })
    );

    // PAN & ZOOM HANDLERS
    useEffect(() => {
        const container = canvasRef.current;
        if (!container) return;

        const handleWheel = (e) => {
            // Wheel = Zoom
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            setViewport(prev => ({
                ...prev,
                scale: Math.min(Math.max(prev.scale * delta, 0.5), 2.0)
            }));
        };

        const handleMouseDown = (e) => {
            // Middle Mouse (button 1) or Space+Left
            if (e.button === 1 || (e.button === 0 && e.code === 'Space')) {
                e.preventDefault();
                isPanning.current = true;
                lastMousePos.current = { x: e.clientX, y: e.clientY };
                container.style.cursor = 'grabbing';
            } else if (e.button === 0) {
                // Left Click on Background -> Reset Selection
                // (Only if not prevented by child stopPropagation)
                onSelect && onSelect(null);
            }
        };

        const handleMouseMove = (e) => {
            if (!isPanning.current) return;
            e.preventDefault();
            const dx = e.clientX - lastMousePos.current.x;
            const dy = e.clientY - lastMousePos.current.y;
            lastMousePos.current = { x: e.clientX, y: e.clientY };
            setViewport(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
        };

        const handleMouseUp = (e) => {
            if (isPanning.current) {
                isPanning.current = false;
                container.style.cursor = 'default';
            }
        };

        container.addEventListener('wheel', handleWheel, { passive: false });
        // Mouse events need to be on window/document to catch drags outside?
        // But start is on container.
        container.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            container.removeEventListener('wheel', handleWheel);
            container.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    // LAYOUT CALCULATION EFFECT (Updated for Viewport)
    useEffect(() => {
        const calculateVal = () => {
            const contentValues = document.querySelector('.canvas-content');
            if (!contentValues) return;
            const contentRect = contentValues.getBoundingClientRect(); // The transformed wrapper

            // To get local coordinates: (El.left - Content.left) / scale
            const scale = viewport.scale;

            const toLocal = (rect) => ({
                left: (rect.left - contentRect.left) / scale,
                top: (rect.top - contentRect.top) / scale,
                width: rect.width / scale,
                height: rect.height / scale,
                bottom: (rect.bottom - contentRect.top) / scale,
                centerX: ((rect.left - contentRect.left) + rect.width / 2) / scale,
                centerY: ((rect.top - contentRect.top) + rect.height / 2) / scale,
            });

            // LOGIC PATHS
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
                    const sRect = toLocal(sourceEl.getBoundingClientRect());
                    logicPaths = currentRefIds.map(refId => {
                        const targetEl = document.getElementById(`block-${refId}`);
                        if (!targetEl) return null;
                        const tRect = toLocal(targetEl.getBoundingClientRect());

                        const cpY = Math.min(sRect.top, tRect.top) - 50;
                        const d = `M ${sRect.centerX} ${sRect.top} C ${sRect.centerX} ${cpY}, ${tRect.centerX} ${cpY}, ${tRect.centerX} ${tRect.top}`;
                        return { id: refId, d: d, type: 'logic' };
                    }).filter(Boolean);
                }
            }

            // HIERARCHY PATHS
            let hierPaths = [];
            lanes.forEach((lane, index) => {
                const parentId = lane.parentId;
                if (!parentId) return; // Root has no parent line

                const parentEl = document.getElementById(`block-${parentId}`);
                const laneEl = document.getElementById(`lane-${index}`);
                if (parentEl && laneEl) {
                    const pRect = toLocal(parentEl.getBoundingClientRect());
                    const lRect = toLocal(laneEl.getBoundingClientRect());

                    // From Parent Bottom to Lane Left
                    const startX = pRect.centerX;
                    const startY = pRect.bottom;
                    const endX = lRect.left + 20; // Slightly inside lane
                    const endY = lRect.top;

                    const cpY = startY + 20;
                    const d = `M ${startX} ${startY} C ${startX} ${cpY}, ${endX} ${startY}, ${endX} ${endY + 5}`;
                    hierPaths.push({ id: `link-${parentId}`, d, type: 'hierarchy' });
                }
            });
            setConnectionPaths([...logicPaths]);
            setHierarchyLines([...hierPaths]);
        };
        const timer = setTimeout(calculateVal, 50);
        return () => clearTimeout(timer);
    }, [lanes, selectedId, pickingMode, viewport]); // Re-calc on viewport change

    // Local state for DnD visual updates (for cross-lane previews)
    const [localLanes, setLocalLanes] = useState(lanes);
    useEffect(() => { setLocalLanes(lanes); }, [lanes]);

    const handleDragStart = (event) => { setActiveDragId(event.active.id); }

    const handleDragOver = (event) => {
        const { active, over } = event;
        if (!over) { setDragOverLaneIndex(null); return; }

        // Find Lane Objects using localLanes
        const findLane = (id) => {
            if (String(id).startsWith('lane-container-')) {
                const idx = parseInt(id.split('-')[2]);
                return localLanes[idx]; // Direct index access since we map 1:1
            }
            return localLanes.find(l => l.items.find(i => i.id === id));
        };

        const sourceLane = findLane(active.id);
        const targetLane = findLane(over.id);

        if (!sourceLane || !targetLane) return;

        // Update Focus Index Visualization (optional, dragging usually implies focus)
        // We'll leave strict focus update to DragEnd or Click

        let newLaneIndex = null;
        if (over.id.toString().startsWith('lane-container-')) {
            newLaneIndex = parseInt(over.id.split('-')[2]);
        } else if (targetLane) {
            newLaneIndex = localLanes.indexOf(targetLane);
        }
        if (newLaneIndex !== null) setDragOverLaneIndex(newLaneIndex);

        if (sourceLane === targetLane) {
            const oldIndex = sourceLane.items.findIndex(i => i.id === active.id);
            let newIndex = sourceLane.items.findIndex(i => i.id === over.id);
            if (over.id.toString().startsWith('lane-container-')) newIndex = sourceLane.items.length - 1;
            if (oldIndex !== newIndex && newIndex !== -1) {
                setLocalLanes(prev => {
                    const newLanes = [...prev];
                    const laneIdx = prev.indexOf(sourceLane);
                    newLanes[laneIdx] = { ...sourceLane, items: arrayMove(sourceLane.items, oldIndex, newIndex) };
                    return newLanes;
                });
            }
            return;
        }

        setLocalLanes(prev => {
            const activeItem = sourceLane.items.find(i => i.id === active.id);
            if (!activeItem) return prev;
            const newSourceItems = sourceLane.items.filter(i => i.id !== active.id);
            const newTargetItems = [...targetLane.items];
            const overIndex = over.id.toString().startsWith('lane-container-') ? newTargetItems.length : newTargetItems.findIndex(i => i.id === over.id);
            const finalIndex = overIndex >= 0 ? overIndex : newTargetItems.length;
            const newLanes = [...prev];
            const srcIdx = prev.indexOf(sourceLane);
            const tgtIdx = prev.indexOf(targetLane);
            if (srcIdx === -1 || tgtIdx === -1) return prev;
            newLanes[srcIdx] = { ...sourceLane, items: newSourceItems };
            const movedItem = { ...activeItem, parentId: targetLane.parentId };
            newTargetItems.splice(finalIndex, 0, movedItem);
            newLanes[tgtIdx] = { ...targetLane, items: newTargetItems };
            return newLanes;
        });
    }

    const handleDragEnd = (event) => {
        const { active, over } = event;
        setActiveDragId(null);
        setDragOverLaneIndex(null);

        if (!over) { setLocalLanes(lanes); return; }

        const finalLane = localLanes.find(l => l.items.find(i => i.id === active.id));
        if (finalLane) {
            const finalIndex = finalLane.items.findIndex(i => i.id === active.id);
            onMoveItem(active.id, finalLane.parentId, finalIndex);
        }
    };

    const handleBlockClick = (id, opCode, parentId) => {
        onSetFocusedLane && onSetFocusedLane(parentId);
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

    // Helper: Recursive Lane Renderer
    const RenderLaneNode = ({ lane }) => {
        // Find Child Lanes: Lanes whose parentId matches an Item ID in this lane
        const childLanes = lane.items
            .flatMap(item => {
                // Find lanes that are children of this item
                return localLanes.filter(l => l.parentId === item.id);
            });

        // Determine Focus
        const isFocus = activeDragId
            ? (dragOverLaneIndex === localLanes.indexOf(lane))
            : ((lane.parentId || null) === (focusedParentId || null));

        const isRoot = !lane.parentId;
        const index = localLanes.indexOf(lane); // For ID consistency if needed

        return (
            <div className="flex flex-col items-start mr-8">
                {/* LANE BOX */}
                <div
                    id={`lane-${index}`}
                    className={`mb-4 transition-all duration-300 ${isFocus ? 'opacity-100' : 'opacity-60'} flex flex-col`}
                >
                    {/* Header */}
                    <div className="flex items-center gap-2 mb-1 pl-1">
                        <div className={`text-[10px] font-mono tracking-widest px-1 border transition-colors ${isFocus ? 'text-nier-light opacity-80 bg-nier-dark border-nier-light/20' : 'text-nier-light/50 opacity-40 bg-transparent border-transparent'}`}>
                            {lane.parentName || `GROUP CONTENT`}
                        </div>
                        {!isFocus && !activeDragId && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onSetFocusedLane && onSetFocusedLane(lane.parentId);
                                }}
                                className="text-[9px] text-nier-light/40 hover:text-nier-light underline cursor-pointer"
                            >
                                FOCUS
                            </button>
                        )}
                    </div>

                    <LaneContainer
                        lane={lane}
                        index={index}
                        isActiveLane={isFocus}
                        onNavigateGroup={onNavigateGroup}
                        onSetFocusedLane={onSetFocusedLane}
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
                                    // Clicking a block should focus THIS lane (the container), not the child lane
                                    onClick={() => handleBlockClick(item.id, item.op_code, lane.parentId)}
                                    isGroupActive={false}
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

                {/* CHILDREN ROW */}
                {childLanes.length > 0 && (
                    <div className="flex flex-row items-start pl-8 border-l border-nier-light/10 ml-4 gap-8">
                        {childLanes.map(child => (
                            <RenderLaneNode key={child.parentId} lane={child} />
                        ))}
                    </div>
                )}
            </div>
        );
    };

    // Root Lanes (parentId is null/undefined)
    const rootLanes = localLanes.filter(l => !l.parentId);

    return (
        <div
            ref={canvasRef}
            className="w-full h-full overflow-hidden relative canvas-root bg-transparent"
        >
            {/* CONTROLS */}
            <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-50">
                <button className="bg-nier-dark border border-nier-light text-nier-light p-2 text-xs hover:bg-nier-light/20" onClick={() => setViewport({ x: 0, y: 0, scale: 1 })}>RESET</button>
                <button className="bg-nier-dark border border-nier-light text-nier-light p-2 text-xs hover:bg-nier-light/20" onClick={() => setViewport(v => ({ ...v, scale: Math.min(v.scale + 0.1, 2.0) }))}>+</button>
                <button className="bg-nier-dark border border-nier-light text-nier-light p-2 text-xs hover:bg-nier-light/20" onClick={() => setViewport(v => ({ ...v, scale: Math.max(v.scale - 0.1, 0.5) }))}>-</button>
            </div>

            {/* TRANSFORM WRAPPER */}
            <div
                className="canvas-content absolute top-0 left-0 min-w-full min-h-full origin-top-left transition-transform duration-100 ease-out flex flex-col items-start p-10"
                style={{
                    transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`
                }}
            >
                {/* SVG OVERLAY (Now inside transform) */}
                <svg className="absolute top-0 left-0 w-[200%] h-[200%] pointer-events-none z-0" style={{ overflow: 'visible' }}>
                    {/* ... Keep defs and paths ... */}
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
                    onDragOver={handleDragOver}
                    onDragEnd={handleDragEnd}
                >
                    {rootLanes.map(lane => (
                        <RenderLaneNode key={lane.parentId || 'root'} lane={lane} />
                    ))}

                    <DragOverlay dropAnimation={null}>
                        {activeDragItem ? (
                            <div className="opacity-90 scale-105 rotate-2 cursor-grabbing pointer-events-none">
                                <Block {...activeDragItem} isSelected={false} isGroupActive={false} />
                            </div>
                        ) : null}
                    </DragOverlay>

                </DndContext>
            </div>
        </div>
    );
}
