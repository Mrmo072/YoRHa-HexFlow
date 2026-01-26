import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import Canvas from '../components/Canvas';

export default function Orchestration({ protocols, instructions }) {
    // State for Bindings (Mappings)
    const [bindings, setBindings] = useState([]);
    const [activeBindingId, setActiveBindingId] = useState(null);

    // Initial Binding
    useEffect(() => {
        if (bindings.length === 0) {
            const initial = {
                id: uuidv4(),
                label: '默认绑定 (DEFAULT)',
                protocolId: protocols[0]?.id,
                instructionId: instructions[0]?.id
            };
            setBindings([initial]);
            setActiveBindingId(initial.id);
        }
    }, []);

    const currentBinding = bindings.find(b => b.id === activeBindingId) || bindings[0];

    // CRUD Handlers
    const handleAddBinding = () => {
        const newBinding = {
            id: uuidv4(),
            label: '新绑定 (NEW)',
            protocolId: protocols[0]?.id,
            instructionId: instructions[0]?.id
        };
        setBindings([...bindings, newBinding]);
        setActiveBindingId(newBinding.id);
    };

    const handleDeleteBinding = (e, id) => {
        e.stopPropagation();
        if (bindings.length <= 1) return;
        const remaining = bindings.filter(b => b.id !== id);
        setBindings(remaining);
        if (activeBindingId === id) setActiveBindingId(remaining[0].id);
    };

    const handleUpdateBinding = (id, updates) => {
        setBindings(bindings.map(b => b.id === id ? { ...b, ...updates } : b));
    };

    // MERGE LOGIC: Combine Protocol + Instruction
    const getMergedBlocks = () => {
        if (!currentBinding) return [];

        const protocol = protocols.find(p => p.id === currentBinding.protocolId);
        const instruction = instructions.find(i => i.id === currentBinding.instructionId);

        if (!protocol) return [];

        // Deep Clone to avoid mutating original AND Prefix IDs to avoid collisions
        const cloneBlocks = (blocks, prefix) => {
            return blocks.map(b => {
                const newBlock = { ...b, id: `${prefix}-${b.id}` };
                if (newBlock.children) {
                    newBlock.children = cloneBlocks(newBlock.children, prefix);
                }
                return newBlock;
            });
        };

        const mergedRoot = { ...protocol };
        if (mergedRoot.children) {
            mergedRoot.children = cloneBlocks(mergedRoot.children, 'p');
        }

        // Logic: Find the FIRST 'slot' block (or container?) and inject instruction blocks
        // If no slot, maybe append? OR user must define a SLOT in Protocol.
        // For V3.1, let's assume we look for type === 'slot'. 
        // If no slot found, we append to the end of the root container (fallback).

        if (instruction) {
            const instructionBlocks = cloneBlocks(instruction.blocks, 'i');

            const injectIntoSlot = (nodes) => {
                for (let i = 0; i < nodes.length; i++) {
                    if (nodes[i].type === 'slot') {
                        // FOUND SLOT: Replace with instruction blocks
                        // Mark them as "Injected" for styling if needed
                        const injected = instructionBlocks.map(ib => ({ ...ib, isInjected: true }));
                        nodes.splice(i, 1, ...injected);
                        return true; // Stop after first slot filled
                    }
                    if (nodes[i].children) {
                        if (injectIntoSlot(nodes[i].children)) return true;
                    }
                }
                return false;
            };

            const injected = injectIntoSlot(mergedRoot.children || []);

            if (!injected && mergedRoot.children) {
                // Fallback: Append if no slot
                const injected = instructionBlocks.map(ib => ({ ...ib, isInjected: true }));
                mergedRoot.children.push(...injected);
            }
        }

        return mergedRoot.children || [];
    };

    const mergedBlocks = getMergedBlocks();

    // Flatten for simple display (optional, but our Canvas supports recursive now)
    // But for a linear "Hex View" we might need a flat list.
    // Let's stick to the Canvas view for now.

    const getTotalBytes = (blocks) => {
        let total = 0;
        blocks.forEach(b => {
            if (b.children) total += getTotalBytes(b.children);
            else total += (b.byte_length || 0);
        });
        return total;
    };
    const totalBytes = getTotalBytes(mergedBlocks);

    return (
        <div className="flex-1 flex overflow-hidden">
            {/* Binding List Sidebar */}
            <aside className="w-48 border-r border-nier-light/30 bg-nier-dark/50 flex flex-col">
                <div className="p-4 border-b border-nier-light/30 flex justify-between items-center">
                    <span className="text-xs font-bold tracking-widest">绑定列表 (Bindings)</span>
                    <button onClick={handleAddBinding} className="hover:text-white text-lg leading-none">+</button>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {bindings.map(b => (
                        <div
                            key={b.id}
                            onClick={() => setActiveBindingId(b.id)}
                            className={`p-3 border-b border-nier-light/10 cursor-pointer hover:bg-white/5 flex justify-between group ${b.id === activeBindingId ? 'bg-nier-light/10 text-white font-bold' : 'text-nier-light/70'}`}
                        >
                            <div className="truncate text-xs">{b.label}</div>
                            <button onClick={(e) => handleDeleteBinding(e, b.id)} className="opacity-0 group-hover:opacity-100 hover:text-red-400">×</button>
                        </div>
                    ))}
                </div>
            </aside>

            {/* Main Area */}
            <section className="flex-1 flex flex-col bg-[url('/grid.png')] relative">
                {/* Configuration Header */}
                <div className="h-16 border-b border-nier-light/50 bg-nier-dark/90 flex items-center px-6 gap-8 z-20">
                    {currentBinding && (
                        <>
                            <div className="flex flex-col gap-1 w-64">
                                <label className="text-[10px] opacity-70 uppercase tracking-widest">协议外壳 (Protocol Shell)</label>
                                <select
                                    value={currentBinding.protocolId}
                                    onChange={(e) => handleUpdateBinding(currentBinding.id, { protocolId: e.target.value })}
                                    className="bg-transparent border-b border-nier-light/50 text-sm focus:outline-none focus:border-nier-light py-1 font-mono"
                                >
                                    {protocols.map(p => <option key={p.id} value={p.id} className="bg-nier-dark text-white">{p.label}</option>)}
                                </select>
                            </div>

                            <div className="text-xl opacity-50 font-thin">+</div>

                            <div className="flex flex-col gap-1 w-64">
                                <label className="text-[10px] opacity-70 uppercase tracking-widest">指令内核 (Instruction Kernel)</label>
                                <select
                                    value={currentBinding.instructionId}
                                    onChange={(e) => handleUpdateBinding(currentBinding.id, { instructionId: e.target.value })}
                                    className="bg-transparent border-b border-nier-light/50 text-sm focus:outline-none focus:border-nier-light py-1 font-mono"
                                >
                                    {instructions.map(i => <option key={i.id} value={i.id} className="bg-nier-dark text-white">{i.label}</option>)}
                                </select>
                            </div>

                            <div className="ml-auto flex flex-col items-end">
                                <label className="text-[10px] opacity-70 uppercase tracking-widest">总长度 (Total Size)</label>
                                <div className="text-xl font-bold font-mono">{totalBytes} <span className="text-sm font-normal opacity-50">Bytes</span></div>
                            </div>
                        </>
                    )}
                </div>

                {/* Visual Preview */}
                <div className="flex-1 overflow-hidden relative flex flex-col">
                    <div className="absolute top-4 left-6 text-xs font-mono opacity-50 tracking-widest">
                        ASSEMBLY PREVIEW //
                        {protocols.find(p => p.id === currentBinding?.protocolId)?.label} ::
                        {instructions.find(i => i.id === currentBinding?.instructionId)?.label}
                    </div>

                    <Canvas
                        items={mergedBlocks}
                        setItems={() => { }} // Read-only
                        selectedId={null}
                        onSelect={() => { }}
                        readOnly={true}
                    />
                </div>

                {/* Footer / Hex Dump Preview */}
                <div className="h-32 border-t border-nier-light/50 bg-nier-dark/95 p-4 font-mono text-xs overflow-y-auto">
                    <div className="opacity-50 mb-2 tracking-widest uppercase">Hex Stream Simulation</div>
                    <div className="break-all leading-relaxed opacity-80">
                        {/* Mock Hex Stream based on structure */}
                        {mergedBlocks.map((b, i) => (
                            <span key={i} className={`mr-2 ${b.isInjected ? 'text-yellow-400 font-bold' : ''}`}>
                                {b.children ? `[${b.label}]` : (b.hex_value || '00'.repeat(b.byte_length)).toUpperCase()}
                            </span>
                        ))}
                    </div>
                    <div className="mt-2 text-[10px] text-yellow-400 opacity-70">* Yellow indicates injected Payload</div>
                </div>
            </section>

            {/* Right Panel (Details - Binding Info) */}
            <aside className="w-80 border-l border-nier-light bg-nier-dark/95 backdrop-blur-sm p-4 flex flex-col z-20 shadow-[-5px_0_15px_rgba(0,0,0,0.1)]">
                <h2 className="text-lg border-b-2 border-nier-light mb-6 pb-1 font-bold tracking-wider">绑定属性 (BINDING)</h2>
                {currentBinding && (
                    <div className="space-y-6 text-sm">
                        <div className="flex flex-col gap-1">
                            <label className="text-xs opacity-70 uppercase tracking-widest">绑定名称 (Label)</label>
                            <input
                                type="text"
                                value={currentBinding.label}
                                onChange={(e) => handleUpdateBinding(currentBinding.id, { label: e.target.value })}
                                className="bg-transparent border-b border-nier-light/50 focus:border-nier-light focus:outline-none py-1 font-mono tracking-wide"
                            />
                        </div>

                        <div className="p-4 border border-dashed border-nier-light/30 bg-nier-light/5 text-xs leading-5">
                            <h3 className="font-bold mb-2">AUTO-ASSEMBLY RULE</h3>
                            <p className="opacity-70">
                                The system looks for a 'SLOT' block in the Protocol.
                                It replaces the Slot with the entire Instruction block list.
                            </p>
                            <p className="mt-2 opacity-70">
                                If no Slot is found, instructions are appended to the end.
                            </p>
                        </div>
                    </div>
                )}
            </aside>
        </div>
    );
}
