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
                if (f.op_code === 'LENGTH_CALC') {
                    const formula = f.parameter_config?.formula;
                    try {
                        // Check if formula involves any "unknown" variables
                        // Simple check: if any referenced field maps to "??"
                        const involvedVars = formula.match(/\[([^\]]+)\]/g)?.map(m => m.slice(1, -1)) || [];
                        const hasUnknown = involvedVars.some(v => nameToValueMap[v] === "??");

                        if (hasUnknown) {
                            return { ...f, parameter_config: { ...f.parameter_config, computedValue: "??" } };
                        }

                        const result = evaluateFormula(formula, nameToValueMap);
                        const hex = formatToHex(result, f.byte_len || 1);
                        return { ...f, parameter_config: { ...f.parameter_config, computedValue: hex } };
                    } catch (e) {
                        return { ...f, parameter_config: { ...f.parameter_config, computedValue: "??" } };
                    }
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
    useEffect(() => {
        setActiveGroupPath([null]);
        setSelectedId(null);
    }, [activeInstructionId]);

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

        // Determine parent_id based on active lane context
        // The last ID in activeGroupPath is the current parent (or null)
        const currentParentId = activeGroupPath[activeGroupPath.length - 1];

        // Find max sequence in current context
        const siblings = currentInstruction.fields.filter(f => (f.parent_id || null) === currentParentId);
        const nextSeq = siblings.length > 0 ? Math.max(...siblings.map(s => s.sequence)) + 1 : 0;

        const newBlock = {
            id: uuidv4(),
            parent_id: currentParentId, // Set hierarchically
            sequence: nextSeq,
            op_code: opCode,
            name: getUniqueName(template?.name || opCode),
            byte_len: 1,
            parameter_config: {},
            children: [],
            repeat_type: 'NONE', repeat_count: 1
        };

        if (opCode === 'HEX_RAW') newBlock.parameter_config = { hex: "00" };
        if (opCode === 'ARRAY_GROUP') {
            newBlock.byte_len = 0; // Dynamic
            newBlock.parameter_config = { max_count: 1 };
        }
        if (template?.param_template?.bits) {
            const defaultBits = Array.isArray(template.param_template.bits) ? template.param_template.bits[0] : 8;
            newBlock.parameter_config = { bits: defaultBits };
            newBlock.byte_len = Math.ceil(defaultBits / 8);
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
            openConfirm("Discard unsaved changes?", () => {
                setActiveInstructionId(id);
                setSelectedId(null);
                setHasUnsavedChanges(false);
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
                    <div className="flex items-center gap-2 cursor-pointer hover:text-white" onClick={() => setSelectedId(null)}>
                        <span>KERNEL EDITOR // {currentInstruction?.device_code} / {currentInstruction?.code}</span>
                    </div>
                    <div className="flex gap-2">
                        {hasUnsavedChanges && <span className="text-yellow-500 animate-pulse">UNSAVED</span>}
                        {hasUnsavedChanges && (
                            <button onClick={handleRevertChanges} className="hover:text-white hover:underline">RESET</button>
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
                        // Cascade Navigation Logic
                        // If clicking a group, we APPEND it to the path if it's not already open
                        // Or strictly: Path = [null, ...ancestors, groupId]

                        // For now, simplify: Click group -> Drill Down (Add to path)
                        // Click "Back" (Breadcrumbs handled in Canvas?) -> handled there

                        // Toggle Logic:
                        // If we click a group that is already the LAST item in path -> Close it? (Go up)
                        // If we click a group which is NOT the last -> Open it (Append)

                        // But wait, "Cascade" means showing ALL levels.
                        // If I click a group in Lane 0, Lane 1 opens.
                        // If I click a group in Lane 1, Lane 2 opens.

                        // We need to truncate the path if we click an earlier lane? 
                        // We'll let Canvas handle the UI click, but here we update state.

                        const laneIndex = activeGroupPath.indexOf(groupId);
                        if (laneIndex !== -1) {
                            // Already active. Maybe collapse children?
                            // Truncate everything after this ID
                            setActiveGroupPath(prev => prev.slice(0, laneIndex + 1));
                        } else {
                            // Determine depth of this group
                            // We need to know which lane this group belongs to.
                            // The block object knows its parent_id.

                            const block = currentInstruction.fields.find(f => f.id === groupId);
                            const parentId = block?.parent_id || null;
                            const parentIndex = activeGroupPath.indexOf(parentId);

                            if (parentIndex !== -1) {
                                // Valid hierarchy. Append this group after its parent.
                                const newPath = activeGroupPath.slice(0, parentIndex + 1);
                                newPath.push(groupId);
                                setActiveGroupPath(newPath);
                            }
                        }
                    }}
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
