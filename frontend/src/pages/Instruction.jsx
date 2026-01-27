import React, { useState, useEffect, useCallback } from 'react';
import Canvas from '../components/Canvas';
import { v4 as uuidv4 } from 'uuid';
import { api } from '../api';
import NieRModal from '../components/NieRModal';
import NieRDatePicker from '../components/NieRDatePicker';
import InstructionListSidebar from '../components/InstructionListSidebar';
import ComponentPalette from '../components/ComponentPalette';
import BlockPropertiesPanel from '../components/BlockPropertiesPanel';

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
    const currentBlocks = currentInstruction?.fields || [];
    const [selectedId, setSelectedId] = useState(null);
    const selectedBlock = currentBlocks.find(b => b.id === selectedId);

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
            setStatusMsg('OFFLINE MODE / DB ERROR');
        } finally {
            setIsLoading(false);
        }
    };

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
                name: 'New Instruction',
                code: `CMD - ${Math.floor(Math.random() * 1000)} `,
                type: 'STATIC',
                fields: []
            };
            try {
                const created = await api.createInstruction(newInstPayload);
                setInstructions(prev => [...prev, created]);
                setActiveInstructionId(created.id);
                setHasUnsavedChanges(false);
            } catch (e) { }
        };
        if (hasUnsavedChanges) openConfirm("Unsaved changes will be lost.\nProceed?", doAdd);
        else doAdd();
    };

    const handleDeleteInstruction = async (e, id) => {
        e.stopPropagation();
        openConfirm("WARNING: Delete this instruction permanently?", async () => {
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
            setStatusMsg('SAVING...');
            await api.updateInstruction(currentInstruction.id, currentInstruction);
            setStatusMsg('SAVED');
            setHasUnsavedChanges(false);
            if (onWebUpdate) onWebUpdate(instructions);
            setTimeout(() => setStatusMsg(''), 1000);
        } catch (e) { setStatusMsg('SAVE FAILED'); }
    };

    const handleRevertChanges = async () => {
        openConfirm("Discard all unsaved changes and reload?", () => {
            loadInstructions();
        });
    };

    const handleAddBlock = (opCode) => {
        if (!currentInstruction) return;
        const template = operatorTemplates[opCode] || operatorTemplates['HEX_RAW'];
        const newBlock = {
            id: uuidv4(),
            parent_id: null,
            sequence: currentBlocks.length,
            op_code: opCode,
            name: template?.name || opCode,
            byte_len: 1,
            parameter_config: {},
            children: [],
            repeat_type: 'NONE', repeat_count: 1
        };
        if (opCode === 'HEX_RAW') newBlock.parameter_config = { hex: "00" };
        if (template?.param_template?.bits) {
            const defaultBits = Array.isArray(template.param_template.bits) ? template.param_template.bits[0] : 8;
            newBlock.parameter_config = { bits: defaultBits };
            newBlock.byte_len = Math.ceil(defaultBits / 8);
        }
        updateLocalInstruction({ ...currentInstruction, fields: [...currentBlocks, newBlock] });
    };

    const promptDeleteBlock = (id) => {
        openConfirm("Delete selected block?", () => {
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
        // MERGE block change into current instruction state
        const newFields = currentBlocks.map(b => b.id === updatedBlock.id ? updatedBlock : b);
        const newInst = { ...currentInstruction, fields: newFields };

        // 1. Optimistic Update (Local)
        setInstructions(prev => prev.map(i => i.id === newInst.id ? newInst : i));

        // 2. Async Persist (Auto-Save)
        api.updateInstruction(newInst.id, newInst)
            .then(() => setStatusMsg('CONFIG SAVED'))
            .catch(() => setStatusMsg('SAVE FAILED'));
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
                    items={currentBlocks.map(b => ({
                        ...b,
                        type: b.op_code === 'HEX_RAW' ? 'hex' : 'cmd'
                    }))}
                    setItems={(newItems) => {
                        const sequenced = newItems.map((item, idx) => ({ ...item, sequence: idx }));
                        updateLocalInstruction({ ...currentInstruction, fields: sequenced });
                    }}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    pickingMode={pickingMode}
                    onPickBlock={handlePickBlock}
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
