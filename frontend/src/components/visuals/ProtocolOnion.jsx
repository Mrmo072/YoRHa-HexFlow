import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

// Animation Variants (Nier Tech Style)
const containerVariants = {
    hidden: {
        opacity: 0,
        scale: 0.95,
        filter: "blur(10px)"
    },
    visible: {
        opacity: 1,
        scale: 1,
        filter: "blur(0px)",
        transition: {
            duration: 0.4,
            ease: [0.22, 1, 0.36, 1],
            staggerChildren: 0.1
        }
    },
    hover: {
        borderColor: 'rgba(255, 255, 255, 0.9)',
        boxShadow: '0 0 15px rgba(255, 255, 255, 0.1), inset 0 0 10px rgba(0, 0, 0, 0.5)',
        transition: { duration: 0.1 }
    }
};

// Helper for class merging
function cn(...inputs) {
    return twMerge(clsx(inputs));
}

export default function ProtocolOnion({ block, depth = 0 }) {
    const [isHovered, setIsHovered] = useState(false);
    const isContainer = block.children && block.children.length > 0;

    // Depth styling
    const depthStyles = {
        0: 'bg-nier-dark/60 border-nier-light/30 z-30',
        1: 'bg-nier-dark/80 border-nier-light/20 z-20',
        2: 'bg-nier-dark/95 border-nier-light/10 z-10',
    };

    // Padding based on depth
    const paddingStyle = { padding: `${depth > 0 ? 1.5 : 2}rem` };

    return (
        <motion.div
            className={cn(
                'relative border-[1px] backdrop-blur-md overflow-hidden flex flex-col gap-2 min-w-[300px]',
                'transition-colors duration-200 shadow-xl',
                depthStyles[depth % 3] || depthStyles[0]
            )}
            style={paddingStyle}
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            whileHover="hover"
            onHoverStart={(e) => {
                e.stopPropagation();
                setIsHovered(true);
            }}
            onHoverEnd={(e) => {
                e.stopPropagation();
                setIsHovered(false);
            }}
            layout
        >
            {/* Scanline Effect */}
            <AnimatePresence>
                {isHovered && isContainer && (
                    <motion.div
                        initial={{ top: '-10%', opacity: 0 }}
                        animate={{ top: '110%', opacity: 0.5 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                        className="absolute left-0 w-full h-[2px] bg-nier-light/30 pointer-events-none shadow-[0_0_10px_rgba(218,212,187,0.5)]"
                    />
                )}
            </AnimatePresence>

            {/* Label Header */}
            <div className={cn(
                "absolute top-0 left-0 px-3 py-1 text-xs font-mono uppercase tracking-wider border-b border-r border-inherit transition-colors duration-100 cursor-default",
                isHovered ? "bg-nier-light text-nier-dark font-bold" : "bg-nier-dark text-nier-light"
            )}>
                {block.label} <span className="opacity-50">[{block.type.toUpperCase()}]</span> {isHovered && "// ACTIVE"}
            </div>

            {/* Content Area */}
            <div className="mt-4 flex flex-col gap-4">
                {!isContainer ? (
                    // Atomic Block View
                    <div className="font-mono text-sm text-nier-light bg-nier-highlight/10 p-3 border border-nier-light/10 flex items-center justify-between group-hover:bg-nier-light/5 transition-colors">
                        <span className="opacity-50 text-[10px]">RAW</span>
                        <span className="font-bold tracking-widest">{block.hex_value || (block.byte_length && "00 ".repeat(block.byte_length))}</span>
                    </div>
                ) : (
                    // Recursive Children
                    block.children.map(child => (
                        <ProtocolOnion key={child.id} block={child} depth={depth + 1} />
                    ))
                )}
            </div>

            {/* Footer Info (Byte Count) */}
            <div className="absolute bottom-1 right-2 text-[9px] font-mono opacity-40">
                LEN: {block.byte_length}B
            </div>
        </motion.div>
    );
}
