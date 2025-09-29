import { AxiosError, AxiosInstance } from "axios";
import { Client, LocalAccount } from "viem";
import {
  createPaymentHeader,
  PaymentRequirementsSelector,
  selectPaymentRequirements,
} from "x402/client";
import {
  Signer,
  MultiNetworkSigner,
  isMultiNetworkSigner,
  isSvmSignerWallet,
  Network,
  ChainIdToNetwork,
  DeferredPaymentRequirementsSchema,
  DEFERRRED_SCHEME,
  evm,
  EXACT_SCHEME,
  PaymentRequirements,
  PaymentRequirementsSchema,
  Wallet,
} from "x402/types";
import {
  createPaymentHeader,
  PaymentRequirementsSelector,
  selectPaymentRequirements,
} from "x402/client";

/**
 * Enables the payment of APIs using the x402 payment protocol.
 *
 * When a request receives a 402 response:
 * 1. Extracts payment requirements from the response
 * 2. Creates a payment header using the provided wallet client
 * 3. Retries the original request with the payment header
 * 4. Exposes the X-PAYMENT-RESPONSE header in the final response
 *
 * @param axiosClient - The Axios instance to add the interceptor to
 * @param walletClient - A wallet client that can sign transactions and create payment headers
 * @param paymentRequirementsSelector - A function that selects the payment requirements from the response
 * @returns The modified Axios instance with the payment interceptor
 *
 * @example
 * ```typescript
 * const client = withPaymentInterceptor(
 *   axios.create(),
 *   signer
 * );
 *
 * // The client will automatically handle 402 responses
 * const response = await client.get('https://api.example.com/premium-content');
 * ```
 */
export function withPaymentInterceptor(
  axiosClient: AxiosInstance,
  walletClient: Signer | MultiNetworkSigner,
  paymentRequirementsSelector: PaymentRequirementsSelector = selectPaymentRequirements,
) {
  axiosClient.interceptors.response.use(
    response => response,
    async (error: AxiosError) => {
      if (!error.response || error.response.status !== 402) {
        return Promise.reject(error);
      }

      try {
        const originalConfig = error.config;
        if (!originalConfig || !originalConfig.headers) {
          return Promise.reject(new Error("Missing axios request configuration"));
        }

        if ((originalConfig as { __is402Retry?: boolean }).__is402Retry) {
          return Promise.reject(error);
        }

        const { x402Version, accepts } = error.response.data as {
          x402Version: number;
          accepts: PaymentRequirements[];
        };
        const parsed = accepts.map(x => PaymentRequirementsSchema.parse(x));

        const network = isMultiNetworkSigner(walletClient)
          ? undefined
          : evm.isSignerWallet(walletClient as typeof evm.EvmSigner)
            ? ChainIdToNetwork[(walletClient as typeof evm.EvmSigner).chain?.id]
            : isSvmSignerWallet(walletClient as Signer)
              ? (["solana", "solana-devnet"] as Network[])
              : undefined;

        const selectedPaymentRequirements = paymentRequirementsSelector(parsed, network, EXACT_SCHEME);
        const paymentHeader = await createPaymentHeader(
          walletClient,
          x402Version,
          selectedPaymentRequirements,
        );

        (originalConfig as { __is402Retry?: boolean }).__is402Retry = true;

        originalConfig.headers["X-PAYMENT"] = paymentHeader;
        originalConfig.headers["Access-Control-Expose-Headers"] = "X-PAYMENT-RESPONSE";

        const secondResponse = await axiosClient.request(originalConfig);
        return secondResponse;
      } catch (paymentError) {
        return Promise.reject(paymentError);
      }
    },
  );

  return axiosClient;
}

/**
 * Enables the payment of APIs using the x402 deferred payment protocol.
 *
 * When a request receives a 402 response:
 * 1. Extracts payment requirements from the response
 * 2. Creates a payment header using the provided wallet client
 * 3. Retries the original request with the payment header
 * 4. Exposes the X-PAYMENT-RESPONSE header in the final response
 *
 * @param axiosClient - The Axios instance to add the interceptor to
 * @param walletClient - A wallet client that can sign transactions and create payment headers
 * @param paymentRequirementsSelector - A function that selects the payment requirements from the response
 * @returns The modified Axios instance with the payment interceptor
 *
 * @example
 * ```typescript
 * const client = withDeferredPaymentInterceptor(
 *   axios.create(),
 *   signer
 * );
 *
 * // The client will automatically handle 402 responses
 * const response = await client.get('https://api.example.com/premium-content');
 * ```
 */
export function withDeferredPaymentInterceptor(
  axiosClient: AxiosInstance,
  walletClient: Wallet,
  paymentRequirementsSelector: PaymentRequirementsSelector = selectPaymentRequirements,
) {
  // intercept the request to send a `X-PAYMENT-BUYER` header with each request
  axiosClient.interceptors.request.use(
    async request => {
      const buyer =
        (walletClient as LocalAccount).address || (walletClient as Client).account?.address;
      if (buyer) {
        request.headers.set("X-PAYMENT-BUYER", buyer);
      }

      return request;
    },
    async (error: AxiosError) => error,
    {
      synchronous: true,
      runWhen() {
        return true;
      },
    },
  );
  axiosClient.interceptors.response.use(
    response => response,
    async (error: AxiosError) => {
      if (!error.response || error.response.status !== 402) {
        return Promise.reject(error);
      }

      try {
        const originalConfig = error.config;
        if (!originalConfig || !originalConfig.headers) {
          return Promise.reject(new Error("Missing axios request configuration"));
        }

        if ((originalConfig as { __is402Retry?: boolean }).__is402Retry) {
          return Promise.reject(error);
        }

        const { x402Version, accepts } = error.response.data as {
          x402Version: number;
          accepts: Array<PaymentRequirements>;
        };
        const parsed = accepts.map(x => PaymentRequirementsSchema.parse(x));

        const chainId = evm.isSignerWallet(walletClient) ? walletClient.chain?.id : undefined;

        const selectedPaymentRequirements = paymentRequirementsSelector(
          parsed,
          chainId ? ChainIdToNetwork[chainId] : undefined,
          DEFERRRED_SCHEME,
        );
        const selectedDeferredPaymentRequirements = DeferredPaymentRequirementsSchema.parse(
          selectedPaymentRequirements,
        );

        const paymentHeader = await createPaymentHeader(
          walletClient,
          x402Version,
          selectedDeferredPaymentRequirements,
        );

        (originalConfig as { __is402Retry?: boolean }).__is402Retry = true;

        originalConfig.headers["X-PAYMENT"] = paymentHeader;
        originalConfig.headers["Access-Control-Expose-Headers"] = "X-PAYMENT-RESPONSE";

        const paymentHeaderSignedResponse = await axiosClient.request(originalConfig);
        return paymentHeaderSignedResponse;
      } catch (paymentError) {
        return Promise.reject(paymentError);
      }
    },
  );

  return axiosClient;
}

export { decodeXPaymentResponse } from "x402/shared";
export { createSigner, type Signer, type MultiNetworkSigner } from "x402/types";
export type { Hex } from "viem";
