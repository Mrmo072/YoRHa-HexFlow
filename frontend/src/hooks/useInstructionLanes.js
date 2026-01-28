import { useState, useMemo, useEffect } from 'react';
import { evaluateFormula, formatToHex } from '../utils/formula';

export function useInstructionLanes(currentInstruction, activeInstructionId) {
    // expandedGroupIds: Array of IDs that are currently expanded.
    const [expandedGroupIds, setExpandedGroupIds] = useState([]);
    // focusedParentId: The 'parentId' of the lane currently in focus. null = Root.
    const [focusedParentId, setFocusedParentId] = useState(null);

    // Reset Group Path when switching instructions & Default Expand All
    useEffect(() => {
        if (currentInstruction && currentInstruction.fields) {
            const allGroupIds = currentInstruction.fields
                .filter(f => f.op_code === 'ARRAY_GROUP')
                .map(f => f.id);
            setExpandedGroupIds(allGroupIds);
        } else {
            setExpandedGroupIds([]);
        }
        setFocusedParentId(null);
    }, [activeInstructionId]); // Depend on ID change to reset

    // Compute Lanes for Canvas (Recursive Tree)
    const uiLanes = useMemo(() => {
        if (!currentInstruction?.fields) return [];

        const lanes = [];
        const allFields = currentInstruction.fields;

        // Recursive helper to build lanes in DFS order
        const buildLanes = (parentId, depth) => {
            // 1. Find blocks in this container
            const items = allFields.filter(f => {
                const pId = f.parent_id || null;
                return pId === parentId;
            }).sort((a, b) => a.sequence - b.sequence);

            // 2. Find Parent Name for display
            let parentName = "ROOT SEQUENCE";
            if (parentId) {
                const parentBlock = allFields.find(f => f.id === parentId);
                parentName = parentBlock ? (parentBlock.name || parentBlock.label) : "UNKNOWN GROUP";
            }

            // 3. Add this lane
            lanes.push({
                depth,
                parentId,
                parentName,
                items
            });

            // 4. Find expands within this lane
            items.forEach(item => {
                if (item.op_code === 'ARRAY_GROUP' && expandedGroupIds.includes(item.id)) {
                    buildLanes(item.id, depth + 1);
                }
            });
        };

        buildLanes(null, 0); // Start at Root
        return lanes;

    }, [currentInstruction?.fields, expandedGroupIds]);

    // LIVE FORMULA EVALUATION
    const processedLanes = useMemo(() => {
        const allFields = currentInstruction?.fields || [];
        const nameToValueMap = {};
        allFields.forEach(f => {
            if (f.op_code === 'ARRAY_GROUP') {
                nameToValueMap[f.name || f.label] = "??";
            } else {
                nameToValueMap[f.name || f.label] = f.byte_len || 0;
            }
        });

        // Map lanes to process formula blocks
        return uiLanes.map(lane => ({
            ...lane,
            items: lane.items.map(f => {
                // 1. Length Calculation
                if (f.op_code === 'LENGTH_CALC') {
                    const formula = f.parameter_config?.formula;
                    try {
                        const involvedVars = formula.match(/\[([^\]]+)\]/g)?.map(m => m.slice(1, -1)) || [];
                        const hasUnknown = involvedVars.some(v => nameToValueMap[v] === "??");
                        if (hasUnknown) return { ...f, parameter_config: { ...f.parameter_config, computedValue: "??" } };

                        const result = evaluateFormula(formula, nameToValueMap);
                        const hex = formatToHex(result, f.byte_len || 1);
                        return { ...f, parameter_config: { ...f.parameter_config, computedValue: hex } };
                    } catch (e) {
                        return { ...f, parameter_config: { ...f.parameter_config, computedValue: "??" } };
                    }
                }
                // 2. Time Accumulation
                if (f.op_code === 'TIME_ACCUMULATOR') {
                    const baseStr = f.parameter_config?.base_time;
                    if (!baseStr) return f;
                    const baseDate = new Date(baseStr);
                    const now = new Date();
                    const diffSec = Math.floor((now.getTime() - baseDate.getTime()) / 1000);
                    const hex = formatToHex(diffSec, f.byte_len || 4);
                    return { ...f, parameter_config: { ...f.parameter_config, computedValue: hex } };
                }
                // 3. Auto Counter
                if (f.op_code === 'AUTO_COUNTER') {
                    const startVal = f.parameter_config?.start_val || 0;
                    const hex = formatToHex(startVal, f.byte_len || 1);
                    return { ...f, parameter_config: { ...f.parameter_config, computedValue: hex } };
                }
                // Dynamic Group Sizing
                if (f.op_code === 'ARRAY_GROUP') {
                    return { ...f, byte_len: 0, _displayLen: '??' };
                }
                return f;
            })
        }));
    }, [uiLanes, currentInstruction?.fields]);

    const handleNavigateGroup = (groupId) => {
        setExpandedGroupIds(prev => {
            const next = [...prev];
            const idx = next.indexOf(groupId);
            if (idx !== -1) {
                next.splice(idx, 1);
            } else {
                next.push(groupId);
                setFocusedParentId(groupId);
            }
            return next;
        });
    };

    return {
        expandedGroupIds,
        setExpandedGroupIds,
        focusedParentId,
        setFocusedParentId,
        processedLanes,
        handleNavigateGroup
    };
}
