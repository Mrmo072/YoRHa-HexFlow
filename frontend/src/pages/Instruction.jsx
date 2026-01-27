
import React, { useState, useEffect, useCallback } from 'react';
import Canvas from '../components/Canvas';
import { v4 as uuidv4 } from 'uuid';
import { api } from '../api';
import NieRModal from '../components/NieRModal';
import NieRDatePicker from '../components/NieRDatePicker';



export default function Instruction({ onWebUpdate }) {
    // Data State
    const [instructions, setInstructions] = useState([]);
    const [operatorTemplates, setOperatorTemplates] = useState({}); // Map: op_code -> template
    const [activeInstructionId, setActiveInstructionId] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [statusMsg, setStatusMsg] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

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
    const [datePickerState, setDatePickerState] = useState({ isOpen: false, paramKey: null, value: null });

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

    // Derived State
    const currentInstruction = instructions.find(i => i.id === activeInstructionId);
    const currentBlocks = currentInstruction?.fields || [];
    const [selectedId, setSelectedId] = useState(null);
    const selectedBlock = currentBlocks.find(b => b.id === selectedId);

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Ignore if input/select is focused
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

            if (e.key === 'Delete' && selectedId && !modalConfig.isOpen) {
                // Don't confirm here, just call handler. Handler calls shared confirm logic.
                // NOTE: We used to have confirm() here, now it's delegated to handleDeleteBlock
                // BUT handleDeleteBlock needs to know it's being called? 
                // Actually if openConfirm is async-like (callback based), we can't just call it inside a loop easily without state isolation. 
                // But it's fine.
                promptDeleteBlock(selectedId);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedId, modalConfig.isOpen]); // Re-bind

    // CRUD Ops
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
                // This is a server state update, so we should sync
                setInstructions(prev => [...prev, created]);
                setActiveInstructionId(created.id);
                setHasUnsavedChanges(false);
            } catch (e) { }
        };

        if (hasUnsavedChanges) {
            openConfirm("Unsaved changes will be lost.\nProceed?", doAdd);
        } else {
            doAdd();
        }
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

    // --- LOCAL UPDATE LOGIC (No API Call) ---
    const updateLocalInstruction = (updatedInst) => {
        const newInstructions = instructions.map(i => i.id === updatedInst.id ? updatedInst : i);
        setInstructions(newInstructions);
        setHasUnsavedChanges(true);
    }

    // --- MANUAL SAVE ---
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
            loadInstructions(); // Re-fetch from DB
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

        // Smart Defaults
        if (opCode === 'HEX_RAW') newBlock.parameter_config = { hex: "00" };
        if (template?.param_template?.bits) {
            // Default to first option (e.g. 8 bits -> 1 byte)
            const defaultBits = Array.isArray(template.param_template.bits) ? template.param_template.bits[0] : 8;
            newBlock.parameter_config = { bits: defaultBits };
            newBlock.byte_len = Math.ceil(defaultBits / 8);
        }

        const updatedInst = {
            ...currentInstruction,
            fields: [...currentBlocks, newBlock]
        };
        updateLocalInstruction(updatedInst);
    };

    const handleUpdateBlock = (id, updates) => {
        const newBlocks = currentBlocks.map(b => b.id === id ? { ...b, ...updates } : b);
        updateLocalInstruction({ ...currentInstruction, fields: newBlocks });
    };

    const promptDeleteBlock = (id) => {
        openConfirm("Delete selected block?", () => {
            const newBlocks = currentBlocks.filter(b => b.id !== id);
            // Must access currentInstruction from closure or ref? 
            // Since this is defined in render, it captures currentInstruction.
            // But verify stale closure in async/callback? 
            // openConfirm stores the callback. The callback captures currentInstruction.
            // This relies on React re-render not destroying the modal logic.
            // Since modal is part of this component, it works.

            // Re-fetch current instruction just to be safe if closure is stale?
            // Actually, we should pass the instruction to update logic.
            // But `currentInstruction` is derived from state `instructions` & `activeId`.

            // We need to act on the `instructions` state.
            // Functional update to avoid stale closure:
            setInstructions(prev => {
                const active = prev.find(i => i.id === activeInstructionId);
                if (!active) return prev;
                const filtered = active.fields.filter(b => b.id !== id);
                return prev.map(i => i.id === active.id ? { ...i, fields: filtered } : i);
            });
            setHasUnsavedChanges(true); // Manually set dirty since we bypassed updateLocalInstruction wrapper
            if (selectedId === id) setSelectedId(null);
        });
    }

    // Field Editing State
    const [tempBlockConfig, setTempBlockConfig] = useState(null);

    useEffect(() => {
        if (selectedBlock) {
            setTempBlockConfig({
                ...selectedBlock,
                // Deep copy param config to allow cancel/validation
                parameter_config: { ...selectedBlock.parameter_config }
            });
        } else {
            setTempBlockConfig(null);
        }
    }, [selectedBlock?.id]);

    // Update Temp State (No Propagate)
    const handleTempUpdate = (updates) => {
        setTempBlockConfig(prev => ({ ...prev, ...updates }));
    };

    const handleTempParamUpdate = (key, value) => {
        setTempBlockConfig(prev => ({
            ...prev,
            parameter_config: { ...prev.parameter_config, [key]: value }
        }));
    };

    const applyBlockChanges = () => {
        if (!tempBlockConfig) return;

        // Validation Logic
        if (tempBlockConfig.op_code === 'HEX_RAW') {
            const byteLen = tempBlockConfig.byte_len || 1;
            const hexVal = (tempBlockConfig.parameter_config?.hex || "").replace(/\s/g, '');
            if (hexVal.length !== byteLen * 2) {
                openConfirm(`Validation Error:\nExpected ${byteLen} bytes (${byteLen * 2} chars).\nGot ${hexVal.length} chars.`, () => { });
                return;
            }
            // Clean format
            handleUpdateBlock(tempBlockConfig.id, {
                ...tempBlockConfig,
                parameter_config: { ...tempBlockConfig.parameter_config, hex: hexVal }
            });
        } else {
            handleUpdateBlock(tempBlockConfig.id, tempBlockConfig);
        }
    };

    // --- DYNAMIC FORM RENDERER (Uses Temp State) ---
    const renderParamConfig = (blockState) => {
        const template = operatorTemplates[blockState.op_code];
        if (!template || !template.param_template) return null;

        return Object.entries(template.param_template).map(([key, configType]) => {
            const val = blockState.parameter_config?.[key];

            if (Array.isArray(configType)) {
                return (
                    <div key={key} className="flex flex-col gap-1">
                        <label className="text-[10px] opacity-70 uppercase tracking-widest">{key}</label>
                        <select
                            value={val || configType[0]}
                            onChange={(e) => {
                                const newVal = parseInt(e.target.value);
                                handleTempParamUpdate(key, newVal);
                            }}
                            className="bg-black border border-white/30 text-xs p-1 focus:border-white focus:outline-none"
                        >
                            {configType.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                    </div>
                )
            }

            if (key === 'options' && configType === 'kv_pair_list') {
                return (
                    <div key={key} className="flex flex-col gap-1 border border-white/10 p-2">
                        <label className="text-[10px] opacity-70 uppercase tracking-widest">{key}</label>
                        <textarea
                            className="bg-black/30 border-b border-white/30 text-xs font-mono h-20"
                            value={typeof val === 'object' ? JSON.stringify(val, null, 2) : (val || '')}
                            onChange={(e) => {
                                try {
                                    const parsed = JSON.parse(e.target.value);
                                    handleTempParamUpdate(key, parsed);
                                } catch (err) { /* ignore */ }
                            }}
                        />
                    </div>
                )
            }

            if (configType === 'datetime') {
                return (
                    <div key={key} className="flex flex-col gap-1">
                        <label className="text-[10px] opacity-70 uppercase tracking-widest">{key}</label>
                        <div
                            onClick={() => setDatePickerState({ isOpen: true, paramKey: key, value: val })}
                            className="bg-transparent border-b border-nier-light/50 py-1 font-mono text-xs text-nier-light cursor-pointer hover:bg-nier-light/10 flex justify-between items-center group/date"
                        >
                            <span className={!val ? "opacity-50" : ""}>{val ? val.replace('T', ' ') : 'YYYY-MM-DD HH:MM:SS'}</span>
                            <span className="opacity-30 text-[8px] group-hover/date:opacity-100 transition-opacity">EDIT</span>
                        </div>
                    </div>
                )
            }

            return (
                <div key={key} className="flex flex-col gap-1">
                    <label className="text-[10px] opacity-70 uppercase tracking-widest">{key}</label>
                    <input
                        type={configType === 'number' ? 'number' : 'text'}
                        step={configType === 'number' ? 'any' : undefined}
                        value={val !== undefined ? val : ''}
                        onChange={(e) => {
                            let v = e.target.value;
                            if (configType === 'number') v = parseFloat(v);
                            handleTempParamUpdate(key, v);
                        }}
                        className="bg-transparent border-b border-nier-light/50 focus:border-nier-light focus:outline-none py-1 font-mono text-sm"
                    />
                </div>
            );
        });
    };

    // Grouping for Palette
    const groupedOperators = React.useMemo(() => {
        const groups = {};
        Object.values(operatorTemplates).forEach(op => {
            if (!groups[op.category]) groups[op.category] = [];
            groups[op.category].push(op);
        });

        // Sort Config
        const catOrder = ['PRIMITIVE', 'STRUCTURE', 'CONTROL']; // Custom category order
        const opPriority = ['HEX_RAW', 'UINT8', 'UINT16', 'UINT32', 'INT8', 'INT16', 'STRING_ASCII', 'ENUM_U8'];

        // Sort items per category
        Object.keys(groups).forEach(cat => {
            groups[cat].sort((a, b) => {
                if (a.op_code === 'HEX_RAW') return -1;
                if (b.op_code === 'HEX_RAW') return 1;

                const idxA = opPriority.indexOf(a.op_code);
                const idxB = opPriority.indexOf(b.op_code);

                if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                if (idxA !== -1) return -1;
                if (idxB !== -1) return 1;

                return a.name.localeCompare(b.name);
            });
        });

        // Re-order keys for rendering
        const sortedGroups = {};
        const sortedKeys = Object.keys(groups).sort((a, b) => {
            const ia = catOrder.indexOf(a.toUpperCase());
            const ib = catOrder.indexOf(b.toUpperCase());
            if (ia !== -1 && ib !== -1) return ia - ib;
            if (ia !== -1) return -1;
            if (ib !== -1) return 1;
            return a.localeCompare(b);
        });

        sortedKeys.forEach(k => sortedGroups[k] = groups[k]);
        return sortedGroups;
    }, [operatorTemplates]);

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
                    if (datePickerState.paramKey) handleTempParamUpdate(datePickerState.paramKey, iso);
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

            {/* Instruction List Sidebar */}
            <aside className="w-48 border-r border-nier-light/30 bg-nier-dark/50 flex flex-col">
                <div className="p-4 border-b border-nier-light/30 flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                        <span className="text-xs font-bold tracking-widest">指令库 (DATABASE)</span>
                        <button onClick={handleAddInstruction} className="hover:text-white text-lg leading-none">+</button>
                    </div>
                    {/* Search Input */}
                    <input
                        type="text"
                        placeholder="SEARCH..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && loadInstructions(searchTerm)}
                        className="bg-black/20 border border-nier-light/30 text-[10px] p-1 text-nier-light outline-none focus:border-nier-light font-mono placeholder:text-nier-light/30"
                    />
                </div>
                <div className="flex-1 overflow-y-auto">
                    {instructions.map(inst => (
                        <div key={inst.id}
                            onClick={() => {
                                if (hasUnsavedChanges && activeInstructionId !== inst.id) {
                                    openConfirm("Discard unsaved changes?", () => {
                                        setActiveInstructionId(inst.id);
                                        setSelectedId(null);
                                        setHasUnsavedChanges(false);
                                    });
                                    return;
                                }
                                setActiveInstructionId(inst.id);
                                setSelectedId(null); // Clear block selection to show Inst properties
                                if (activeInstructionId !== inst.id) setHasUnsavedChanges(false);
                            }}
                            className={`p-3 border-b border-nier-light/10 cursor-pointer flex justify-between group ${inst.id === activeInstructionId ? 'bg-nier-light/10 text-white' : 'text-nier-light/70'}`}
                        >
                            <div className="truncate text-xs">{inst.name || inst.label}</div>
                            {inst.id === activeInstructionId && hasUnsavedChanges && <span className="text-[9px] text-yellow-500">*</span>}
                        </div>
                    ))}
                </div>
            </aside>

            {/* Categorized Palette Sidebar */}
            <aside className="w-24 border-r border-nier-light flex flex-col items-center py-2 gap-2 z-10 bg-nier-dark select-none overflow-y-auto hide-scrollbar">
                {Object.entries(groupedOperators).map(([category, ops]) => (
                    <div key={category} className="w-full flex flex-col items-center mb-2">
                        <div className="text-[8px] opacity-40 uppercase tracking-widest mb-1 w-full text-center border-b border-white/10">{category}</div>
                        <div className="grid grid-cols-1 gap-2 w-full px-2">
                            {ops.map(op => (
                                <button
                                    key={op.op_code}
                                    onClick={() => handleAddBlock(op.op_code)}
                                    className="w-full border border-nier-light/30 hover:border-nier-light bg-black/40 hover:bg-white hover:text-black py-2 px-1 text-[9px] leading-tight transition-all text-center flex flex-col items-center gap-1"
                                    title={op.description}
                                >
                                    <span className="font-bold">{op.name}</span>
                                    <span className="text-[7px] opacity-60 scale-90">{op.op_code.split('_')[0]}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </aside>

            {/* Canvas Area */}
            <section className="flex-1 relative bg-[url('/grid.png')] bg-repeat opacity-90 overflow-hidden flex flex-col">
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
                />
            </section>

            {/* Right Panel (Details) */}
            <aside className="w-80 border-l border-nier-light bg-nier-dark/95 backdrop-blur-sm p-4 flex flex-col z-20 shadow-[-5px_0_15px_rgba(0,0,0,0.5)] overflow-y-auto">
                <h2 className="text-lg border-b-2 border-nier-light mb-6 pb-1 font-bold tracking-wider">属性配置 (PROPERTIES)</h2>

                {currentInstruction && !selectedId && (
                    <div className="space-y-6 text-sm">
                        {/* Instruction Meta */}
                        <div className="flex flex-col gap-1">
                            <label className="text-xs opacity-70 uppercase tracking-widest">设备前缀 (Device)</label>
                            <input
                                type="text"
                                value={currentInstruction.device_code || ''}
                                onChange={(e) => updateLocalInstruction({ ...currentInstruction, device_code: e.target.value })}
                                className="bg-transparent border-b border-nier-light/50 focus:border-nier-light focus:outline-none py-1 font-mono tracking-wide"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-xs opacity-70 uppercase tracking-widest">指令代号 (Code)</label>
                            <input
                                type="text"
                                value={currentInstruction.code || ''}
                                onChange={(e) => updateLocalInstruction({ ...currentInstruction, code: e.target.value })}
                                className="bg-transparent border-b border-nier-light/50 focus:border-nier-light focus:outline-none py-1 font-mono tracking-wide"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-xs opacity-70 uppercase tracking-widest">指令名称 (Name)</label>
                            <input
                                type="text"
                                value={currentInstruction.name || currentInstruction.label}
                                onChange={(e) => updateLocalInstruction({ ...currentInstruction, name: e.target.value })}
                                className="bg-transparent border-b border-nier-light/50 focus:border-nier-light focus:outline-none py-1 font-mono tracking-wide"
                            />
                        </div>


                        {/* Instruction Actions */}
                        <div className="pt-8 flex flex-col gap-3 border-t border-nier-light/20">
                            {hasUnsavedChanges && (
                                <button
                                    onClick={handleSaveChanges}
                                    className="w-full bg-nier-light/10 border border-nier-light text-white hover:bg-nier-light hover:text-black py-2 px-4 uppercase text-xs tracking-widest transition-colors font-bold"
                                >
                                    保存更改 (SAVE)
                                </button>
                            )}
                            <button
                                onClick={(e) => handleDeleteInstruction(e, currentInstruction.id)}
                                className="w-full border border-red-500/50 text-red-500 hover:bg-red-500 hover:text-white py-2 px-4 uppercase text-xs tracking-widest transition-colors"
                            >
                                删除指令 (DELETE)
                            </button>
                        </div>
                    </div>
                )}

                {selectedBlock && tempBlockConfig && (
                    <div className="space-y-5 text-sm animate-in fade-in slide-in-from-right-4 duration-300">
                        <div className="text-[10px] opacity-40 font-mono flex justify-between">
                            <span>{selectedBlock.id}</span>
                            <span className="text-nier-light">{selectedBlock.op_code}</span>
                        </div>

                        <div className="flex flex-col gap-1">
                            <label className="text-xs opacity-70 uppercase tracking-widest">字段标签 (Label)</label>
                            <input
                                type="text"
                                value={tempBlockConfig.name || tempBlockConfig.label}
                                onChange={(e) => handleTempUpdate({ name: e.target.value })}
                                className="bg-transparent border-b border-nier-light/50 focus:border-nier-light focus:outline-none py-1 font-mono tracking-wide"
                            />
                        </div>

                        <div className="flex flex-col gap-1">
                            <label className="text-xs opacity-70 uppercase tracking-widest">字节长度 (Length)</label>
                            <input type="number" min="0" value={tempBlockConfig.byte_len || tempBlockConfig.byte_length} onChange={e => handleTempUpdate({ byte_len: parseInt(e.target.value) || 0 })} className="bg-transparent border-b border-nier-light/50 focus:border-nier-light focus:outline-none py-1 font-mono" />
                        </div>

                        {/* Dynamic Params */}
                        <div className="p-3 border border-white/10 bg-white/5 space-y-3">
                            <div className="text-[9px] opacity-50 border-b border-white/10 pb-1 mb-2">配置参数 (CONFIG)</div>
                            {selectedBlock.op_code !== 'HEX_RAW' && renderParamConfig(tempBlockConfig)}

                            {/* HEX_RAW Input (Manual) - Simplified Style */}
                            {selectedBlock.op_code === 'HEX_RAW' && (
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] opacity-70 uppercase tracking-widest">HEX VALUE</label>
                                    <input
                                        type="text"
                                        value={tempBlockConfig.parameter_config?.hex || ""}
                                        onChange={(e) => handleTempParamUpdate('hex', e.target.value.toUpperCase().replace(/[^0-9A-F]/g, ''))}
                                        className="bg-transparent border-b border-nier-light/50 focus:border-nier-light focus:outline-none py-1 font-mono tracking-wide w-full"
                                        placeholder="00"
                                    />
                                    <div className="text-[8px] opacity-50 text-right">
                                        {(tempBlockConfig.parameter_config?.hex || "").length} / {2 * (tempBlockConfig.byte_len || 1)} chars
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Repeat Strategy */}
                        {(selectedBlock.op_code === 'ARRAY_GROUP' || selectedBlock.op_code === 'STRUCT') && (
                            <div className="p-3 border border-dashed border-nier-light/50 space-y-3">
                                <div className="text-[9px] opacity-100 font-bold text-nier-light">重复策略 (REPEAT)</div>
                                <select
                                    value={tempBlockConfig.repeat_type || 'NONE'}
                                    onChange={e => handleTempUpdate({ repeat_type: e.target.value })}
                                    className="w-full bg-black border border-white/30 text-xs p-1"
                                >
                                    <option value="NONE">无重复 (Single)</option>
                                    <option value="FIXED">固定次数 (Fixed)</option>
                                    <option value="DYNAMIC">动态引用 (Dynamic Ref)</option>
                                </select>

                                {tempBlockConfig.repeat_type === 'FIXED' && (
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[9px]">次数 (COUNT)</label>
                                        <input type="number" value={tempBlockConfig.repeat_count || 1} onChange={e => handleTempUpdate({ repeat_count: parseInt(e.target.value) })} className="bg-transparent border-b border-white/30 text-xs" />
                                    </div>
                                )}
                                {tempBlockConfig.repeat_type === 'DYNAMIC' && (
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[9px]">关联字段 (REF ID)</label>
                                        <select
                                            value={tempBlockConfig.repeat_ref_id || ''}
                                            onChange={e => handleTempUpdate({ repeat_ref_id: e.target.value })}
                                            className="bg-black border border-white/30 text-xs p-1"
                                        >
                                            <option value="">-- SELECT REF --</option>
                                            {currentBlocks.filter(b => b.id !== selectedBlock.id).map(b => (
                                                <option key={b.id} value={b.id}>{b.name} ({b.sequence})</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="pt-8 border-t border-nier-light/20 flex flex-col gap-3">
                            <button
                                onClick={applyBlockChanges}
                                className="w-full bg-nier-light/20 border border-nier-light text-nier-light hover:bg-nier-light hover:text-black py-2 px-4 uppercase text-xs tracking-widest transition-colors font-bold"
                            >
                                应用配置 (APPLY)
                            </button>
                            <button
                                onClick={() => promptDeleteBlock(selectedBlock.id)}
                                className="w-full border border-red-500/50 text-red-500 hover:bg-red-500 hover:text-white py-2 px-4 uppercase text-xs tracking-widest transition-colors"
                            >
                                删除 (DELETE)
                            </button>
                        </div>
                    </div>
                )}
            </aside>
        </div>
    );
}
