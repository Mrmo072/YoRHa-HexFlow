import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export default function Block({ id, label, name, byte_length, byte_len, type, hex_value, config_values, children, isSelected, onClick }) {
    // Normalize Props (Backend v4 vs v3)
    const displayLabel = name || label || 'BLOCK';
    const length = byte_len || byte_length || 1;
    const effectiveHex = hex_value || config_values?.hex;

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

    // Style Mapping
    const typeStyles = {
        fixed: 'border-nier-light bg-nier-dark text-nier-light',
        length: 'border-nier-light bg-nier-grid/50 text-nier-light font-bold',
        checksum: 'border-nier-light bg-nier-light text-nier-dark font-bold',
        optional: 'border-dashed border-nier-light text-nier-light opacity-80',
    };

    const getClasses = () => {
        let base = "min-h-[6rem] h-auto border flex flex-col justify-between p-2 select-none group relative transition-colors duration-100 ";

        // Selection overrides other styles for "Hard Invert"
        if (isSelected) {
            base += "bg-nier-light/90 text-nier-dark border-transparent z-40 shadow-[0_0_15px_rgba(255,255,255,0.3)] ";
        } else {
            base += typeStyles[type] || typeStyles['fixed'];
            base += " hover:bg-nier-light hover:text-nier-dark cursor-pointer ";
        }

        if (isDragging) base += " opacity-50 z-50 ring-2 ring-white scale-105";

        return base;
    };



    // Logic for display value
    const displayValue = React.useMemo(() => {
        if (type === 'fixed' && effectiveHex) {
            // Format "AA55" to "AA 55"
            return effectiveHex.replace(/\s/g, '').match(/.{1,2}/g)?.join(' ').toUpperCase() || effectiveHex;
        }
        // "00 " repeated
        // Ensure valid length for Array
        const safeLen = Math.max(1, Math.floor(length));
        return Array(safeLen).fill('00').join(' ');
    }, [type, effectiveHex, length]);

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className={getClasses()}
            onClick={(e) => {
                e.stopPropagation(); // Prevent parent click
                onClick?.(e);
            }}
        >
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
                <span>{type?.substr(0, 3).toUpperCase()}</span>
            </div>

            {/* Corner Decors (Nier) */}
            <div className="absolute top-0 right-0 w-1 h-1 bg-current opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="absolute bottom-0 left-0 w-1 h-1 bg-current opacity-0 group-hover:opacity-100 transition-opacity"></div>
        </div>
    );
}
