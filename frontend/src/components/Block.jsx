import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export default function Block({ id, label, name, byte_length, byte_len, type, op_code, hex_value, parameter_config, children, isSelected, isPickMode, isPickRef, onClick }) {
    // Normalize Props (Backend v4 vs v3)
    const displayLabel = name || label || 'BLOCK';
    const length = byte_len || byte_length || 1;
    const effectiveHex = hex_value || parameter_config?.hex;

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        width: `${Math.max(60, length * 40)}px`, // Increased min-width for label stability
    };

    // Style Mapping: Based on Information Density
    // Light (Beige) = Simple/Static
    // Dark (Charcoal) = Complex/Logic/Structure
    const getThemeStyle = () => {
        // Map op_codes or types to specific styles
        const darkStyle = 'border-nier-light bg-nier-light text-nier-dark font-bold';
        const lightStyle = 'border-nier-light bg-nier-dark text-nier-light';

        // Check top-level op_code first, then nested, then type
        const op = op_code || parameter_config?.op_code || type;

        const isDark = [
            'LENGTH_CALC', 'CHECKSUM_CRC', 'ARRAY_GROUP',
            'length', 'checksum', 'container', 'group'
        ].includes(op);

        if (isDark) return darkStyle;
        if (type === 'optional') return 'border-dashed border-nier-light text-nier-light opacity-80';

        return lightStyle; // Default to Light (HEX_RAW, CMD, etc)
    };

    const getClasses = () => {
        let base = "min-h-[6rem] h-auto border flex flex-col justify-between p-2 select-none group relative z-10 transition-all duration-200 ";

        // PICKING MODE VISUALS (Always distinct)
        if (isPickMode) {
            if (isPickRef) {
                base += "bg-orange-300 border-nier-light text-nier-light shadow-[0_0_10px_rgba(253,224,71,0.5)] z-40 cursor-pointer ";
            } else {
                base += "border-dashed border-nier-light/50 text-nier-light/70 hover:bg-orange-200 hover:border-nier-light cursor-alias ";
            }
            if (isSelected) base += "border-2 border-nier-light opacity-50 cursor-default ";
        } else {
            // NORMAL MODE
            base += getThemeStyle();

            if (isSelected) {
                // User Request: Thick border instead of orange ring (Reserve orange for errors)
                base += " z-40 border-[3px] border-nier-light shadow-[0_0_15px_rgba(0,0,0,0.2)] scale-[1.02] ";
            } else {
                base += " hover:brightness-95 cursor-pointer ";
            }
        }

        if (isDragging) base += " opacity-50 z-50 ring-2 ring-white scale-105";

        return base;
    };


    // Logic for display value
    const displayValue = React.useMemo(() => {
        // 1. If explicit computed value (from formula engine), use it
        if (parameter_config?.computedValue !== undefined) {
            return parameter_config.computedValue;
        }

        // 2. If it's a HEX block with manual value
        if (type === 'hex' && effectiveHex) {
            // Format "AA55" to "AA 55"
            return effectiveHex.replace(/\s/g, '').match(/.{1,2}/g)?.join(' ').toUpperCase() || effectiveHex;
        }

        // 3. Default: "00 " repeated for unknown/unset
        const safeLen = Math.max(1, Math.floor(length));
        return Array(safeLen).fill('00').join(' ');
    }, [type, effectiveHex, length, parameter_config?.computedValue]);

    return (
        <div
            ref={setNodeRef}
            id={`block-${id}`} // DOM reference for Canvas lines
            style={style}
            {...attributes}
            {...listeners}
            className={getClasses()}
            onClick={(e) => {
                e.stopPropagation(); // Prevent parent click
                onClick?.(e);
            }}
        >
            {/* Logic Field Indicators */}
            {isPickRef && (
                <div className="absolute -top-2 -right-2 bg-yellow-400 text-black text-[9px] font-bold px-1 rounded-sm shadow-sm z-50">
                    REF
                </div>
            )}

            {/* Header/Label */}
            <div className="text-[10px] tracking-widest uppercase border-b border-current pb-1 mb-1 whitespace-nowrap overflow-hidden text-ellipsis">
                {displayLabel}
            </div>

            {/* Byte Indicator centered */}
            <div className="flex-1 flex items-center justify-center text-sm font-bold break-all text-center leading-tight overflow-hidden px-1">
                {displayValue}
            </div>

            {/* Nested Children Preview (Recursive) */}
            {type === 'container' && children && children.length > 0 && (
                <div className="mt-2 pt-2 border-t border-dashed border-current/30 w-full flex flex-col gap-1 items-center">
                    <div className="text-[8px] opacity-70 mb-1">CONTENTS ({children.length})</div>
                    <div className="flex gap-1 flex-wrap justify-center">
                        {children.map(child => (
                            <div key={child.id} className="border border-current px-1 py-[2px] text-[8px] opacity-80 whitespace-nowrap">
                                {child.type === 'fixed' || child.type === 'container' ? (child.name || child.label) : child.type.toUpperCase()}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Footer info */}
            <div className="text-[9px] flex justify-between opacity-70 mt-1 w-full">
                <span>{length}B</span>
            </div>

            {/* Corner Decors (Nier) */}
            <div className="absolute top-0 right-0 w-1 h-1 bg-current opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="absolute bottom-0 left-0 w-1 h-1 bg-current opacity-0 group-hover:opacity-100 transition-opacity"></div>
        </div>
    );
}
