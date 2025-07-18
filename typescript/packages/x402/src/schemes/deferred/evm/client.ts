import { Address, Chain, Hex, LocalAccount, Transport } from "viem";
import { isSignerWallet, SignerWallet } from "../../../types/shared/evm";
import { PaymentPayload, PaymentRequirements, UnsignedPaymentPayload } from "../../../types/verify";
import { signVoucher, verifyVoucher } from "./sign";
import { encodePayment } from "./utils/paymentUtils";
import {
  DeferredEvmPayloadVoucher,
  DeferredEvmPaymentRequirementsExtraAggregationVoucherSchema,
  DeferredEvmPaymentRequirementsExtraNewVoucherSchema,
  DeferredPaymentRequirementsSchema,
  UnsignedDeferredPaymentPayloadSchema,
} from "../../../types/verify/schemes/deferred";
import { getNetworkId } from "../../../shared/network";
import { DEFERRRED_SCHEME } from "../../../types/verify/schemes/deferred";

/**
 * Prepares an unsigned payment header with the given sender address and payment requirements.
 *
 * @param buyer - The sender's address from which the payment will be made
 * @param x402Version - The version of the X402 protocol to use
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @returns An unsigned payment payload containing authorization details
 */
export async function preparePaymentHeader(
  buyer: Address,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
): Promise<UnsignedPaymentPayload> {
  const deferredPaymentRequirements = DeferredPaymentRequirementsSchema.parse(paymentRequirements);

  const voucher =
    deferredPaymentRequirements.extra.type === "new"
      ? createNewVoucher(buyer, deferredPaymentRequirements)
      : await aggregateVoucher(buyer, deferredPaymentRequirements);

  return {
    x402Version,
    scheme: DEFERRRED_SCHEME,
    network: deferredPaymentRequirements.network,
    payload: {
      signature: undefined,
      voucher: voucher,
    },
  };
}

/**
 * Creates a new voucher with the given payment requirements
 *
 * @param buyer - The sender's address from which the payment will be made
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @returns The new voucher
 */
export function createNewVoucher(
  buyer: Address,
  paymentRequirements: PaymentRequirements,
): DeferredEvmPayloadVoucher {
  const extra = DeferredEvmPaymentRequirementsExtraNewVoucherSchema.parse(
    paymentRequirements.extra,
  );

  return {
    id: extra.voucher.id,
    buyer: buyer,
    seller: paymentRequirements.payTo,
    valueAggregate: paymentRequirements.maxAmountRequired,
    asset: paymentRequirements.asset,
    timestamp: Math.floor(Date.now() / 1000),
    nonce: 0,
    escrow: extra.voucher.escrow,
    chainId: getNetworkId(paymentRequirements.network),
  };
}

/**
 * Aggregates a voucher with new payment requirements
 *
 * @param buyer - The sender's address from which the payment will be made
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @returns The aggregated voucher
 */
export async function aggregateVoucher(
  buyer: Address,
  paymentRequirements: PaymentRequirements,
): Promise<DeferredEvmPayloadVoucher> {
  const extra = DeferredEvmPaymentRequirementsExtraAggregationVoucherSchema.parse(
    paymentRequirements.extra,
  );
  const { id, escrow, seller, valueAggregate, asset, nonce, chainId } = extra.voucher;

  // verify signature is valid and the voucher's buyer is the client
  const isValid = await verifyVoucher(extra.voucher, extra.signature as Hex, buyer);
  if (!isValid) {
    throw new Error("Invalid voucher signature");
  }

  // verify previous voucher matches payment requirements
  if (paymentRequirements.payTo !== seller) {
    throw new Error("Invalid voucher seller");
  }
  if (paymentRequirements.asset !== asset) {
    throw new Error("Invalid voucher asset");
  }
  if (getNetworkId(paymentRequirements.network) !== chainId) {
    throw new Error("Invalid voucher chainId");
  }

  return {
    id,
    buyer,
    seller,
    valueAggregate: (
      BigInt(paymentRequirements.maxAmountRequired) + BigInt(valueAggregate)
    ).toString(),
    asset,
    timestamp: Math.floor(Date.now() / 1000),
    nonce: nonce + 1,
    escrow,
    chainId,
  };
}

/**
 * Signs a payment header using the provided client and payment requirements.
 *
 * @param client - The signer wallet instance used to sign the payment header
 * @param unsignedPaymentPayload - The unsigned payment payload to be signed
 * @returns A promise that resolves to the signed payment payload
 */
export async function signPaymentHeader<transport extends Transport, chain extends Chain>(
  client: SignerWallet<chain, transport> | LocalAccount,
  unsignedPaymentPayload: UnsignedPaymentPayload,
): Promise<PaymentPayload> {
  const unsignedDeferredPaymentPayload =
    UnsignedDeferredPaymentPayloadSchema.parse(unsignedPaymentPayload);
  const { signature } = await signVoucher(client, unsignedDeferredPaymentPayload.payload.voucher);

  return {
    ...unsignedDeferredPaymentPayload,
    payload: {
      ...unsignedDeferredPaymentPayload.payload,
      signature,
    },
  };
}

/**
 * Creates a complete payment payload by preparing and signing a payment header.
 *
 * @param client - The signer wallet instance used to create and sign the payment
 * @param x402Version - The version of the X402 protocol to use
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @returns A promise that resolves to the complete signed payment payload
 */
export async function createPayment<transport extends Transport, chain extends Chain>(
  client: SignerWallet<chain, transport> | LocalAccount,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
): Promise<PaymentPayload> {
  const from = isSignerWallet(client) ? client.account!.address : client.address;
  const unsignedPaymentHeader = await preparePaymentHeader(from, x402Version, paymentRequirements);
  return signPaymentHeader(client, unsignedPaymentHeader);
}

/**
 * Creates and encodes a payment header for the given client and payment requirements.
 *
 * @param client - The signer wallet instance used to create the payment header
 * @param x402Version - The version of the X402 protocol to use
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @returns A promise that resolves to the encoded payment header string
 */
export async function createPaymentHeader(
  client: SignerWallet | LocalAccount,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
): Promise<string> {
  const payment = await createPayment(client, x402Version, paymentRequirements);
  return encodePayment(payment);
}
