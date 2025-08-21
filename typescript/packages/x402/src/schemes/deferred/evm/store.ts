import { DeferredEvmPayloadSignedVoucher } from "../../../types/verify/schemes/deferred";

export type VoucherStoreActionResult = {
  success: boolean;
  error?: string;
};

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
   * Get the latest voucher by ( buyer, seller ) pair, returning the voucher with the highest nonce.
   * Returns null if no voucher is found.
   */
  abstract getVoucher(
    buyer: string,
    seller: string,
  ): Promise<DeferredEvmPayloadSignedVoucher | null>;

  /**
   * Get all vouchers by ( buyer, seller ) pair, returning the vouchers with the highest nonce.
   * Must support pagination via limit and offset.
   */
  abstract getVouchers(
    buyer: string,
    seller: string,
    limit?: number,
    offset?: number,
  ): Promise<Array<DeferredEvmPayloadSignedVoucher>>;

  /**
   * Store a voucher.
   * Must validate voucher signature.
   */
  abstract storeVoucher(
    voucher: DeferredEvmPayloadSignedVoucher,
    signature: string,
  ): Promise<VoucherStoreActionResult>;

  /**
   * Mark a voucher as settled
   */
  abstract markVoucherSettled(voucherId: string): Promise<VoucherStoreActionResult>;
}
