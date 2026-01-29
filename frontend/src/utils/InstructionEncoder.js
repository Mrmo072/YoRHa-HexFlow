import { evaluateFormula, formatToHex, formatFloatToHex } from './formula';

/**
 * Core Logic for the Instruction Processing Engine.
 * Decouples "Byte Generation" from "UI Rendering".
 */
export const InstructionEncoder = {
    /**
     * Helper to flatten nested fields/blocks for linear encoding.
     */
    flattenFields: function (items) {
        let flat = [];
        if (!items) return flat;
        // Sort items by 'order' or 'index' to ensure correct hex sequence (Backend uses 'sequence')
        const sortedItems = [...items].sort((a, b) => (a.sequence ?? a.order ?? 0) - (b.sequence ?? b.order ?? 0));

        sortedItems.forEach(item => {
            flat.push(item);
            if (item.fields || item.blocks || item.children) {
                flat = flat.concat(this.flattenFields(item.fields || item.blocks || item.children));
            }
        });
        return flat;
    },

    /**
     * Generates the initial user input state based on default values.
     */
    getInitialValues: function (instruction) {
        const initialInputs = {};
        if (!instruction) return initialInputs;

        const rawFields = instruction.fields || instruction.blocks || [];
        const allFields = this.flattenFields(rawFields);

        allFields.forEach(field => {
            const params = field.parameter_config || {};
            const op = String(field.op_code || '').toUpperCase();
            const type = String(params.type || '').toLowerCase();

            // Broad input detection: Any field that is marked as INPUT or variable
            const isInput = op === 'INPUT' || params.variable;

            if (isInput) {
                if (params.default !== undefined) {
                    initialInputs[field.id] = params.default;
                } else if (type === 'string' || type === 'text') {
                    initialInputs[field.id] = '';
                } else {
                    initialInputs[field.id] = 0;
                }
            }
        });
        return initialInputs;
    },

    /**
     * Resolves all derived fields (CALCULATED / Formulas) based on current inputs.
     */
    resolveDependencies: function (instruction, inputs) {
        const computedValues = {};
        if (!instruction) return computedValues;

        const rawFields = instruction.fields || instruction.blocks || [];
        // CRITICAL: Filter for LEAF NODES only.
        // If we include containers, 'Auto Length' calculations will count phantom bytes for the containers themselves.
        const allFields = this.flattenFields(rawFields).filter(f =>
            (!f.fields || f.fields.length === 0) &&
            (!f.blocks || f.blocks.length === 0) &&
            (!f.children || f.children.length === 0)
        );

        // 1. Create a "Symbol Table" for formula evaluation. 
        const symbolTable = {};

        // Populate symbol table with Inputs and Fixed values
        allFields.forEach(field => {
            const params = field.parameter_config || {};
            const name = field.name || field.label;

            if (inputs[field.id] !== undefined) {
                symbolTable[name] = inputs[field.id];
                symbolTable[field.id] = inputs[field.id];
            } else if (params.value !== undefined) {
                symbolTable[name] = params.value;
                symbolTable[field.id] = params.value;
            }
        });

        // 2. Resolve parameters that use formulas
        // We'll calculate "Auto Length" by looking at the fields after the length field
        allFields.forEach((field, index) => {
            const params = field.parameter_config || {};
            const name = field.name || field.label;

            // Handle explicit formulas
            if (params.formula && params.formula !== 'auto') {
                const result = evaluateFormula(params.formula, symbolTable);
                computedValues[field.id] = result;
                symbolTable[name] = result;
                symbolTable[field.id] = result;
            }

            // Handle "Auto Length" (长度型)
            // Logic: Calculate total byte length of all fields following this one.
            if (params.formula === 'auto' || field.op_code === 'CALCULATED') {
                if (params.formula === 'auto') {
                    let length = 0;
                    for (let i = index + 1; i < allFields.length; i++) {
                        length += allFields[i].byte_len || 0;
                    }
                    computedValues[field.id] = length;
                    symbolTable[name] = length;
                    symbolTable[field.id] = length;
                }
            }
        });

        return computedValues;
    },

    /**
     * Generates the final Hex string.
     */
    encodeInstruction: function (instruction, inputs, computedValues) {
        let hexParts = [];
        let byteMap = [];
        let currentByteIndex = 0;

        if (!instruction) return { hexString: '', byteMap: [] };

        const rawFields = instruction.fields || instruction.blocks || [];
        // Only encode top-level fields; nested fields are handled by recursion if we had a pure tree,
        // but for protocol generation we treat the flat sequence as the truth.
        // CRITICAL: We must filter out PARENTS (containers) because they do not emit bytes.
        // FIX: Check for LENGTH > 0 because 'fields' might be an empty array [] which is truthy.
        const allFields = this.flattenFields(rawFields).filter(f =>
            (!f.fields || f.fields.length === 0) &&
            (!f.blocks || f.blocks.length === 0) &&
            (!f.children || f.children.length === 0)
        );

        allFields.forEach(field => {
            let val = 0;
            const params = field.parameter_config || {};

            // 1. Determine the value
            if (field.op_code === 'FIXED' || field.op_code === 'HEX_RAW') {
                if (params.hex) {
                    const cleanHex = params.hex.replace(/\s/g, '');
                    hexParts.push(cleanHex);
                    const byteLen = cleanHex.length / 2;
                    byteMap.push({ start: currentByteIndex, end: currentByteIndex + byteLen, fieldId: field.id });
                    currentByteIndex += byteLen;
                    return;
                }
                val = params.value || 0;
            } else if (inputs[field.id] !== undefined) {
                val = inputs[field.id];
            } else if (computedValues[field.id] !== undefined) {
                val = computedValues[field.id];
            } else {
                val = params.value || 0;
            }

            // 2. Format to Hex
            const byteLen = field.byte_len || 1;

            if (params.type === 'float' || params.type === 'decimal') {
                // Decimal/Float Case (IEEE 754)
                const fmt = formatFloatToHex(val).replace(/\s/g, '');
                hexParts.push(fmt);
                byteMap.push({ start: currentByteIndex, end: currentByteIndex + 4, fieldId: field.id });
                currentByteIndex += 4;
            } else if (params.type === 'string') {
                // String Case
                const str = String(val);
                let strHex = '';
                for (let i = 0; i < str.length; i++) {
                    strHex += str.charCodeAt(i).toString(16).padStart(2, '0').toUpperCase();
                }
                hexParts.push(strHex);
                const actualBytes = strHex.length / 2;
                byteMap.push({ start: currentByteIndex, end: currentByteIndex + actualBytes, fieldId: field.id });
                currentByteIndex += actualBytes;
            } else {
                // Number / HEX / Length Case
                const fmt = formatToHex(val, byteLen).replace(/\s/g, '');
                hexParts.push(fmt);
                byteMap.push({ start: currentByteIndex, end: currentByteIndex + byteLen, fieldId: field.id });
                currentByteIndex += byteLen;
            }
        });

        const rawFull = hexParts.join('');
        const pretty = rawFull.match(/.{1,2}/g)?.join(' ') || '';

        return {
            hexString: pretty,
            byteMap
        };
    }
};
