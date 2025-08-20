import { DeferredEvmPayloadSignedVoucher } from "../../../types/verify/schemes/deferred";

/**
 * Voucher store interface for deferred EVM schemes
 */
export abstract class VoucherStore {
  /**
   * Get a voucher by its ID, returning the voucher with the highest nonce for that ID.
   * Returns null if voucher id is not found.
   */
  abstract getVoucher(voucherId: string): Promise<DeferredEvmPayloadSignedVoucher | null>;

  /**
   * Mark a voucher as settled
   */
  abstract markVoucherSettled(voucherId: string): Promise<boolean>;
}
