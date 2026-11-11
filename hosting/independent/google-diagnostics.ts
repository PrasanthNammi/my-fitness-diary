// Fixed public failure categories only. Never carry request values or causes.
export const callbackCodes = ['CB_REQUEST','CB_COOKIES','CB_TRANSACTION_REQUIRED','CB_TRANSACTION_TAKE','CB_CONTEXT','CB_PARAMETERS','CB_CANCELLED','CB_CODE','CB_CONTINUATION','CB_SESSION_BINDING','CB_EXISTING_IDENTITY','CB_EXCHANGE_REQUEST','CB_EXCHANGE_STATUS','CB_EXCHANGE_JSON','CB_EXCHANGE_FIELDS','CB_USER_REQUEST','CB_USER_STATUS','CB_USER_JSON','CB_CLAIMS_JSON','CB_SUBJECT','CB_ISSUER','CB_AUDIENCE','CB_ROLE','CB_CLIENT','CB_SESSION','CB_EXPIRY','CB_NOT_BEFORE','CB_ACCOUNT','CB_RESPONSE'] as const;
export type CallbackCode = typeof callbackCodes[number];
export class CallbackFailure extends Error {
  constructor(readonly code: CallbackCode) { super(code); }
}
export function callbackFailure(code: CallbackCode): never { throw new CallbackFailure(code); }
export async function callbackStep<T>(code: CallbackCode, action: () => T | Promise<T>): Promise<T> {
  try { return await action(); } catch { return callbackFailure(code); }
}
