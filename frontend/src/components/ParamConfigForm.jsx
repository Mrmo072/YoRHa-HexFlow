import React from 'react';
import { v4 as uuidv4 } from 'uuid';

export default function ParamConfigForm({
    blockState,
    instructionFields,
    operatorTemplates,
    onUpdateParam, // (key, val) => void
    hexInputMode,
    setHexInputMode,
    onOpenDatePicker, // (key, val) => void
    onStartPicking, // (key, currentRefs) => void
    onStopPicking, // () => void
    pickingMode // { isActive, fieldKey, ... }
}) {
    const template = operatorTemplates[blockState.op_code];
    if (!template || !template.param_template) return null;

    // AUTO-RECONCILE SQL IMPORTS (Name-based formula to UUID refs)
    React.useEffect(() => {
        const formula = blockState.parameter_config?.formula;
        const refs = blockState.parameter_config?.refs || [];
        if (typeof formula === 'string' && formula.includes('[') && refs.length === 0) {
            const matches = formula.match(/\[([^\]]+)\]/g) || [];
            const names = matches.map(m => m.slice(1, -1));
            const resolvedRefs = names.map(name => {
                const f = instructionFields?.find(fi => (fi.name || fi.label) === name);
                return f?.id;
            }).filter(Boolean);

            if (resolvedRefs.length > 0) {
                console.log(`Auto-resolving refs for ${blockState.name} from formula: ${formula}`);
                onUpdateParam('refs', [...new Set(resolvedRefs)]);
            }
        }
    }, [blockState.id, blockState.parameter_config?.formula]);

    return Object.entries(template.param_template).map(([key, rawConfig]) => {
        const val = blockState.parameter_config?.[key];

        // TYPE INFERENCE:
        // 1. If it's a known keyword, use it as type
        // 2. If it matches a pattern (e.g. ISO date), infer type
        // 3. Otherwise infer from typeof value
        const keywords = ['datetime', 'number', 'string', 'field_picker', 'kv_pair_list', 'input'];
        let configType = rawConfig;

        if (typeof rawConfig === 'string') {
            if (!keywords.includes(rawConfig)) {
                // If it looks like a date, it's a datetime
                if (rawConfig.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) configType = 'datetime';
                else configType = 'string';
            }
        } else if (typeof rawConfig === 'number') {
            configType = 'number';
        }

        // 0. Field Picker (Logic Fields)
        if (configType === 'field_picker') {
            const currentRefs = Array.isArray(val) ? val : [];
            const isPickingThis = pickingMode?.isActive && pickingMode?.fieldKey === key;

            return (
                <div key={key} className="flex flex-col gap-1 border border-dashed border-nier-light/30 p-2 bg-nier-light/5">
                    <div className="flex justify-between items-center">
                        <label className="text-[10px] opacity-70 uppercase tracking-widest">{key}</label>
                        <div className="text-[9px] font-bold text-yellow-500">{currentRefs.length} REF(S)</div>
                    </div>

                    <button
                        onClick={() => {
                            if (isPickingThis) {
                                // Toggle Off
                                onStopPicking && onStopPicking();
                            } else {
                                onStartPicking(key, currentRefs);
                            }
                        }}
                        className={`w-full py-1 text-[10px] uppercase tracking-widest transition-all border ${isPickingThis ? 'bg-yellow-500 text-black border-yellow-500 animate-pulse font-bold' : 'bg-transparent border-nier-light/50 text-nier-light hover:bg-nier-light hover:text-black'}`}
                    >
                        {isPickingThis ? 'STOP PICKING (DONE)' : 'SELECT FIELDS'}
                    </button>
                    {isPickingThis && (
                        <div className="text-[8px] opacity-70 text-center mt-1">
                            Click blocks on canvas to link/unlink.
                        </div>
                    )}
                </div>
            );
        }

        // 1. Enum / Array Select
        if (Array.isArray(configType)) {
            return (
                <div key={key} className="flex flex-col gap-1">
                    <label className="text-[10px] opacity-70 uppercase tracking-widest">{key}</label>
                    <select
                        value={val || configType[0]}
                        onChange={(e) => {
                            const raw = e.target.value;
                            // Smart parse: if it looks like a number, parse it
                            const parsed = isNaN(raw) ? raw : (raw.includes('.') ? parseFloat(raw) : parseInt(raw, 10));
                            onUpdateParam(key, parsed);
                        }}
                        className="bg-nier-dark border border-nier-light/30 text-xs p-1 text-nier-light focus:border-nier-light focus:outline-none"
                    >
                        {configType.map(opt => <option key={opt} value={opt} className="bg-nier-dark text-nier-light">{opt}</option>)}
                    </select>
                </div>
            )
        }

        // 2. Key-Value List (Enum Mapping)
        if (key === 'options' && configType === 'kv_pair_list') {
            // Use internal array state for rendering (prepared by parent)
            const kvArray = blockState.parameter_config?._kvArray || [];

            return (
                <div key={key} className="flex flex-col gap-2 border border-nier-light/20 p-2 bg-nier-light/5">
                    <div className="flex justify-between items-center">
                        <label className="text-[10px] opacity-70 uppercase tracking-widest">{key}</label>
                        <button
                            onClick={() => {
                                const newArray = [...kvArray, { id: uuidv4(), val: '', label: '' }];
                                onUpdateParam('_kvArray', newArray);
                            }}
                            className="text-[9px] bg-nier-light/10 hover:bg-nier-light hover:text-nier-dark px-2 py-0.5 transition-colors"
                        >
                            + ADD
                        </button>
                    </div>
                    {/* Multi-Format Toggle */}
                    <div className="flex justify-end mb-2">
                        <div className="flex text-[9px] gap-1 border border-nier-light/30 p-0.5 bg-nier-highlight/10">
                            {['HEX', 'DEC', 'BIN'].map(m => (
                                <button
                                    key={m}
                                    onClick={() => setHexInputMode(m)}
                                    className={`px-2 py-0.5 transition-all ${hexInputMode === m ? 'bg-nier-light text-nier-dark font-bold' : 'text-nier-light hover:bg-nier-light/20'}`}
                                >
                                    {m}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-col gap-1 max-h-40 overflow-y-auto pr-1">
                        {kvArray.map((item, idx) => (
                            <div key={item.id} className="flex gap-1 items-center">
                                {/* LABEL (Left) */}
                                <input
                                    type="text"
                                    placeholder="LABEL"
                                    value={item.label}
                                    onChange={(e) => {
                                        const newArray = [...kvArray];
                                        newArray[idx].label = e.target.value;
                                        onUpdateParam('_kvArray', newArray);
                                    }}
                                    className="flex-1 bg-transparent border-b border-nier-light/30 text-xs font-mono text-nier-light focus:border-nier-light focus:outline-none text-center"
                                />
                                <span className="text-nier-light/50">:</span>
                                {/* VALUE (Right) */}
                                <input
                                    type="text"
                                    placeholder="VAL"
                                    value={(() => {
                                        // Multi-Format Display
                                        const rawHex = item.val;
                                        if (!rawHex) return "";
                                        const val = parseInt(rawHex, 16);
                                        if (isNaN(val)) return rawHex;

                                        if (hexInputMode === 'DEC') return val.toString(10);
                                        if (hexInputMode === 'BIN') return val.toString(2).padStart(rawHex.length * 4, '0');
                                        return rawHex.toUpperCase(); // HEX
                                    })()}
                                    onChange={(e) => {
                                        const input = e.target.value;
                                        let newHex = "";
                                        try {
                                            if (input === "") {
                                                newHex = "";
                                            } else if (hexInputMode === 'DEC') {
                                                const d = parseInt(input, 10);
                                                if (!isNaN(d)) newHex = d.toString(16).toUpperCase();
                                            } else if (hexInputMode === 'BIN') {
                                                const b = parseInt(input, 2);
                                                if (!isNaN(b)) newHex = b.toString(16).toUpperCase();
                                            } else {
                                                // HEX
                                                newHex = input.toUpperCase().replace(/[^0-9A-F]/g, '');
                                            }
                                            // Update Item Value (Internal Hex)
                                            const newArray = [...kvArray];
                                            newArray[idx].val = newHex;
                                            onUpdateParam('_kvArray', newArray);
                                        } catch (err) { }
                                    }}
                                    className="w-1/3 bg-transparent border-b border-nier-light/30 text-xs font-mono text-nier-light focus:border-nier-light focus:outline-none text-center"
                                />

                                <button
                                    onClick={() => {
                                        const newArray = kvArray.filter(x => x.id !== item.id);
                                        onUpdateParam('_kvArray', newArray);
                                    }}
                                    className="text-red-500/50 hover:text-red-500 text-[10px] px-1"
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                        {kvArray.length === 0 && (
                            <div className="text-[9px] opacity-30 text-center py-2">NO MAPPINGS</div>
                        )}
                    </div>
                </div>
            )
        }

        // 3. DateTime
        if (configType === 'datetime') {
            return (
                <div key={key} className="flex flex-col gap-1">
                    <label className="text-[10px] opacity-70 uppercase tracking-widest">{key}</label>
                    <div
                        onClick={() => onOpenDatePicker(val, (newDate) => onUpdateParam(key, newDate))}
                        className="bg-transparent border-b border-nier-light/50 py-1 font-mono text-xs text-nier-light cursor-pointer hover:bg-nier-light/10 flex justify-between items-center group/date"
                    >
                        <span className={!val ? "opacity-50" : ""}>{val ? val.replace('T', ' ') : 'YYYY-MM-DD HH:MM:SS'}</span>
                        <span className="opacity-30 text-[8px] group-hover/date:opacity-100 transition-opacity">EDIT</span>
                    </div>
                </div>
            )
        }

        // 4. Advanced Formula Input (Logic Fields)
        if (key === 'formula') {
            const refs = blockState.parameter_config?.refs || [];
            // Map refs to names
            const linkedFields = refs.map(id => {
                const f = instructionFields?.find(b => b.id === id);
                return f ? (f.name || f.label) : null;
            }).filter(Boolean);

            return (
                <div key={key} className="flex flex-col gap-2">
                    <label className="text-[10px] opacity-70 uppercase tracking-widest">{key}</label>

                    {/* QUICK ACTIONS */}
                    <div className="flex flex-wrap gap-1 mb-1">
                        {linkedFields.map(name => (
                            <button
                                key={name}
                                title={`Click to insert ${name}`}
                                onClick={() => {
                                    const current = val || '';
                                    const spacer = (current && !current.endsWith(' ')) ? ' ' : '';
                                    onUpdateParam(key, `${current}${spacer}[${name}] `);
                                }}
                                className="text-[9px] bg-nier-light/10 border border-nier-light/30 px-1.5 py-0.5 hover:bg-nier-light hover:text-nier-dark transition-colors uppercase"
                            >
                                + {name}
                            </button>
                        ))}
                        {linkedFields.length > 1 && (
                            <button
                                onClick={() => {
                                    const formula = linkedFields.map(n => `[${n}]`).join(' + ');
                                    onUpdateParam(key, formula);
                                }}
                                className="text-[9px] bg-orange-400 text-black font-bold px-1.5 py-0.5 hover:opacity-80 transition-opacity uppercase"
                            >
                                ∑ SUM ALL
                            </button>
                        )}
                        {linkedFields.length === 0 && (
                            <div className="text-[9px] opacity-40 italic border border-dashed border-nier-light/20 px-2 py-1 w-full text-center">
                                No linked fields. Click "SELECT FIELDS" above first.
                            </div>
                        )}
                    </div>

                    <textarea
                        ref={(el) => {
                            if (el) {
                                el.style.height = 'auto';
                                el.style.height = el.scrollHeight + 'px';
                            }
                        }}
                        value={val || ''}
                        placeholder="e.g. ([FieldA] + [FieldB]) / 2"
                        rows={1}
                        onChange={(e) => {
                            const newFormula = e.target.value;
                            onUpdateParam(key, newFormula);

                            // AUTO-RESOLVE REFS: Extract [Name] tokens
                            const matches = newFormula.match(/\[([^\]]+)\]/g) || [];
                            const names = matches.map(m => m.slice(1, -1));
                            const foundRefs = names.map(name => {
                                const f = instructionFields?.find(fi => (fi.name || fi.label) === name);
                                return f?.id;
                            }).filter(Boolean);

                            // MERGE logic: Keep existing refs (from picker) + Add new ones found in text
                            const currentRefs = blockState.parameter_config?.refs || [];
                            const uniqueMerged = [...new Set([...currentRefs, ...foundRefs])];

                            if (uniqueMerged.length !== currentRefs.length) {
                                onUpdateParam('refs', uniqueMerged);
                            }
                        }}
                        className="bg-transparent border-b border-nier-light/50 focus:border-nier-light focus:outline-none py-1 font-mono text-sm w-full resize-none overflow-hidden min-h-[1.5rem]"
                    />
                    <div className="text-[8px] opacity-30 italic">Click field tags above to quickly build formula.</div>
                </div>
            )
        }

        // 5. Standard Input (Number/Text)
        return (
            <div key={key} className="flex flex-col gap-1">
                <label className="text-[10px] opacity-70 uppercase tracking-widest">
                    {key === 'max_count' ? 'LOOP COUNT' : key}
                </label>
                <input
                    type={configType === 'number' ? 'number' : 'text'}
                    step={configType === 'number' ? 'any' : undefined}
                    value={val !== undefined ? val : ''}
                    onChange={(e) => {
                        let v = e.target.value;
                        if (configType === 'number') v = parseFloat(v);
                        onUpdateParam(key, v);
                    }}
                    className="bg-transparent border-b border-nier-light/50 focus:border-nier-light focus:outline-none py-1 font-mono text-sm"
                />
            </div>
        );
    });
}
