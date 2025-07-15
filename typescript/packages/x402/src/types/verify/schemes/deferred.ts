import { z } from "zod";
import {
  EvmAddressRegex,
  EvmSignatureRegex,
  HexEncoded64ByteRegex,
  EvmMaxAtomicUnits,
} from "../constants";
import { hasMaxLength, isInteger } from "../refiners";
import { NetworkSchema, x402Versions } from "../..";

export const DeferredErrorReasons = [
  "invalid_deferred_evm_payload_network_mismatch",
  "invalid_deferred_evm_payload_chain_id",
  "invalid_deferred_evm_payload_voucher_value",
  "invalid_deferred_evm_payload_recipient_mismatch",
  "invalid_deferred_evm_payload_asset_mismatch",
  "invalid_deferred_evm_payload_voucher_already_claimed",
  "invalid_deferred_evm_payload_signature",
] as const;

// x402DeferredEvmPayloadVoucher
export const DeferredEvmPayloadVoucherSchema = z.object({
  id: z.string().regex(HexEncoded64ByteRegex),
  buyer: z.string().regex(EvmAddressRegex),
  seller: z.string().regex(EvmAddressRegex),
  value: z.string().refine(isInteger).refine(hasMaxLength(EvmMaxAtomicUnits)),
  asset: z.string().regex(EvmAddressRegex),
  timestamp: z.number().int().nonnegative(),
  nonce: z.number().int().nonnegative(),
  escrow: z.string().regex(EvmAddressRegex),
  chainId: z.number().int().nonnegative(),
});
export type DeferredEvmPayloadVoucher = z.infer<typeof DeferredEvmPayloadVoucherSchema>;

// x402DeferredEvmPayload
export const DeferredEvmPayloadSchema = z.object({
  signature: z.string().regex(EvmSignatureRegex),
  voucher: DeferredEvmPayloadVoucherSchema,
});
export type DeferredEvmPayload = z.infer<typeof DeferredEvmPayloadSchema>;

// x402DeferredEvmPaymentPayload
export const DeferredPaymentPayloadSchema = z.object({
  x402Version: z.number().refine(val => x402Versions.includes(val as 1)),
  scheme: z.literal("deferred"),
  network: NetworkSchema,
  payload: DeferredEvmPayloadSchema,
});
export type DeferredPaymentPayload = z.infer<typeof DeferredPaymentPayloadSchema>;

// x402UnsignedDeferredPaymentPayload
export const UnsignedDeferredPaymentPayloadSchema = z.object({
  x402Version: z.number().refine(val => x402Versions.includes(val as 1)),
  scheme: z.literal("deferred"),
  network: NetworkSchema,
  payload: DeferredEvmPayloadSchema.omit({ signature: true }).extend({
    signature: z.undefined(),
  }),
});
