import React, { useState, useEffect } from 'react';
import { useInstructionForm } from '../../hooks/useInstructionForm';
import { SmartInput } from './SmartInput';
import { v4 as uuidv4 } from 'uuid';

export default function InstructionRunner({ instruction, onSend }) {
    // 1. Normalize Instruction Object (Schema Mapping)
    const normalizedInstruction = React.useMemo(() => {
        if (!instruction) return null;

        const processFields = (items) => {
            // 0. Pre-process: If items is a flat list with parent_id, build the tree first.
            let rootItems = items;
            const hasParentIds = items.some(i => i.parent_id);

            if (hasParentIds) {
                const map = {};
                items.forEach(i => map[i.id] = { ...i, fields: [] }); // Create clones with empty fields
                const roots = [];
                items.forEach(i => {
                    if (i.parent_id && map[i.parent_id]) {
                        map[i.parent_id].fields.push(map[i.id]);
                    } else {
                        roots.push(map[i.id]);
                    }
                });
                rootItems = roots;
            }

            // Respect field ordering if provided (Backend uses 'sequence')
            // Note: sort needs to be recursive if we built a tree, or we sort the flat list first?
            // If we built tree above, we need to sort each level.
            const sortNodes = (nodes) => {
                nodes.sort((a, b) => (a.sequence ?? a.order ?? 0) - (b.sequence ?? b.order ?? 0));
                nodes.forEach(n => {
                    if (n.fields && n.fields.length > 0) sortNodes(n.fields);
                });
                return nodes;
            };

            const sortedItems = sortNodes(rootItems);

            const mapToSchema = (nodes) => {
                return nodes.map(f => {
                    // Recursive processing
                    const processedChildren = f.fields && f.fields.length > 0 ? mapToSchema(f.fields) : [];

                    if (f.op_code || f.parameter_config) {
                        // Inherit or process
                        const op = String(f.op_code || '').toUpperCase();
                        const type = String(f.type || f.parameter_config?.type || '').toLowerCase();
                        // ... (rest of logic mostly same, but using processedChildren)
                        // Advanced Recognition: Length/Calculated
                        const isCalculated = op === 'CALCULATED' || type === 'length' || type === 'calculated';

                        // Advanced Recognition: Inputs (anything that is NOT calculated and NOT explicitly fixed/raw)
                        const isFixed = op === 'FIXED' || op === 'HEX_RAW' || type === 'fixed' || type === 'hex_raw' || f.parameter_config?.readOnly;
                        const isInput = !isCalculated && !isFixed;

                        return {
                            id: f.id,
                            name: f.name || f.label,
                            op_code: isInput ? 'INPUT' : (isCalculated ? 'CALCULATED' : 'FIXED'),
                            parameter_config: {
                                hex: f.hex_value, // Legacy mapping support if needed, mostly in param_config now
                                ...f.parameter_config,
                                value: f.value ?? f.parameter_config?.value,
                                variable: isInput,
                                formula: type === 'length' ? 'auto' : (f.formula || f.parameter_config?.formula),
                                type: type.includes('float') || type.includes('decimal') ? 'decimal' : (type || 'number'),
                                unit: f.unit || f.parameter_config?.unit,
                                description: f.description || f.parameter_config?.description,
                                options: f.options || f.parameter_config?.options
                            },
                            byte_len: f.byte_length || f.byte_len || 1,
                            fields: processedChildren
                        };
                    }
                    return f;
                });
            };

            return mapToSchema(sortedItems);
        };

        const fields = processFields(instruction.fields || instruction.blocks || []);
        return { ...instruction, fields };
    }, [instruction]);

    const {
        inputs,
        handleInputChange,
        computedValues,
        hexPreview,
        setInputs
    } = useInstructionForm(normalizedInstruction);

    const [logs, setLogs] = useState([]);

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                handleSend();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [inputs, hexPreview]);

    const handleSend = () => {
        if (!instruction || !normalizedInstruction) return;
        const payload = hexPreview.replace(/\s/g, '');
        const entry = {
            id: uuidv4(),
            time: new Date().toLocaleTimeString(),
            name: instruction.name || instruction.label || 'Unknown',
            payload: hexPreview
        };
        setLogs(prev => [entry, ...prev].slice(0, 50)); // Keep last 50

        if (onSend) {
            onSend(payload);
        }
    };

    if (!normalizedInstruction) {
        return (
            <div className="flex-1 items-center justify-center text-nier-light/50 font-mono animate-pulse">
                // WAITING FOR SELECTION...
            </div>
        );
    }

    // Polished Header Logic
    const deviceCode = normalizedInstruction.device_code || 'GENERIC-DEV';
    const instructionCode = normalizedInstruction.code || normalizedInstruction.id;
    const instructionName = normalizedInstruction.name || normalizedInstruction.label || 'Unnamed Protocol';

    return (
        <div className="flex-1 flex flex-col h-full bg-nier-bg p-8 gap-8 overflow-hidden">
            {/* Header: Identity Selection */}
            <div className="border-b-4 border-nier-light/20 pb-6 flex justify-between items-end">
                <div>
                    <div className="text-[10px] font-black font-mono text-nier-light/40 mb-2 tracking-[0.3em] uppercase">:: Operational Protocol ::</div>
                    <h2 className="text-4xl font-black text-nier-light tracking-tighter leading-none mb-2">
                        {deviceCode} <span className="opacity-20">/</span> {instructionCode}
                    </h2>
                    <div className="text-base font-bold text-nier-light/80 font-mono flex items-center gap-3">
                        <span className="w-4 h-[2px] bg-nier-light/40"></span>
                        {instructionName}
                    </div>
                </div>
                <div className="text-right font-mono text-nier-light/50 font-bold leading-tight">
                    <div className="text-[10px] opacity-40 uppercase tracking-widest mb-1">Status: Ready</div>
                    <div className="text-xs uppercase">LEN: {hexPreview.replace(/\s/g, '').length / 2} BYTES</div>
                    <div className="text-[9px] opacity-30 mt-1 uppercase">ID: {normalizedInstruction.id}</div>
                </div>
            </div>

            {/* Main Content: Form + Preview */}
            <div className="flex-1 flex gap-8 overflow-hidden">
                {/* Left: Dynamic Form */}
                <div className="flex-[2] overflow-y-auto pr-8 custom-scrollbar">
                    <div className="mb-8 flex items-center gap-4">
                        <div className="h-[1px] flex-1 bg-nier-light/10"></div>
                        <span className="text-xs font-black font-mono text-nier-light/60 uppercase tracking-[0.4em] whitespace-nowrap">
                            Configuration / 系统配置
                        </span>
                        <div className="h-[1px] flex-1 bg-nier-light/10"></div>
                    </div>
                    <div className="space-y-1">
                        {(() => {
                            const renderFields = (fieldsToRender, depth = 0) => {
                                return fieldsToRender.map((field) => {
                                    const params = field.parameter_config || {};
                                    // RE-CHECK Editability for ANY field that isn't explicitly fixed or auto-calculated
                                    const isCalculated = field.op_code === 'CALCULATED' || params.formula === 'auto';
                                    const isFixed = field.op_code === 'FIXED' || field.op_code === 'HEX_RAW' || params.readOnly;
                                    const isEditable = !isCalculated && !isFixed;
                                    const rawOptions = params.options;
                                    const hasOptions = rawOptions && (Array.isArray(rawOptions) ? rawOptions.length > 0 : Object.keys(rawOptions).length > 0);
                                    const isEnum = hasOptions || field.op_code === 'MAPPING';

                                    const subFields = field.fields || [];
                                    const hasSubFields = subFields.length > 0;

                                    if (hasSubFields) {
                                        // Container / Group Node
                                        return (
                                            <div key={field.id} className={`${depth > 0 ? 'ml-6' : ''}`}>
                                                <div className="border-l border-nier-light/10 pl-4 py-2 my-2 bg-nier-light/[0.02]">
                                                    <div className="flex items-center gap-2 mb-2 opacity-60">
                                                        <div className="w-2 h-2 bg-nier-light/30"></div>
                                                        <span className="text-[10px] font-black uppercase tracking-widest text-nier-light">
                                                            {field.name || field.label || 'BLOCK'}
                                                        </span>
                                                    </div>
                                                    {renderFields(subFields, depth + 1)}
                                                </div>
                                            </div>
                                        );
                                    }

                                    // Leaf Node Logic
                                    // Transform object options to array format for SmartInput: [{label, value}]
                                    const formattedOptions = Array.isArray(rawOptions)
                                        ? rawOptions.map(opt => typeof opt === 'object' ? opt : { label: String(opt), value: opt })
                                        : (rawOptions ? Object.entries(rawOptions).map(([k, v]) => ({ label: k, value: v })) : []);

                                    // For fixed HEX fields, use the hex parameter as the display value
                                    const displayValue = isFixed ? (params.hex || params.value) : (inputs[field.id] !== undefined ? inputs[field.id] : (computedValues[field.id] || 0));

                                    return (
                                        <div key={field.id} className={`${depth > 0 ? 'ml-6' : ''}`}>
                                            <div className="group/field transition-all border-l-2 border-transparent hover:border-nier-light/10 focus-within:border-nier-light/30">
                                                <SmartInput
                                                    label={field.name || field.label || 'PARAM'}
                                                    value={displayValue}
                                                    onChange={(v) => handleInputChange(field.id, v)}
                                                    type={!isEditable ? 'text' : (isEnum && formattedOptions.length > 0 ? 'select' : (params.type || 'number'))}
                                                    options={formattedOptions}
                                                    readOnly={!isEditable}
                                                    highlight={isCalculated}
                                                    suffix={params.unit || ''}
                                                />
                                                {params.description && (
                                                    <div className="text-[9px] font-bold text-nier-light/30 ml-40 -mt-1 mb-2 opacity-0 group-hover/field:opacity-100 transition-opacity uppercase tracking-tighter">
                                                        {params.description}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                });
                            };
                            return renderFields(normalizedInstruction.fields);
                        })()}
                    </div>
                </div>

                {/* Right: Preview & Log */}
                <div className="w-1/3 flex flex-col gap-6 border-l-2 border-nier-light/5 pl-8">
                    {/* Hex Monitor: High Contrast Terminal Style */}
                    <div className="bg-[#4a4a4a] text-[#dad4bb] p-6 relative shadow-inner">
                        <div className="absolute top-0 right-0 bg-[#5c5c5c] text-[9px] px-2 py-0.5 font-bold tracking-widest">
                            BYTE_STREAM_OUTPUT
                        </div>
                        <div className="font-mono text-2xl break-all leading-tight tracking-[0.1em] mt-4 font-black drop-shadow-sm transition-all duration-300">
                            {hexPreview || '00'}
                        </div>
                    </div>

                    {/* Action */}
                    <button
                        onClick={handleSend}
                        className="bg-nier-light text-white py-4 px-8 font-black text-sm tracking-[0.2em] hover:bg-[#2a2a2a] transition-all active:scale-95 flex items-center justify-between group shadow-lg"
                    >
                        <span>TRANSMIT_DATA</span>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono opacity-50">CTRL+ENT</span>
                            <span className="w-2 h-2 bg-white animate-pulse"></span>
                        </div>
                    </button>

                    {/* Log */}
                    <div className="flex-1 overflow-hidden flex flex-col mt-4">
                        <div className="text-xs font-black text-nier-light/40 mb-3 uppercase tracking-[0.2em] border-b-2 border-nier-light/10 pb-2">
                            :: Transmission_Log ::
                        </div>
                        <div className="flex-1 overflow-y-auto font-mono text-xs space-y-3">
                            {logs.map(log => (
                                <div key={log.id} className="flex flex-col gap-1 border-b border-nier-light/5 pb-2">
                                    <div className="flex justify-between opacity-40 font-bold text-[9px]">
                                        <span>[{log.time}]</span>
                                        <span>TX_SUCCESS</span>
                                    </div>
                                    <div className="text-nier-light break-all font-bold">
                                        {log.payload}
                                    </div>
                                </div>
                            ))}
                            {logs.length === 0 && (
                                <div className="italic text-nier-light/30 text-[10px]">// BUFFER_EMPTY</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
