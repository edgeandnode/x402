import {
  DeferredErrorResponse,
  DeferredEvmPayloadSignedVoucher,
  DeferredVoucherResponse,
  DeferredVouchersResponse,
  FacilitatorConfig,
  SettleResponse,
  VerifyResponse,
} from "../types";
import { DEFAULT_FACILITATOR_URL } from "./useFacilitator";

/**
 * Creates a facilitator client for interacting with the X402 payment facilitator service
 *
 * @param facilitator - The facilitator config to use. If not provided, the default facilitator will be used.
 * @returns An object containing verify and settle functions for interacting with the facilitator
 */
export function useDeferredFacilitator(facilitator?: FacilitatorConfig) {
  /**
   * Fetches a voucher by its id and nonce.
   *
   * @param id - The id of the voucher to fetch
   * @param nonce - The nonce of the voucher to fetch
   * @returns The voucher
   */
  async function getVoucher(id: string, nonce: number): Promise<DeferredVoucherResponse> {
    const url = facilitator?.url || DEFAULT_FACILITATOR_URL;

    const response = await fetch(`${url}/deferred/vouchers/${id}/${nonce}`);
    const responseJson = (await response.json()) as DeferredVoucherResponse;

    if (response.status !== 200 || "error" in responseJson) {
      const errorMessage =
        (responseJson as DeferredErrorResponse).error ||
        `Failed to fetch voucher history: ${response.statusText}`;
      throw new Error(errorMessage);
    }
    return responseJson;
  }

  /**
   * Fetches a voucher series by its id, sorted by nonce in descending order.
   *
   * @param id - The id of the voucher to fetch
   * @param pagination - The pagination parameters
   * @param pagination.limit - The maximum number of vouchers to return
   * @param pagination.offset - The offset to start from
   * @returns The vouchers
   */
  async function getVoucherSeries(
    id: string,
    pagination: {
      limit?: number;
      offset?: number;
    },
  ): Promise<DeferredVouchersResponse> {
    const url = facilitator?.url || DEFAULT_FACILITATOR_URL;
    const { limit, offset } = pagination;

    const params = new URLSearchParams();
    if (limit !== undefined) params.append("limit", limit.toString());
    if (offset !== undefined) params.append("offset", offset.toString());
    const queryString = params.toString();

    const response = await fetch(
      `${url}/deferred/vouchers/${id}${queryString ? `?${queryString}` : ""}`,
    );
    const responseJson = (await response.json()) as DeferredVouchersResponse;

    if (response.status !== 200 || "error" in responseJson) {
      const errorMessage =
        (responseJson as DeferredErrorResponse).error ||
        `Failed to fetch voucher history: ${response.statusText}`;
      throw new Error(errorMessage);
    }
    return responseJson;
  }

  /**
   * Fetches the latest voucher for a given buyer and seller
   *
   * @param query - The query parameters
   * @param query.buyer - The buyer address
   * @param query.seller - The seller address
   * @param query.latest - Whether to return the latest voucher for each id
   * @param pagination - The pagination parameters
   * @param pagination.limit - The maximum number of vouchers to return
   * @param pagination.offset - The offset to start from
   * @returns The vouchers
   */
  async function getVouchers(
    query: {
      buyer: string;
      seller: string;
      latest?: boolean;
    },
    pagination: {
      limit?: number;
      offset?: number;
    },
  ): Promise<DeferredVouchersResponse> {
    const url = facilitator?.url || DEFAULT_FACILITATOR_URL;
    const { buyer, seller, latest } = query;
    const { limit, offset } = pagination;

    const params = new URLSearchParams();
    if (limit !== undefined) params.append("limit", limit.toString());
    if (offset !== undefined) params.append("offset", offset.toString());
    if (latest !== undefined) params.append("latest", latest.toString());
    if (buyer !== undefined) params.append("buyer", buyer);
    if (seller !== undefined) params.append("seller", seller);
    const queryString = params.toString();

    const response = await fetch(`${url}/deferred/vouchers${queryString ? `?${queryString}` : ""}`);
    const responseJson = (await response.json()) as DeferredVouchersResponse;

    if (response.status !== 200 || "error" in responseJson) {
      const errorMessage =
        (responseJson as DeferredErrorResponse).error ||
        `Failed to fetch voucher history: ${response.statusText}`;
      throw new Error(errorMessage);
    }
    return responseJson;
  }

  /**
   * Fetches the latest available voucher for a given buyer and seller
   *
   * @param buyer - The buyer address
   * @param seller - The seller address
   * @returns The voucher
   */
  async function getAvailableVoucher(
    buyer: string,
    seller: string,
  ): Promise<DeferredVoucherResponse> {
    const url = facilitator?.url || DEFAULT_FACILITATOR_URL;

    const response = await fetch(`${url}/deferred/vouchers/available/${buyer}/${seller}`);
    const responseJson = (await response.json()) as DeferredVoucherResponse;

    // If the voucher is not found we don't throw, clients should just create a new voucher from scratch
    if (response.status === 404) {
      return {
        error: "voucher_not_found",
      };
    }

    if (response.status !== 200 || "error" in responseJson) {
      const errorMessage =
        (responseJson as DeferredErrorResponse).error ||
        `Failed to fetch available voucher: ${response.statusText}`;
      throw new Error(errorMessage);
    }

    return responseJson;
  }

  /**
   * Stores a voucher in the facilitator
   *
   * @param voucher - The signedvoucher to store
   * @returns The result of the store operation
   */
  async function storeVoucher(
    voucher: DeferredEvmPayloadSignedVoucher,
  ): Promise<DeferredVoucherResponse> {
    const url = facilitator?.url || DEFAULT_FACILITATOR_URL;

    const response = await fetch(`${url}/deferred/vouchers`, {
      method: "POST",
      body: JSON.stringify(voucher),
      headers: {
        "Content-Type": "application/json",
      },
    });
    const responseJson = (await response.json()) as DeferredVoucherResponse;

    if (response.status !== 201 || "error" in responseJson) {
      const errorMessage =
        (responseJson as DeferredErrorResponse).error ||
        `Failed to store voucher: ${response.statusText}`;
      throw new Error(errorMessage);
    }

    return responseJson as DeferredVoucherResponse;
  }

  /**
   * Verifies a voucher signature and onchain state.
   *
   * @param id - The id of the voucher to verify
   * @param nonce - The nonce of the voucher to verify
   * @returns The verification result
   */
  async function verifyVoucher(id: string, nonce: number): Promise<VerifyResponse> {
    const url = facilitator?.url || DEFAULT_FACILITATOR_URL;

    const response = await fetch(`${url}/deferred/vouchers/${id}/${nonce}/verify`, {
      method: "POST",
    });
    const responseJson = await response.json();

    if (response.status !== 200) {
      const errorMessage = `Failed to verify voucher: ${response.statusText}`;
      throw new Error(errorMessage);
    }

    return responseJson as VerifyResponse;
  }

  /**
   * Settles a voucher by its id and nonce.
   *
   * @param id - The id of the voucher to settle
   * @param nonce - The nonce of the voucher to settle
   * @returns The settlement result
   */
  async function settleVoucher(id: string, nonce: number): Promise<SettleResponse> {
    const url = facilitator?.url || DEFAULT_FACILITATOR_URL;

    const response = await fetch(`${url}/deferred/vouchers/${id}/${nonce}/settle`, {
      method: "POST",
    });
    const responseJson = await response.json();

    if (response.status !== 200) {
      const errorMessage = `Failed to settle voucher: ${response.statusText}`;
      throw new Error(errorMessage);
    }

    return responseJson as SettleResponse;
  }

  return {
    getVoucher,
    getVouchers,
    getVoucherSeries,
    getAvailableVoucher,
    storeVoucher,
    verifyVoucher,
    settleVoucher,
  };
}
