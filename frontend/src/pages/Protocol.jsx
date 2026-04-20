import React, { useMemo, useState } from 'react';
import Canvas from '../components/Canvas';
import { v4 as uuidv4 } from 'uuid';
import { api } from '../api';

// Mock Initial Data (Recursive)


export default function Protocol({ protocols, setProtocols }) {
    // Protocol List State - LIFTED to App.jsx
    const [activeProtocolId, setActiveProtocolId] = useState(protocols[0]?.id || null);
    const [statusMsg, setStatusMsg] = useState('');
    const saveTimerRef = React.useRef(null);
    const lastSavedSignatureRef = React.useRef('');

    // Update active ID if current is deleted/missing
    React.useEffect(() => {
        if (!activeProtocolId && protocols.length > 0) {
            setActiveProtocolId(protocols[0].id);
        } else if (!protocols.find(p => p.id === activeProtocolId) && protocols.length > 0) {
            setActiveProtocolId(protocols[0].id);
        }
    }, [protocols, activeProtocolId]);

    React.useEffect(() => {
        return () => {
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
            }
        };
    }, []);

    // Derived State
    const currentProtocol = protocols.find(p => p.id === activeProtocolId) || protocols[0];

    React.useEffect(() => {
        if (!currentProtocol) {
            lastSavedSignatureRef.current = '';
            return;
        }

        lastSavedSignatureRef.current = JSON.stringify({
            label: currentProtocol.label,
            type: currentProtocol.type,
            description: currentProtocol.description || null,
            children: currentProtocol.children || []
        });
    }, [currentProtocol]);

    // Navigation Path (Stack of Block IDs)
    const [path, setPath] = useState(currentProtocol ? [currentProtocol] : []);

    // reset path when protocol changes
    React.useEffect(() => {
        setPath(currentProtocol ? [currentProtocol] : []);
    }, [activeProtocolId, currentProtocol]);

    // Find current container in the LATEST currentProtocol tree to ensure we edit fresh state
    // (The path state might hold stale references, we need to find the equivalent node in currentProtocol)

    // Helper to find node by ID in a tree
    const findNode = (root, id) => {
        if (root.id === id) return root;
        if (!root.children) return null;
        for (const child of root.children) {
            const found = findNode(child, id);
            if (found) return found;
        }
        return null;
    };

    const activePathNode = path[path.length - 1];
    const activeContainerNode = currentProtocol && activePathNode ? (findNode(currentProtocol, activePathNode.id) || currentProtocol) : currentProtocol;
    const currentBlocks = activeContainerNode?.children || [];
    const currentLanes = useMemo(() => [{
        depth: 0,
        parentId: null,
        parentName: activeContainerNode?.label || 'ROOT SEQUENCE',
        items: currentBlocks
    }], [activeContainerNode, currentBlocks]);

    const [selectedId, setSelectedId] = useState(null);

    // CRUD Handlers for Protocols
    const saveProtocol = React.useCallback(async (nextProtocol) => {
        const nextSignature = JSON.stringify({
            label: nextProtocol.label,
            type: nextProtocol.type,
            description: nextProtocol.description || null,
            children: nextProtocol.children || []
        });

        if (lastSavedSignatureRef.current === nextSignature) {
            return nextProtocol;
        }

        try {
            setStatusMsg('保存中...');
            const saved = await api.updateProtocol(nextProtocol.id, {
                label: nextProtocol.label,
                type: nextProtocol.type,
                description: nextProtocol.description || null,
                children: nextProtocol.children || []
            });
            lastSavedSignatureRef.current = nextSignature;
            setProtocols(prev => prev.map(protocol => protocol.id === saved.id ? saved : protocol));
            setStatusMsg('协议已保存');
            setTimeout(() => setStatusMsg(''), 1200);
            return saved;
        } catch (error) {
            console.error('Failed to save protocol', error);
            setStatusMsg('协议保存失败');
            throw error;
        }
    }, [setProtocols]);

    const scheduleProtocolSave = React.useCallback((nextProtocol) => {
        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
        }

        setStatusMsg('待保存...');
        saveTimerRef.current = setTimeout(() => {
            saveProtocol(nextProtocol);
        }, 350);
    }, [saveProtocol]);

    const handleAddProtocol = async () => {
        const newProto = {
            id: uuidv4(),
            label: '新协议 (NEW)',
            type: 'container',
            children: []
        };
        try {
            setStatusMsg('创建协议...');
            const created = await api.createProtocol(newProto);
            setProtocols(prev => [...prev, created]);
            setActiveProtocolId(created.id);
            setStatusMsg('协议已创建');
            setTimeout(() => setStatusMsg(''), 1200);
        } catch (error) {
            console.error('Failed to create protocol', error);
            setStatusMsg('协议创建失败');
        }
    };

    const handleDeleteProtocol = async (e, id) => {
        e.stopPropagation();
        if (protocols.length <= 1) return;
        try {
            setStatusMsg('删除协议...');
            await api.deleteProtocol(id);
            const remaining = protocols.filter(p => p.id !== id);
            setProtocols(remaining);
            if (activeProtocolId === id) setActiveProtocolId(remaining[0].id);
            setStatusMsg('协议已删除');
            setTimeout(() => setStatusMsg(''), 1200);
        } catch (error) {
            console.error('Failed to delete protocol', error);
            setStatusMsg('协议删除失败');
        }
    };

    // Helper: Update the tree immutably
    const updateTree = (newChildren) => {
        // Create a deep copy of current protocol to modify
        // For simplicity in this demo, we clone the logic
        const updateRecursive = (node) => {
            if (node.id === activeContainerNode.id) {
                return { ...node, children: newChildren };
            }
            if (!node.children) return node;
            return {
                ...node,
                children: node.children.map(updateRecursive)
            };
        };

        const newRoot = updateRecursive(currentProtocol);

        // Update protocol list
        setProtocols(prev => prev.map(p => p.id === activeProtocolId ? newRoot : p));
        scheduleProtocolSave(newRoot);

        // Path does not need update because we look up activeContainerNode dynamically
    };

    // Handlers
    const handleSetBlocks = (newBlocks) => {
        updateTree(newBlocks);
    };

    const handleAddBlock = (type) => {
        const newBlock = {
            id: uuidv4(),
            label: type === 'container' ? '新容器' : (type === 'fixed' ? '固定块' : type.toUpperCase()),
            type: type,
            byte_length: type === 'container' ? 0 : 1,
            hex_value: '00',
            children: type === 'container' ? [] : undefined,
            config: {}
        };
        handleSetBlocks([...currentBlocks, newBlock]);
    };

    const handleDeleteBlock = (id) => {
        const newBlocks = currentBlocks.filter(b => b.id !== id);
        handleSetBlocks(newBlocks);
        if (selectedId === id) setSelectedId(null);
    };

    const handleUpdateBlock = (id, updates) => {
        const newBlocks = currentBlocks.map(b => b.id === id ? { ...b, ...updates } : b);
        handleSetBlocks(newBlocks);
    };

    // Navigation Logic
    const handleEnterContainer = (block) => {
        if (block.type === 'container') {
            // Push ID to path, we resolve node dynamically
            setPath([...path, block]);
            setSelectedId(null);
        }
    };

    const handleBreadcrumbClick = (index) => {
        const newPath = path.slice(0, index + 1);
        setPath(newPath);
        setSelectedId(null);
    };

    const selectedBlock = currentBlocks.find(b => b.id === selectedId);

    if (!currentProtocol) {
        return (
            <div className="flex-1 flex items-center justify-center text-nier-light/40 font-mono tracking-widest">
                LOADING PROTOCOLS...
            </div>
        );
    }

    return (
        <div className="flex-1 flex overflow-hidden">
            {statusMsg && (
                <div className="absolute top-2 right-2 z-50 text-[10px] font-mono bg-nier-dark border border-nier-light px-2 text-nier-light animate-pulse">
                    SYS: {statusMsg}
                </div>
            )}
            {/* Protocols List Sidebar */}
            <aside className="w-48 border-r border-nier-light/30 bg-nier-dark/50 flex flex-col">
                <div className="p-4 border-b border-nier-light/30 flex justify-between items-center">
                    <span className="text-xs font-bold tracking-widest">协议列表</span>
                    <button onClick={handleAddProtocol} className="hover:text-white text-lg leading-none">+</button>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {protocols.map(p => (
                        <div
                            key={p.id}
                            onClick={() => setActiveProtocolId(p.id)}
                            className={`p-3 border-b border-nier-light/10 cursor-pointer hover:bg-white/5 flex justify-between group ${p.id === activeProtocolId ? 'bg-nier-light/10 text-white font-bold' : 'text-nier-light/70'}`}
                        >
                            <div className="truncate text-xs">{p.label}</div>
                            <button onClick={(e) => handleDeleteProtocol(e, p.id)} className="opacity-0 group-hover:opacity-100 hover:text-red-400">×</button>
                        </div>
                    ))}
                </div>
            </aside>

            {/* Palette Sidebar */}
            <aside className="w-14 border-r border-nier-light flex flex-col items-center py-4 gap-4 z-10 bg-nier-dark select-none">
                <button onClick={() => handleAddBlock('container')} className="w-10 h-10 border border-nier-light flex flex-col items-center justify-center text-xs hover:bg-nier-light hover:text-nier-dark active:bg-white active:text-black cursor-pointer leading-3" title="新建容器">PKG<span className="scale-[0.6]">PKG</span></button>
                <div className="w-8 h-[1px] bg-nier-light/30 my-2"></div>
                <button onClick={() => handleAddBlock('fixed')} className="w-10 h-10 border border-nier-light flex flex-col items-center justify-center text-xs hover:bg-nier-light hover:text-nier-dark active:bg-white active:text-black cursor-pointer leading-3" title="添加固定块 (Fixed)">固定<span className="scale-[0.6]">FIX</span></button>
                <button onClick={() => handleAddBlock('length')} className="w-10 h-10 border border-nier-light flex flex-col items-center justify-center text-xs hover:bg-nier-light hover:text-nier-dark active:bg-white active:text-black cursor-pointer leading-3" title="添加长度 (Length)">长度<span className="scale-[0.6]">LEN</span></button>
                <button onClick={() => handleAddBlock('checksum')} className="w-10 h-10 border border-nier-light flex flex-col items-center justify-center text-xs hover:bg-nier-light hover:text-nier-dark active:bg-white active:text-black cursor-pointer leading-3" title="添加校验 (Checksum)">校验<span className="scale-[0.6]">CRC</span></button>
                <button onClick={() => handleAddBlock('slot')} className="w-10 h-10 border-dashed border border-nier-light flex flex-col items-center justify-center text-xs hover:bg-nier-light hover:text-nier-dark active:bg-white active:text-black cursor-pointer leading-3" title="添加插槽 (Slot)">插槽<span className="scale-[0.6]">SLOT</span></button>
            </aside>

            {/* Canvas Area */}
            <section className="flex-1 relative bg-[url('/grid.png')] bg-repeat opacity-90 overflow-hidden flex flex-col">
                {/* Breadcrumbs */}
                <div className="h-10 border-b border-nier-light bg-nier-dark/90 flex items-center px-4 gap-2 text-xs font-mono">
                    {path.map((node, index) => (
                        <React.Fragment key={node.id}>
                            <button
                                onClick={() => handleBreadcrumbClick(index)}
                                className={`hover:underline ${index === path.length - 1 ? 'font-bold decoration-2' : 'opacity-60'}`}
                            >
                                {findNode(currentProtocol, node.id)?.label || node.label}
                            </button>
                            {index < path.length - 1 && <span className="opacity-30">/</span>}
                        </React.Fragment>
                    ))}
                </div>

                <Canvas
                    lanes={currentLanes}
                    onMoveItem={(itemId, _newParentId, newIndex) => {
                        const reordered = [...currentBlocks];
                        const oldIndex = reordered.findIndex(block => block.id === itemId);
                        if (oldIndex === -1 || oldIndex === newIndex) return;
                        const [moved] = reordered.splice(oldIndex, 1);
                        reordered.splice(newIndex, 0, moved);
                        handleSetBlocks(reordered);
                    }}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    focusedParentId={null}
                    onSetFocusedLane={() => { }}
                />
            </section>

            {/* Right Panel (Details) */}
            <aside className="w-80 border-l border-nier-light bg-nier-dark/95 backdrop-blur-sm p-4 flex flex-col z-20 shadow-[-5px_0_15px_rgba(0,0,0,0.1)]">
                <h2 className="text-lg border-b-2 border-nier-light mb-6 pb-1 font-bold tracking-wider">属性配置 (PROPERTIES)</h2>

                {activeProtocolId && currentProtocol && !selectedId && (
                    /* Protocol Level Properties */
                    <div className="space-y-6 text-sm">
                        <div className="flex flex-col gap-1">
                            <label className="text-xs opacity-70 uppercase tracking-widest">协议名称 (Protocol Name)</label>
                            <input
                                type="text"
                                value={currentProtocol.label}
                                onChange={(e) => {
                                    const updatedProto = { ...currentProtocol, label: e.target.value };
                                    setProtocols(prev => prev.map(p => p.id === activeProtocolId ? updatedProto : p));
                                    scheduleProtocolSave(updatedProto);
                                }}
                                className="bg-transparent border-b border-nier-light/50 focus:border-nier-light focus:outline-none py-1 font-mono tracking-wide"
                            />
                        </div>
                    </div>
                )}

                {selectedBlock ? (
                    <div className="space-y-6 text-sm animate-in fade-in slide-in-from-right-4 duration-300">
                        {/* Common Properties */}
                        <div className="flex flex-col gap-1">
                            <label className="text-xs opacity-70 uppercase tracking-widest">标签 (Label)</label>
                            <input
                                type="text"
                                value={selectedBlock.label}
                                onChange={(e) => handleUpdateBlock(selectedBlock.id, { label: e.target.value })}
                                className="bg-transparent border-b border-nier-light/50 focus:border-nier-light focus:outline-none py-1 font-mono tracking-wide"
                            />
                        </div>

                        {selectedBlock.type === 'container' && (
                            <button
                                onClick={() => handleEnterContainer(selectedBlock)}
                                className="mt-4 w-full border border-nier-light bg-nier-light/10 text-nier-light py-2 px-4 hover:bg-nier-light hover:text-nier-dark transition-colors font-bold tracking-widest text-xs"
                            >
                                进入容器 (ENTER) &gt;
                            </button>
                        )}

                        {(selectedBlock.type !== 'container') && (
                            <div className="flex flex-col gap-1">
                                <label className="text-xs opacity-70 uppercase tracking-widest">字节长度 (Length)</label>
                                <input
                                    type="number"
                                    min="1"
                                    value={selectedBlock.byte_length}
                                    onChange={(e) => handleUpdateBlock(selectedBlock.id, { byte_length: parseInt(e.target.value) || 1 })}
                                    className="bg-transparent border-b border-nier-light/50 focus:border-nier-light focus:outline-none py-1 font-mono"
                                />
                            </div>
                        )}

                        {/* Fix: Hex Value for Fixed Blocks */}
                        {selectedBlock.type === 'fixed' && (
                            <div className="flex flex-col gap-1">
                                <label className="text-xs opacity-70 uppercase tracking-widest">十六进制值 (Hex)</label>
                                <input
                                    type="text"
                                    value={selectedBlock.hex_value || ''}
                                    onChange={(e) => handleUpdateBlock(selectedBlock.id, { hex_value: e.target.value })}
                                    className="bg-transparent border-b border-nier-light/50 focus:border-nier-light focus:outline-none py-1 font-mono uppercase"
                                />
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
                ) : (
                    <div className="h-full flex flex-col items-center justify-center opacity-30 gap-2">
                        <p className="italic text-center">选择模块以编辑</p>
                        <p className="text-[10px] font-mono">SELECT MODULE TO CONFIGURE</p>
                    </div>
                )}
            </aside>
        </div>
    );
}
