import { z } from "zod";
import {
  EvmAddressRegex,
  EvmSignatureRegex,
  HexEncoded64ByteRegex,
  EvmMaxAtomicUnits,
  MixedAddressRegex,
} from "../constants";
import { hasMaxLength, isInteger } from "../refiners";
import { NetworkSchema } from "../../shared";
import { x402Versions } from "../versions";

export const DeferredErrorReasons = [
  "invalid_deferred_evm_payload_network_mismatch",
  "invalid_deferred_evm_payload_chain_id",
  "invalid_deferred_evm_payload_voucher_value",
  "invalid_deferred_evm_payload_recipient_mismatch",
  "invalid_deferred_evm_payload_asset_mismatch",
  "invalid_deferred_evm_payload_voucher_already_claimed",
  "invalid_deferred_evm_payload_signature",
  "invalid_deferred_evm_payload_no_longer_valid",
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
export type UnsignedDeferredPaymentPayload = z.infer<typeof UnsignedDeferredPaymentPayloadSchema>;

// x402DeferredEvmPaymentRequirementsExtraNewVoucher
export const DeferredEvmPaymentRequirementsExtraNewVoucherSchema = z.object({
  type: z.literal("new"),
  voucher: DeferredEvmPayloadVoucherSchema.pick({ id: true, escrow: true }),
});
export type DeferredEvmPaymentRequirementsExtraNewVoucher = z.infer<
  typeof DeferredEvmPaymentRequirementsExtraNewVoucherSchema
>;

// x402DeferredEvmPaymentRequirementsExtraAggregationVoucher
export const DeferredEvmPaymentRequirementsExtraAggregationVoucherSchema = z.object({
  type: z.literal("aggregation"),
  signature: z.string().regex(EvmSignatureRegex),
  voucher: DeferredEvmPayloadVoucherSchema,
});
export type DeferredEvmPaymentRequirementsExtraAggregationVoucher = z.infer<
  typeof DeferredEvmPaymentRequirementsExtraAggregationVoucherSchema
>;

// x402DeferredEvmPaymentRequirements
export const DeferredEvmPaymentRequirementsSchema = z.object({
  scheme: z.literal("deferred"),
  network: NetworkSchema,
  maxAmountRequired: z.string().refine(isInteger),
  resource: z.string().url(),
  description: z.string(),
  mimeType: z.string(),
  outputSchema: z.record(z.any()).optional(),
  payTo: z.string().regex(MixedAddressRegex),
  maxTimeoutSeconds: z.number().int(),
  asset: z.string().regex(MixedAddressRegex),
  extra: z.discriminatedUnion("type", [
    DeferredEvmPaymentRequirementsExtraNewVoucherSchema,
    DeferredEvmPaymentRequirementsExtraAggregationVoucherSchema,
  ]),
});
export type DeferredEvmPaymentRequirements = z.infer<typeof DeferredEvmPaymentRequirementsSchema>;
