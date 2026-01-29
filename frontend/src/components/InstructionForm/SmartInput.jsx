import React, { useState, useEffect, useRef } from 'react';

/**
 * A mission-grade HUD input component following NieR aesthetics.
 * Features a local buffer state to prevent "Input Lock" during typing.
 * Supports standard inputs and dropdown selections (Enum).
 */
export const SmartInput = ({
    label,
    value,
    onChange,
    type = 'text', // 'text', 'number', 'hex', 'decimal', 'select'
    options = [], // [{ label: 'Name', value: 0x01 }]
    readOnly = false,
    highlight = false,
    autoFocus = false,
    suffix = null,
    className = "",
    placeholder = ""
}) => {
    // Local buffer to allow unnatural typing (e.g. "05", "0x", or ".") without immediate state correction
    const [localValue, setLocalValue] = useState(String(value ?? ''));
    const isFocused = useRef(false);

    // Sync from parent ONLY when not focused to avoid fighting the user
    useEffect(() => {
        if (!isFocused.current) {
            setLocalValue(String(value ?? ''));
        }
    }, [value]);

    const handleFocus = (e) => {
        isFocused.current = true;
        if (!readOnly && e.target.select) {
            e.target.select();
        }
    };

    const handleBlur = () => {
        isFocused.current = false;
        // Final sync: ensure local value matches the true value on blur
        setLocalValue(String(value ?? ''));
    };

    const handleChange = (e) => {
        if (readOnly) return;
        const raw = e.target.value;
        setLocalValue(raw);

        // Parsing logic based on type
        if (type === 'number' || type === 'decimal') {
            if (raw === '' || raw === '-' || raw === '.') {
                // Don't emit partials to parent yet to avoid NaN ripples
                return;
            }
            const num = Number(raw);
            if (!isNaN(num)) {
                onChange(num);
            }
        } else if (type === 'hex') {
            const cleanHex = raw.toUpperCase().replace(/[^0-9A-F]/g, '');
            setLocalValue(cleanHex);
            onChange(cleanHex);
        } else if (type === 'select') {
            // Options are usually numbers or strings
            const selectedOpt = options.find(o => String(o.value) === raw);
            onChange(selectedOpt ? selectedOpt.value : raw);
        } else {
            onChange(raw);
        }
    };

    // Compact HUD aesthetics - NieR: Automata standard (High-Density)
    const baseClasses = "bg-[#d1cbaf]/5 font-mono outline-none text-left px-3 py-1.5 text-base font-bold tracking-wider transition-all duration-200 uppercase w-full";
    const editClasses = "text-[#4a4a4a] border-2 border-[#4a4a4a]/10 focus:border-[#4a4a4a] focus:bg-[#d1cbaf]/20 hover:border-[#4a4a4a]/20";
    // Modified: Solid block style for read-only (Fixed) fields
    const readClasses = "text-[#4a4a4a] bg-[#4a4a4a]/5 border-2 border-[#4a4a4a]/20 cursor-default";

    return (
        <div className={`flex flex-col gap-1 py-1 ${highlight ? 'animate-pulse' : ''} group w-full ${className}`}>
            <div className="flex items-stretch relative">
                {label && (
                    <div className="flex items-center gap-2 mr-3 min-w-[140px] shrink-0">
                        <div className={`w-1 h-4 ${readOnly ? 'bg-[#4a4a4a]/40' : 'bg-[#4a4a4a]/80'}`}></div>
                        <span className={`text-[11px] font-black uppercase tracking-widest truncate ${readOnly ? 'text-[#4a4a4a]/60' : 'text-[#4a4a4a]/70'}`}>
                            {label}
                        </span>
                    </div>
                )}

                <div className="flex-1 flex items-stretch">
                    {type === 'select' && !readOnly ? (
                        <select
                            className={`${baseClasses} ${editClasses}`}
                            value={String(localValue)}
                            onChange={handleChange}
                            onFocus={handleFocus}
                            onBlur={handleBlur}
                        >
                            {options.map((opt, i) => (
                                <option key={i} value={String(opt.value)} className="bg-[#dad4bb] text-[#4a4a4a]">
                                    {opt.label || opt.name || opt.value}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <input
                            type="text"
                            className={`${baseClasses} ${readOnly ? readClasses : editClasses} flex-1 min-w-0 placeholder:text-[#4a4a4a]/20`}
                            value={localValue}
                            onChange={handleChange}
                            onFocus={handleFocus}
                            onBlur={handleBlur}
                            readOnly={readOnly}
                            autoFocus={autoFocus}
                            spellCheck={false}
                            autoComplete="off"
                            placeholder={placeholder}
                        />
                    )}

                    {suffix && (
                        <div className="bg-[#4a4a4a]/80 text-[#dad4bb] px-2 flex items-center justify-center text-[10px] font-black font-mono select-none uppercase tracking-tighter shrink-0">
                            {suffix}
                        </div>
                    )}
                </div>

                <div className="w-24 shrink-0 flex items-center justify-end px-2">
                    <span className="text-[9px] font-black text-[#4a4a4a]/20 uppercase tracking-tighter whitespace-nowrap">
                        {readOnly ? "[READ_ONLY]" : `[${type.toUpperCase()}]`}
                    </span>
                </div>
            </div>

            {readOnly && highlight && (
                <div className="text-[8px] font-black text-[#4a4a4a]/40 uppercase ml-36 tracking-tighter flex items-center gap-1">
                    <span className="w-1 h-1 bg-[#4a4a4a]/40 animate-ping"></span>
                    SYNC_FIELD
                </div>
            )}
        </div>
    );
};
