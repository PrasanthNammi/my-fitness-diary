// Local tests must use synthetic fixtures and explicit fetch doubles.
globalThis.fetch = async () => { throw new Error('Network access forbidden in local tests'); };
