import { useState, useEffect } from 'react';

export function useCanvasConnections(lanes, selectedId, pickingMode, contentRef) {
    const [connectionPaths, setConnectionPaths] = useState([]);
    const [hierarchyLines, setHierarchyLines] = useState([]);

    useEffect(() => {
        const calculateVal = () => {
            const container = contentRef.current;
            if (!container) return;
            const containerRect = container.getBoundingClientRect();

            // Helper to get coords relative to the Content Wrapper (which scrolls)
            const toLocal = (rect) => ({
                left: rect.left - containerRect.left,
                top: rect.top - containerRect.top,
                width: rect.width,
                height: rect.height,
                bottom: rect.bottom - containerRect.top,
                centerX: (rect.left - containerRect.left) + rect.width / 2,
                centerY: (rect.top - containerRect.top) + rect.height / 2,
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
                if (!parentId) return;

                const parentEl = document.getElementById(`block-${parentId}`);
                const laneEl = document.getElementById(`lane-${index}`);
                if (parentEl && laneEl) {
                    const pRect = toLocal(parentEl.getBoundingClientRect());
                    const lRect = toLocal(laneEl.getBoundingClientRect());

                    const startX = pRect.centerX;
                    const startY = pRect.bottom;
                    const endX = lRect.left + 20;
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
    }, [lanes, selectedId, pickingMode, contentRef]);

    return { connectionPaths, hierarchyLines };
}
