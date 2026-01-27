/**
 * Simple formula evaluator for protocol fields.
 * Resolves [FieldName] to byte_len and evaluates math.
 */
export function evaluateFormula(formula, nameToValueMap) {
    if (!formula || typeof formula !== 'string') return 0;

    try {
        // 1. Resolve [Name] to value
        let processed = formula.replace(/\[([^\]]+)\]/g, (match, name) => {
            const val = nameToValueMap[name];
            return val !== undefined ? val : 0;
        });

        // 2. Sanitize: only allow numbers, math operators, spaces, parentheses
        // Prevent eval of malicious strings
        if (/[^0-9+\-*/().\s]/.test(processed)) {
            console.warn("Invalid characters in formula:", processed);
            return 0;
        }

        // 3. Evaluate
        // Using Function instead of eval for slightly better safety
        const result = new Function(`return (${processed})`)();

        return typeof result === 'number' && !isNaN(result) ? Math.floor(result) : 0;
    } catch (err) {
        console.error("Formula Eval Error:", err);
        return 0;
    }
}

/**
 * Formats a number to HEX string with specified byte length.
 * e.g. (12, 2) -> "00 0C"
 */
export function formatToHex(value, byteLen) {
    const hex = Math.max(0, value).toString(16).toUpperCase();
    const targetLen = byteLen * 2;
    const padded = hex.padStart(targetLen, '0').slice(-targetLen); // Slice to handle overflow

    // Split into bytes
    return padded.match(/.{1,2}/g)?.join(' ') || padded;
}
