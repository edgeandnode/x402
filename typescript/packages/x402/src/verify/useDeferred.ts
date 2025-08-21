import { DeferredErrorResponse, DeferredVouchersResponse, FacilitatorConfig } from "../types";
import { DEFAULT_FACILITATOR_URL } from "./useFacilitator";

/**
 * Creates a facilitator client for interacting with the X402 payment facilitator service
 *
 * @param facilitator - The facilitator config to use. If not provided, the default facilitator will be used.
 * @returns An object containing verify and settle functions for interacting with the facilitator
 */
export function useDeferredFacilitator(facilitator?: FacilitatorConfig) {
  /**
   * Fetches voucher history for a given buyer and seller
   *
   * @param buyer - The buyer address
   * @param seller - The seller address
   * @param limit - The maximum number of vouchers to return
   * @param offset - The offset to start from
   * @returns The voucher history
   */
  async function getVouchers(
    buyer: string,
    seller: string,
    limit?: number,
    offset?: number,
  ): Promise<DeferredVouchersResponse> {
    const url = facilitator?.url || DEFAULT_FACILITATOR_URL;

    const params = new URLSearchParams();
    if (limit !== undefined) params.append("limit", limit.toString());
    if (offset !== undefined) params.append("offset", offset.toString());
    const queryString = params.toString();

    const response = await fetch(
      `${url}/deferred/vouchers/history/${buyer}/${seller}${queryString ? `?${queryString}` : ""}`,
    );
    const responseJson = await response.json();

    if (response.status !== 200) {
      const errorMessage =
        (responseJson as DeferredErrorResponse).error ||
        `Failed to fetch voucher history: ${response.statusText}`;
      throw new Error(errorMessage);
    }
    return responseJson as DeferredVouchersResponse;
  }

  return {
    getVouchers,
  };
}
