import React, { useState, useEffect, useCallback } from 'react';
import Canvas from '../components/Canvas';
import { v4 as uuidv4 } from 'uuid';
import { api } from '../api';
import NieRModal from '../components/NieRModal';
import NieRDatePicker from '../components/NieRDatePicker';
import InstructionListSidebar from '../components/InstructionListSidebar';
import ComponentPalette from '../components/ComponentPalette';
import BlockPropertiesPanel from '../components/BlockPropertiesPanel';
import { evaluateFormula, formatToHex } from '../utils/formula';

export default function Instruction({ onWebUpdate }) {
    // Data State
    const [instructions, setInstructions] = useState([]);
    const [operatorTemplates, setOperatorTemplates] = useState({}); // Map: op_code -> template
    const [activeInstructionId, setActiveInstructionId] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [statusMsg, setStatusMsg] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    // Derived State
    const currentInstruction = instructions.find(i => i.id === activeInstructionId);

    // NESTED GROUPS: Cascade View State
    // [null] = Root Lane. [null, 'id-1'] = Root -> Group 1.
    const [activeGroupPath, setActiveGroupPath] = useState([null]);
    const [focusedLaneIndex, setFocusedLaneIndex] = useState(0);

    // Compute Lanes for Canvas
    const uiLanes = React.useMemo(() => {
        if (!currentInstruction?.fields) return [];

        const lanes = activeGroupPath.map((parentId, depth) => {
            // Filter blocks for this lane
            const items = currentInstruction.fields.filter(f => {
                // Handle "null" vs "undefined" parent_id consistency
                const pId = f.parent_id || null;
                return pId === parentId;
            }).sort((a, b) => a.sequence - b.sequence);

            return {
                depth,
                parentId,
                items
            };
        });

        return lanes;
    }, [currentInstruction?.fields, activeGroupPath]);

    // LIVE FORMULA EVALUATION (Updated for Lanes)
    // We calculate this in a useMemo so it updates whenever fields change
    const processedLanes = React.useMemo(() => {
        // Flatten all fields for convenient lookup map
        const allFields = currentInstruction?.fields || [];
        const nameToValueMap = {};
        allFields.forEach(f => {
            // For Groups, we use specific "??", as they don't have built-in size
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
                // 2. Time Accumulation (Preview: current - base)
                if (f.op_code === 'TIME_ACCUMULATOR') {
                    const baseStr = f.parameter_config?.base_time;
                    if (!baseStr) return f;
                    const baseDate = new Date(baseStr);
                    const now = new Date();
                    const diffSec = Math.floor((now.getTime() - baseDate.getTime()) / 1000);
                    const hex = formatToHex(diffSec, f.byte_len || 4); // Default to 4B for time
                    return { ...f, parameter_config: { ...f.parameter_config, computedValue: hex } };
                }
                // 3. Auto Counter (Preview: shows start_val)
                if (f.op_code === 'AUTO_COUNTER') {
                    const startVal = f.parameter_config?.start_val || 0;
                    const hex = formatToHex(startVal, f.byte_len || 1);
                    return { ...f, parameter_config: { ...f.parameter_config, computedValue: hex } };
                }
                // Handle Dynamic Group Sizing Display
                if (f.op_code === 'ARRAY_GROUP') {
                    return { ...f, byte_len: '??' }; // Display placeholder
                }
                return f;
            })
        }));
    }, [uiLanes, currentInstruction?.fields]);


    const [selectedId, setSelectedId] = useState(null);
    const flattenedProcessed = processedLanes.flatMap(l => l.items);
    const selectedBlock = flattenedProcessed.find(b => b.id === selectedId);

    // Modal State
    const [modalConfig, setModalConfig] = useState({
        isOpen: false,
        message: '',
        onConfirm: null,
        onCancel: null
    });

    const openConfirm = (msg, action) => {
        setModalConfig({
            isOpen: true,
            message: msg,
            onConfirm: () => {
                action();
                setModalConfig(prev => ({ ...prev, isOpen: false }));
            },
            onCancel: () => setModalConfig(prev => ({ ...prev, isOpen: false }))
        });
    };

    // Date Picker State
    const [datePickerState, setDatePickerState] = useState({
        isOpen: false,
        value: null,
        onConfirmCallback: null
    });

    // Picking Mode State (Logic Fields)
    const [pickingMode, setPickingMode] = useState({
        isActive: false,
        fieldKey: null,     // which param is being picked (e.g., 'refs')
        currentRefs: [],    // list of currently selected IDs
        onUpdateRefs: null  // callback to save selection
    });

    // Load Initial Data
    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [instData, opData] = await Promise.all([
                api.getInstructions(),
                api.getOperatorTemplates()
            ]);
            setInstructions(instData);

            // Convert op list to map
            const opMap = {};
            opData.forEach(op => opMap[op.op_code] = op);
            setOperatorTemplates(opMap);

            if (instData.length > 0 && !activeInstructionId) {
                setActiveInstructionId(instData[0].id);
            }
            if (onWebUpdate) onWebUpdate(instData);
        } catch (err) {
            console.error("Failed to load data", err);
            setStatusMsg('离线模式 / 数据库错误');
        } finally {
            setIsLoading(false);
        }
    };

    // Reset Group Path when switching instructions
    // Reset Group Path when switching instructions & Default Expand All
    useEffect(() => {
        if (!activeInstructionId) {
            setActiveGroupPath([null]);
            return;
        }

        const inst = instructions.find(i => i.id === activeInstructionId);
        if (!inst || !inst.fields) {
            setActiveGroupPath([null]);
            setSelectedId(null);
            return;
        }

        // Greedy Expansion: Recursively find the first GROUP in each layer
        const newPath = [null];
        let currentParent = null;
        let safeCounter = 0;

        while (safeCounter < 10) { // Limit depth to avoid infinite loop
            safeCounter++;
            const children = inst.fields
                .filter(f => (f.parent_id || null) === currentParent)
                .sort((a, b) => a.sequence - b.sequence);

            const firstGroup = children.find(f => f.op_code === 'ARRAY_GROUP');
            if (firstGroup) {
                newPath.push(firstGroup.id);
                currentParent = firstGroup.id;
            } else {
                break;
            }
        }

        setActiveGroupPath(newPath);
        setFocusedLaneIndex(newPath.length - 1);
        setSelectedId(null);
    }, [activeInstructionId, instructions]);

    const loadInstructions = async (search = '') => {
        setIsLoading(true);
        try {
            const data = await api.getInstructions(search);
            setInstructions(data);
            setHasUnsavedChanges(false);
        } catch (err) { console.error(err); } finally { setIsLoading(false); }
    }

    // Context Switch
    const handleCanvasClick = (e) => {
        if (pickingMode.isActive) return; // Don't deselect when picking
        if (e.target === e.currentTarget || e.target.classList.contains('canvas-bg')) {
            setSelectedId(null);
        }
    };

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
            if (e.key === 'Delete' && selectedId && !modalConfig.isOpen) {
                promptDeleteBlock(selectedId);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedId, modalConfig.isOpen]);

    // Actions
    const handleAddInstruction = async () => {
        const doAdd = async () => {
            const newInstPayload = {
                device_code: 'DEV-001',
                name: `New Instruction ${Math.floor(Math.random() * 1000)}`,
                code: `CMD - ${Math.floor(Math.random() * 1000)} `,
                type: 'STATIC',
                fields: []
            };
            try {
                const created = await api.createInstruction(newInstPayload);
                setInstructions(prev => [...prev, created]);
                setActiveInstructionId(created.id);
                setHasUnsavedChanges(false);
            } catch (e) {
                if (e.response && e.response.status === 400) {
                    setStatusMsg(e.response.data.detail);
                    setTimeout(() => setStatusMsg('ERROR'), 2000);
                }
            }
        };
        if (hasUnsavedChanges) openConfirm("检测到未保存的更改。\n是否覆盖？", doAdd);
        else doAdd();
    };

    const handleDeleteInstruction = async (e, id) => {
        e.stopPropagation();
        openConfirm("警告：确认永久删除此指令？", async () => {
            try {
                await api.deleteInstruction(id);
                const rem = instructions.filter(i => i.id !== id);
                setInstructions(rem);
                if (activeInstructionId === id) setActiveInstructionId(rem[0]?.id || null);
                setHasUnsavedChanges(false);
            } catch (e) { }
        });
    };

    const updateLocalInstruction = (updatedInst) => {
        const newInstructions = instructions.map(i => i.id === updatedInst.id ? updatedInst : i);
        setInstructions(newInstructions);
        setHasUnsavedChanges(true);
    }

    const handleSaveChanges = async () => {
        if (!currentInstruction) return;
        try {
            setStatusMsg('保存中...');
            await api.updateInstruction(currentInstruction.id, currentInstruction);
            setStatusMsg('已保存');
            setHasUnsavedChanges(false);
            if (onWebUpdate) onWebUpdate(instructions);
            setTimeout(() => setStatusMsg(''), 1000);
        } catch (e) {
            console.error(e);
            if (e.response && e.response.status === 400) {
                setStatusMsg(e.response.data.detail); // Show specific backend error
                // Maybe use alert/confirm for persistent error?
                openConfirm(`保存失败：\n${e.response.data.detail}`, () => { });
            } else {
                setStatusMsg('保存失败');
            }
        }
    };

    const handleRevertChanges = async () => {
        openConfirm("放弃所有更改并重新加载？", () => {
            loadInstructions();
        });
    };

    // Helper: Ensure Unique Name
    const getUniqueName = (baseName, excludeId = null) => {
        let name = baseName;
        let counter = 1;
        const existingNames = new Set(
            currentInstruction.fields
                .filter(f => f.id !== excludeId)
                .map(f => f.name || f.label)
        );

        while (existingNames.has(name)) {
            name = `${baseName}_${counter}`;
            counter++;
        }
        return name;
    }

    const handleAddBlock = (opCode) => {
        if (!currentInstruction) return;
        const template = operatorTemplates[opCode] || operatorTemplates['HEX_RAW'];

        // Determine parent_id based on FOCUSED lane context
        const currentParentId = activeGroupPath[focusedLaneIndex];

        // Find max sequence in current context
        const siblings = currentInstruction.fields.filter(f => (f.parent_id || null) === currentParentId);
        const nextSeq = siblings.length > 0 ? Math.max(...siblings.map(s => s.sequence)) + 1 : 0;

        // Initialize Parameters from Template
        const defaultParams = {};
        if (template.param_template) {
            const keywords = ['datetime', 'number', 'string', 'field_picker', 'kv_pair_list', 'input'];
            Object.entries(template.param_template).forEach(([key, val]) => {
                // If the value is NOT a type keyword, treat it as a default value
                if (typeof val !== 'string' || !keywords.includes(val)) {
                    defaultParams[key] = val;
                }
            });
        }

        const newBlock = {
            id: uuidv4(),
            parent_id: currentParentId, // Set hierarchically
            sequence: nextSeq,
            op_code: opCode,
            name: getUniqueName(template?.name || opCode),
            parameter_config: defaultParams,
            children: [], // Ensure children is an empty array by default
            repeat_type: template.repeat_type || 'NONE', // Default from template or 'NONE'
            repeat_count: template.repeat_count || 1, // Default from template or 1
            byte_len: template.byte_len || 1, // Default from template or 1
        };

        // UI-Only Overrides (if not already set by template defaults)
        if (opCode === 'HEX_RAW' && !newBlock.parameter_config.hex) newBlock.parameter_config.hex = "00";
        if (opCode === 'ARRAY_GROUP') {
            newBlock.byte_len = 0; // Dynamic
            if (!newBlock.parameter_config.max_count) newBlock.parameter_config.max_count = 1;
        }
        if (template?.param_template?.bits) {
            const defaultBits = Array.isArray(template.param_template.bits) ? template.param_template.bits[0] : 8;
            if (!newBlock.parameter_config.bits) newBlock.parameter_config.bits = defaultBits;
            newBlock.byte_len = Math.ceil(newBlock.parameter_config.bits / 8);
        }

        // Add to flat list
        updateLocalInstruction({ ...currentInstruction, fields: [...currentInstruction.fields, newBlock] });
    };

    const promptDeleteBlock = (id) => {
        openConfirm("删除所选积木？", () => {
            // Functional update to avoid stale closure
            setInstructions(prev => {
                const active = prev.find(i => i.id === activeInstructionId);
                if (!active) return prev;
                const filtered = active.fields.filter(b => b.id !== id);
                return prev.map(i => i.id === active.id ? { ...i, fields: filtered } : i);
            });
            setHasUnsavedChanges(true);
            if (selectedId === id) setSelectedId(null);
        });
    }

    const handleSaveBlock = (updatedBlock) => {
        // 0. Ensure Name Uniqueness (if name changed)
        const originalName = currentInstruction.fields.find(f => f.id === updatedBlock.id)?.name;
        if (updatedBlock.name !== originalName) {
            const uniqueName = getUniqueName(updatedBlock.name, updatedBlock.id);
            if (uniqueName !== updatedBlock.name) {
                updatedBlock.name = uniqueName;
                // Use explicit modal for "Correction" feedback
                openConfirm(`名称冲突自动修正：\n已重命名为 "${uniqueName}"`, () => { });
                // setStatusMsg(`已重命名为: ${uniqueName}`); 
            }
        }

        // 1. Identify if this is a RENAME operation
        const oldBlock = currentInstruction.fields.find(b => b.id === updatedBlock.id);
        const oldName = oldBlock?.name || oldBlock?.label;
        const newName = updatedBlock.name || updatedBlock.label;
        const isRename = oldName !== newName;

        // Add timestamp to force UI refresh in BlockPropertiesPanel
        updatedBlock.updatedAt = Date.now();

        let newFields = currentInstruction.fields.map(b => b.id === updatedBlock.id ? updatedBlock : b);

        // 2. If renamed, sync all dependent formulas
        if (isRename) {
            newFields = newFields.map(b => {
                const refs = b.parameter_config?.refs || [];
                const formula = b.parameter_config?.formula;

                // If this block references the renamed block and has a formula
                if (refs.includes(updatedBlock.id) && typeof formula === 'string') {
                    // Replace [OldName] with [NewName]
                    const escapedOld = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const regex = new RegExp(`\\[${escapedOld}\\]`, 'g');
                    const newFormula = formula.replace(regex, `[${newName}]`);

                    return {
                        ...b,
                        parameter_config: { ...b.parameter_config, formula: newFormula }
                    };
                }
                return b;
            });
        }

        const newInst = { ...currentInstruction, fields: newFields };

        // 3. Update Local State
        setInstructions(prev => prev.map(i => i.id === newInst.id ? newInst : i));

        // 4. Async Persist (Auto-Save)
        // 4. Async Persist (Auto-Save)
        api.updateInstruction(newInst.id, newInst)
            .then(() => {
                // Only show "CONFIG SAVED" if we didn't just show a rename warning
                if (originalName === updatedBlock.name) {
                    setStatusMsg('已保存');
                    setTimeout(() => setStatusMsg(''), 1000);
                }
            })
            .catch(() => setStatusMsg('保存失败'));
    }

    const handleSelectInstruction = (id) => {
        if (hasUnsavedChanges && activeInstructionId !== id) {
            openConfirm("放弃未保存的更改？", () => {
                // To discard, we must reload the original state from backend
                loadInstructions().then(() => {
                    setActiveInstructionId(id);
                    setSelectedId(null);
                    setHasUnsavedChanges(false);
                });
            });
            return;
        }
        setActiveInstructionId(id);
        setSelectedId(null);
        if (activeInstructionId !== id) setHasUnsavedChanges(false);
    }

    const handlePickBlock = (targetId) => {
        if (!pickingMode.isActive) return;
        const currentRefs = pickingMode.currentRefs || [];
        const isSelected = currentRefs.includes(targetId);
        let newRefs = isSelected ? currentRefs.filter(id => id !== targetId) : [...currentRefs, targetId];
        setPickingMode(prev => ({ ...prev, currentRefs: newRefs }));
        if (pickingMode.onUpdateRefs) pickingMode.onUpdateRefs(newRefs);
    };

    // MAIN RENDER
    return (
        <div className="flex-1 flex overflow-hidden relative">
            <NieRModal
                isOpen={modalConfig.isOpen}
                message={modalConfig.message}
                onConfirm={modalConfig.onConfirm}
                onCancel={modalConfig.onCancel}
            />
            <NieRDatePicker
                isOpen={datePickerState.isOpen}
                initialValue={datePickerState.value}
                onConfirm={(iso) => {
                    if (datePickerState.onConfirmCallback) {
                        datePickerState.onConfirmCallback(iso);
                    }
                    setDatePickerState(prev => ({ ...prev, isOpen: false }));
                }}
                onCancel={() => setDatePickerState(prev => ({ ...prev, isOpen: false }))}
            />

            {/* Status Overlay */}
            {statusMsg && (
                <div className="absolute top-2 right-2 z-50 text-[10px] font-mono bg-nier-dark border border-nier-light px-2 text-nier-light animate-pulse">
                    SYS: {statusMsg}
                </div>
            )}

            <InstructionListSidebar
                instructions={instructions}
                activeInstructionId={activeInstructionId}
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                onSearch={loadInstructions}
                onSelect={handleSelectInstruction}
                onAdd={handleAddInstruction}
                onDelete={handleDeleteInstruction}
                hasUnsavedChanges={hasUnsavedChanges}
            />

            <ComponentPalette
                operatorTemplates={operatorTemplates}
                onAddBlock={handleAddBlock}
            />

            {/* Canvas Area */}
            <section
                className="flex-1 relative bg-[url('/grid.png')] bg-repeat opacity-90 overflow-hidden flex flex-col canvas-bg"
                onClick={handleCanvasClick}
            >
                <div className="h-10 border-b border-nier-light bg-nier-dark/90 flex items-center justify-between px-4 gap-2 text-xs font-mono opacity-50">
                    <div className="flex items-center gap-2 cursor-pointer hover:text-nier-light" onClick={() => setSelectedId(null)}>
                        <span>KERNEL EDITOR // {currentInstruction?.device_code} / {currentInstruction?.code}</span>
                    </div>
                    <div className="flex gap-2">
                        {hasUnsavedChanges && <span className="text-yellow-500 animate-pulse">UNSAVED</span>}
                        {hasUnsavedChanges && (
                            <button onClick={handleRevertChanges} className="hover:text-nier-light hover:underline">RESET</button>
                        )}
                    </div>
                </div>

                <Canvas
                    lanes={processedLanes} // Pass ALL lanes
                    onMoveItem={(itemId, newParentId, newIndex) => {
                        const allFields = [...currentInstruction.fields];
                        const itemIndex = allFields.findIndex(f => f.id === itemId);
                        if (itemIndex === -1) return;

                        const item = { ...allFields[itemIndex] };

                        // 1. Remove from old list
                        allFields.splice(itemIndex, 1);

                        // 2. Filter siblings of the DESTINATION parent
                        // We need to insert it into the correct relative position among siblings
                        const siblings = allFields.filter(f => (f.parent_id || null) === newParentId)
                            .sort((a, b) => a.sequence - b.sequence);

                        // 3. Insert at newIndex
                        siblings.splice(newIndex, 0, item);

                        // 4. Update Sequence & Parent for changed siblings
                        // We need to re-sequence THIS group's siblings
                        const updatedSiblings = siblings.map((sib, idx) => ({
                            ...sib,
                            parent_id: newParentId, // Update parent for the moved item
                            sequence: idx
                        }));

                        // 5. Merge back into main list
                        // We keep non-siblings as is, and replace siblings with updated versions
                        const finalFields = allFields.filter(f => (f.parent_id || null) !== newParentId);
                        finalFields.push(...updatedSiblings);

                        updateLocalInstruction({ ...currentInstruction, fields: finalFields });
                    }}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    pickingMode={pickingMode}
                    onPickBlock={handlePickBlock}
                    activeGroupPath={activeGroupPath}
                    onNavigateGroup={(groupId) => {
                        const laneIndexInPath = activeGroupPath.indexOf(groupId);
                        if (laneIndexInPath !== -1) {
                            // If it's already in path, we switch focus to its CHILD lane (the lane it opens)
                            // In our logic, activeGroupPath[1] is the content of the group clicked in Lane 0.
                            // So Lane 1 should be focused.
                            setFocusedLaneIndex(laneIndexInPath + 1);
                        } else {
                            // Drilling down: Append to path and focus the new last lane
                            const block = currentInstruction.fields.find(f => f.id === groupId);
                            const parentId = block?.parent_id || null;
                            const parentIndex = activeGroupPath.indexOf(parentId);

                            if (parentIndex !== -1) {
                                const newPath = activeGroupPath.slice(0, parentIndex + 1);
                                newPath.push(groupId);
                                setActiveGroupPath(newPath);
                                setFocusedLaneIndex(newPath.length - 1);
                            }
                        }
                    }}
                    focusedLaneIndex={focusedLaneIndex}
                    onSetFocusedLane={setFocusedLaneIndex}
                />
            </section>

            <BlockPropertiesPanel
                selectedBlock={selectedBlock}
                currentInstruction={currentInstruction}
                operatorTemplates={operatorTemplates}
                hasUnsavedChanges={hasUnsavedChanges}
                onUpdateInstruction={updateLocalInstruction}
                onSaveInstruction={handleSaveChanges}
                onDeleteInstruction={handleDeleteInstruction}
                onDeleteBlock={promptDeleteBlock}
                onSaveBlock={handleSaveBlock}
                openConfirm={openConfirm}
                onOpenDatePicker={(val, callback) => {
                    setDatePickerState({
                        isOpen: true,
                        value: val,
                        onConfirmCallback: callback
                    });
                }}

                // PICKING LOGIC
                pickingMode={pickingMode}
                setPickingMode={setPickingMode}
                onPickBlock={handlePickBlock}
            />
        </div>
    );
}
