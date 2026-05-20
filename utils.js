function sanitizeSchemaForClaude(schema) {
    if (typeof schema !== 'object' || schema === null) return schema;
    if (Array.isArray(schema)) return schema.map(sanitizeSchemaForClaude);

    const result = {};
    for (const [key, value] of Object.entries(schema)) {
        if (key === 'minItems') continue;
        if (key === 'maxItems') continue;
        result[key] = sanitizeSchemaForClaude(value);
    }
    return result;
}