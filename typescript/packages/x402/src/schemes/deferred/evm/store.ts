import { DeferredEvmPayloadSignedVoucher } from "../../../types/verify/schemes/deferred";

export type VoucherStoreActionResult = {
  success: boolean;
  error?: string;
};

/**
 * Voucher store interface for deferred EVM schemes
 *
 * Note:
 * - A `voucher` is uniquely identified by the pair (id, nonce).
 * - A `voucher series` is a set of vouchers that share the same id but with different nonces.
 */
export abstract class VoucherStore {
  /**
   * Get a voucher by its (id, nonce). If nonce is not provided, returns the voucher with the highest nonce for that id.
   * Returns null if voucher id is not found.
   */
  abstract getVoucher(id: string, nonce?: number): Promise<DeferredEvmPayloadSignedVoucher | null>;

  /**
   * Get a voucher series by their id (all nonces).
   * Returns results sorted by nonce in descending order.
   * Must support pagination via limit and offset.
   */
  abstract getVoucherSeries(
    id: string,
    pagination: {
      limit?: number;
      offset?: number;
    },
  ): Promise<Array<DeferredEvmPayloadSignedVoucher>>;

  /**
   * Get all vouchers that match the provided query.
   * If latest is true, returns only the highest nonce for each voucher id.
   * Must support pagination via limit and offset.
   */
  abstract getVouchers(
    query: {
      buyer?: string;
      seller?: string;
      latest?: boolean;
    },
    pagination: {
      limit?: number;
      offset?: number;
    },
  ): Promise<Array<DeferredEvmPayloadSignedVoucher>>;

  /**
   * Get the latest available voucher for a given buyer and seller.
   * An available voucher satisfies the following conditions:
   * - The voucher matches the provided buyer and seller
   * - The voucher has the highest nonce for that id
   * - The voucher has the greatest timestamp for all ids with the same buyer and seller
   * - The voucher is not currently locked by an ongoing request
   */
  abstract getAvailableVoucher(
    buyer: string,
    seller: string,
  ): Promise<DeferredEvmPayloadSignedVoucher | null>;

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
