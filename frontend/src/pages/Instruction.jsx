import React, { useState, useEffect, useCallback } from 'react';
import Canvas from '../components/Canvas';
import { v4 as uuidv4 } from 'uuid';
import { api } from '../api';

export default function Instruction({ onWebUpdate }) {
    // Local state for the list (mirroring DB)
    const [instructions, setInstructions] = useState([]);
    const [activeInstructionId, setActiveInstructionId] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [statusMsg, setStatusMsg] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    // Load Initial Data
    useEffect(() => {
        loadInstructions();
    }, []);

    const loadInstructions = async (search = '') => {
        setIsLoading(true);
        try {
            const data = await api.getInstructions(search);
            setInstructions(data);
            if (data.length > 0 && !activeInstructionId) {
                setActiveInstructionId(data[0].id);
            }
            // Propagate up to App.jsx if needed
            if (onWebUpdate) onWebUpdate(data);
        } catch (err) {
            console.error("Failed to load instructions", err);
            setStatusMsg('OFFLINE MODE / DB ERROR');
        } finally {
            setIsLoading(false);
        }
    };

    // Derived State
    const currentInstruction = instructions.find(i => i.id === activeInstructionId);
    // Be careful: if currentInstruction is from the LIST, it might not have the full tree (fields) depending on API.
    // But our LIST API currently returns everything (simple).
    // If we implemented 'get_instruction_detail' for lazy loading, we would fetch here.
    // For V4.0, let's assume the list is lightweight or we fetch specific. 
    // Actually, our API returns the list of objects.

    // However, we need to handle the "Tree" structure.
    // The API returns `fields` (roots). The frontend `Canvas` expects a list.
    // We need to flatten the tree for the Canvas? Or did we update Canvas?
    // Instruction Blocks are usually flat in V3.0 (Kernel).
    // But V4.0 Model supports Tree.
    // For V4.0, if `Canvas` only supports flat list, we should FLATTEN the tree for display?
    // OR, we stick to flat list for Instructions for now as the user requirements
    // mentioned "Instruction Tree Building" in the prompt text ("Recursively query... for this instruction").

    // Let's ensure currentBlocks maps to `fields` in the response.
    const currentBlocks = currentInstruction?.fields || [];

    const [selectedId, setSelectedId] = useState(null);
    const selectedBlock = currentBlocks.find(b => b.id === selectedId);

    // CRUD for Instructions
    const handleAddInstruction = async () => {
        const newInstPayload = {
            name: '新指令 (New Config)',
            code: `CMD-${Math.floor(Math.random() * 1000)}`, // Temp Random Code
            opcode_hex: '00',
            type: 'STATIC',
            fields: []
        };
        try {
            const created = await api.createInstruction(newInstPayload);
            setInstructions([...instructions, created]);
            setActiveInstructionId(created.id);
            if (onWebUpdate) onWebUpdate([...instructions, created]);
        } catch (e) {
            console.error(e);
        }
    };

    const handleDeleteInstruction = async (e, id) => {
        e.stopPropagation();
        if (!confirm("Confirm Deletion?")) return;

        try {
            await api.deleteInstruction(id);
            const remaining = instructions.filter(i => i.id !== id);
            setInstructions(remaining);
            if (activeInstructionId === id) setActiveInstructionId(remaining[0]?.id || null);
            if (onWebUpdate) onWebUpdate(remaining);
        } catch (e) {
            console.error(e);
        }
    };

    // Block Handlers (Local Update -> Trigger API Save?)
    // Debouncing save would be ideal.

    const saveCurrentInstruction = async (updatedInst) => {
        // Optimistic UI Update
        const newInstructions = instructions.map(i => i.id === updatedInst.id ? updatedInst : i);
        setInstructions(newInstructions);

        try {
            setStatusMsg('SAVING...');
            await api.updateInstruction(updatedInst.id, updatedInst);
            setStatusMsg('SAVED');
            if (onWebUpdate) onWebUpdate(newInstructions); // Update Global context
            setTimeout(() => setStatusMsg(''), 1000);
        } catch (e) {
            setStatusMsg('SAVE FAILED');
        }
    }

    const handleAddBlock = (type) => {
        if (!currentInstruction) return;

        const newBlock = {
            id: uuidv4(),
            // When adding to root, parent_id is null
            parent_id: null,
            sequence: currentBlocks.length,
            op_code: 'HEX_RAW', // Default
            name: type === 'fixed' ? '新固定块' : type.toUpperCase(),
            byte_len: 1, // V4 Schema
            config_values: {},
            children: [],
            bit_fields: []
        };

        // Add specific config based on UI button
        if (type === 'fixed') {
            newBlock.config_values = { hex: "00" };
        } else if (type === 'checksum') {
            newBlock.op_code = 'CHECKSUM';
        }

        const updatedInst = {
            ...currentInstruction,
            fields: [...currentBlocks, newBlock]
        };
        saveCurrentInstruction(updatedInst);
    };

    const handleDeleteBlock = (id) => {
        if (!confirm('确定删除该模块吗? (Delete Block?)')) return;
        const newBlocks = currentBlocks.filter(b => b.id !== id);
        const updatedInst = { ...currentInstruction, fields: newBlocks };
        saveCurrentInstruction(updatedInst);
        if (selectedId === id) setSelectedId(null);
    };

    const handleUpdateBlock = (id, updates) => {
        const newBlocks = currentBlocks.map(b => b.id === id ? { ...b, ...updates } : b);
        const updatedInst = { ...currentInstruction, fields: newBlocks };
        saveCurrentInstruction(updatedInst);
    };

    return (
        <div className="flex-1 flex overflow-hidden relative">
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
                        placeholder="SEARCH..." // Nier style
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && loadInstructions(searchTerm)}
                        className="bg-black/20 border border-nier-light/30 text-[10px] p-1 text-nier-light outline-none focus:border-nier-light font-mono placeholder:text-nier-light/30"
                    />
                </div>
                <div className="flex-1 overflow-y-auto">
                    {instructions.map(inst => (
                        <div
                            key={inst.id}
                            onClick={() => setActiveInstructionId(inst.id)}
                            className={`p-3 border-b border-nier-light/10 cursor-pointer hover:bg-white/5 flex justify-between group ${inst.id === activeInstructionId ? 'bg-nier-light/10 text-white font-bold' : 'text-nier-light/70'}`}
                        >
                            <div className="truncate text-xs">{inst.name || inst.label}</div>
                            <button onClick={(e) => handleDeleteInstruction(e, inst.id)} className="opacity-0 group-hover:opacity-100 hover:text-red-400">×</button>
                        </div>
                    ))}
                    {instructions.length === 0 && !isLoading && (
                        <div className="p-4 text-xs opacity-30 text-center">No Data</div>
                    )}
                </div>
            </aside>

            {/* Palette Sidebar */}
            <aside className="w-16 border-r border-nier-light flex flex-col items-center py-4 gap-4 z-10 bg-nier-dark select-none">
                <button onClick={() => handleAddBlock('fixed')} className="w-10 h-10 border border-nier-light flex flex-col items-center justify-center text-xs hover:bg-nier-light hover:text-nier-dark active:bg-white active:text-black cursor-pointer leading-3" title="Static Hex">HEX<span className="scale-[0.6]">RAW</span></button>
                <button onClick={() => handleAddBlock('u8')} className="w-10 h-10 border border-nier-light flex flex-col items-center justify-center text-xs hover:bg-nier-light hover:text-nier-dark active:bg-white active:text-black cursor-pointer leading-3" title="UInt">NUM<span className="scale-[0.6]">UINT</span></button>
                <button onClick={() => handleAddBlock('checksum')} className="w-10 h-10 border border-nier-light flex flex-col items-center justify-center text-xs hover:bg-nier-light hover:text-nier-dark active:bg-white active:text-black cursor-pointer leading-3" title="Checksum">校验<span className="scale-[0.6]">CRC</span></button>
            </aside>

            {/* Canvas Area */}
            <section className="flex-1 relative bg-[url('/grid.png')] bg-repeat opacity-90 overflow-hidden flex flex-col">
                <div className="h-10 border-b border-nier-light bg-nier-dark/90 flex items-center px-4 gap-2 text-xs font-mono opacity-50">
                    <span>KERNEL EDITOR // {currentInstruction?.name || currentInstruction?.label || 'NULL'} [{currentInstruction?.id}]</span>
                </div>

                <Canvas
                    items={currentBlocks}
                    setItems={(newItems) => {
                        // Re-ordering logic via Drag and Drop
                        // Canvas returns the re-ordered array.
                        // We update the sequence based on index?
                        // API expects the whole list.
                        const sequenced = newItems.map((item, idx) => ({ ...item, sequence: idx }));
                        const updatedInst = { ...currentInstruction, fields: sequenced };
                        saveCurrentInstruction(updatedInst);
                    }}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                />
            </section>

            {/* Right Panel (Details) */}
            <aside className="w-80 border-l border-nier-light bg-nier-dark/95 backdrop-blur-sm p-4 flex flex-col z-20 shadow-[-5px_0_15px_rgba(0,0,0,0.5)] overflow-y-auto">
                <h2 className="text-lg border-b-2 border-nier-light mb-6 pb-1 font-bold tracking-wider">属性配置 (PROPERTIES)</h2>

                {currentInstruction && !selectedId && (
                    /* Instruction Level Properties */
                    <div className="space-y-6 text-sm">
                        <div className="flex flex-col gap-1">
                            <label className="text-xs opacity-70 uppercase tracking-widest">指令名称 (Name)</label>
                            <input
                                type="text"
                                value={currentInstruction.name || currentInstruction.label}
                                onChange={(e) => {
                                    const updatedInst = { ...currentInstruction, name: e.target.value };
                                    saveCurrentInstruction(updatedInst);
                                }}
                                onBlur={() => { }} // Could enforce save on blur
                                className="bg-transparent border-b border-nier-light/50 focus:border-nier-light focus:outline-none py-1 font-mono tracking-wide"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-xs opacity-70 uppercase tracking-widest">类型 (Type)</label>
                            <select
                                value={currentInstruction.type}
                                onChange={(e) => {
                                    const updatedInst = { ...currentInstruction, type: e.target.value };
                                    saveCurrentInstruction(updatedInst);
                                }}
                                className="bg-nier-dark border border-nier-light/50 p-1 text-xs font-mono focus:border-nier-light focus:outline-none"
                            >
                                <option value="STATIC">静态 (Static)</option>
                                <option value="DYNAMIC">动态 (Dynamic)</option>
                            </select>
                        </div>
                    </div>
                )}

                {selectedBlock && (
                    <div className="space-y-6 text-sm animate-in fade-in slide-in-from-right-4 duration-300">
                        <div className="flex flex-col gap-1">
                            <label className="text-xs opacity-70 uppercase tracking-widest">ID</label>
                            <span className="font-mono text-xs opacity-50 truncate select-all">{selectedBlock.id}</span>
                        </div>

                        <div className="flex flex-col gap-1">
                            <label className="text-xs opacity-70 uppercase tracking-widest">字段标签 (Label)</label>
                            <input
                                type="text"
                                value={selectedBlock.name || selectedBlock.label}
                                onChange={(e) => handleUpdateBlock(selectedBlock.id, { name: e.target.value })}
                                className="bg-transparent border-b border-nier-light/50 focus:border-nier-light focus:outline-none py-1 font-mono tracking-wide"
                            />
                        </div>

                        <div className="flex flex-col gap-1">
                            <label className="text-xs opacity-70 uppercase tracking-widest">算子 (Operator)</label>
                            <select
                                value={selectedBlock.op_code || 'HEX_RAW'}
                                onChange={(e) => handleUpdateBlock(selectedBlock.id, { op_code: e.target.value })}
                                className="bg-nier-dark border border-nier-light/50 p-1 text-xs font-mono focus:border-nier-light focus:outline-none"
                            >
                                <option value="HEX_RAW">HEX_RAW (原生十六进制)</option>
                                <option value="UINT">UINT (无符号整数)</option>
                                <option value="INT">INT (有符号整数)</option>
                                <option value="FLOAT">FLOAT (浮点数)</option>
                                <option value="SCALED_DECIMAL">SCALED_DECIMAL (比例因子)</option>
                                <option value="CHECKSUM">CHECKSUM (校验和)</option>
                                <option value="BITFIELD">BITFIELD (位域组)</option>
                            </select>
                        </div>

                        <div className="flex flex-col gap-1">
                            <label className="text-xs opacity-70 uppercase tracking-widest">字节长度 (Length)</label>
                            <input
                                type="number"
                                min="1"
                                value={selectedBlock.byte_len || selectedBlock.byte_length}
                                onChange={(e) => handleUpdateBlock(selectedBlock.id, { byte_len: parseInt(e.target.value) || 1 })}
                                className="bg-transparent border-b border-nier-light/50 focus:border-nier-light focus:outline-none py-1 font-mono"
                            />
                        </div>

                        {/* Operator Config */}
                        {selectedBlock.op_code === 'SCALED_DECIMAL' && (
                            <div className="p-3 border border-nier-light/30 bg-nier-light/5 space-y-4">
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs opacity-70 uppercase">Factor</label>
                                    <input
                                        type="number" step="0.01"
                                        value={selectedBlock.config_values?.factor || 1.0}
                                        onChange={(e) => handleUpdateBlock(selectedBlock.id, { config_values: { ...selectedBlock.config_values, factor: parseFloat(e.target.value) } })}
                                        className="bg-transparent border-b border-nier-light/50"
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs opacity-70 uppercase">Offset</label>
                                    <input
                                        type="number"
                                        value={selectedBlock.config_values?.offset || 0}
                                        onChange={(e) => handleUpdateBlock(selectedBlock.id, { config_values: { ...selectedBlock.config_values, offset: parseFloat(e.target.value) } })}
                                        className="bg-transparent border-b border-nier-light/50"
                                    />
                                </div>
                            </div>
                        )}

                        <div className="pt-8 border-t border-nier-light/20">
                            <button
                                onClick={() => handleDeleteBlock(selectedBlock.id)}
                                className="w-full border border-red-500/50 text-red-400 hover:bg-red-500 hover:text-white py-2 px-4 uppercase text-xs tracking-widest transition-colors"
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

