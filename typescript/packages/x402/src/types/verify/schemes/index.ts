import { DEFERRRED_SCHEME } from "./deferred";
import { EXACT_SCHEME } from "./exact";

export * from "./base";
export * from "./deferred";
export * from "./exact";

export const SCHEMES = [EXACT_SCHEME, DEFERRRED_SCHEME] as const;
export type SCHEMES = (typeof SCHEMES)[number];
