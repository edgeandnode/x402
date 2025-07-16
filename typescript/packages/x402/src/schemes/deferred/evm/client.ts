import { Address, Chain, Hex, LocalAccount, Transport } from "viem";
import { isSignerWallet, SignerWallet } from "../../../types/shared/evm";
import { PaymentRequirements } from "../../../types/verify";
import { signVoucher, verifyVoucher } from "./sign";
import { encodePayment } from "./utils/paymentUtils";
import {
  DeferredEvmPayloadVoucher,
  DeferredEvmPaymentRequirementsExtraAggregationVoucherSchema,
  DeferredEvmPaymentRequirementsExtraNewVoucherSchema,
  DeferredEvmPaymentRequirements,
  DeferredEvmPaymentRequirementsSchema,
  DeferredPaymentPayload,
  UnsignedDeferredPaymentPayload,
} from "../../../types/verify/schemes/deferred";
import { getNetworkId } from "../../../shared/network";

/**
 * Prepares an unsigned payment header with the given sender address and payment requirements.
 *
 * @param from - The sender's address from which the payment will be made
 * @param x402Version - The version of the X402 protocol to use
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @returns An unsigned payment payload containing authorization details
 */
export async function preparePaymentHeader(
  from: Address,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
): Promise<UnsignedDeferredPaymentPayload> {
  const deferredPaymentRequirements =
    DeferredEvmPaymentRequirementsSchema.parse(paymentRequirements);

  const voucher =
    deferredPaymentRequirements.extra.type === "new"
      ? createNewVoucher(from, deferredPaymentRequirements)
      : await aggregateVoucher(from, deferredPaymentRequirements);

  return {
    x402Version,
    scheme: "deferred",
    network: paymentRequirements.network,
    payload: {
      signature: undefined,
      voucher: voucher,
    },
  };
}

/**
 * Creates a new voucher with the given payment requirements
 *
 * @param from - The sender's address from which the payment will be made
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @returns The new voucher
 */
export function createNewVoucher(
  from: Address,
  paymentRequirements: DeferredEvmPaymentRequirements,
): DeferredEvmPayloadVoucher {
  const extra = DeferredEvmPaymentRequirementsExtraNewVoucherSchema.parse(
    paymentRequirements.extra,
  );

  return {
    id: extra.voucher.id,
    buyer: from,
    seller: paymentRequirements.payTo,
    value: paymentRequirements.maxAmountRequired,
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
 * @param from - The sender's address from which the payment will be made
 * @param paymentRequirements - The payment requirements containing scheme and network information
 * @returns The aggregated voucher
 */
export async function aggregateVoucher(
  from: Address,
  paymentRequirements: DeferredEvmPaymentRequirements,
): Promise<DeferredEvmPayloadVoucher> {
  const extra = DeferredEvmPaymentRequirementsExtraAggregationVoucherSchema.parse(
    paymentRequirements.extra,
  );

  // verify signature is valid and the voucher's buyer is the client
  const isValid = await verifyVoucher(extra.voucher, extra.signature as Hex, from);
  if (!isValid) {
    throw new Error("Invalid voucher signature");
  }

  const { id, escrow, buyer, seller, value, asset, nonce, chainId } = extra.voucher;
  const newTimestamp = Math.floor(Date.now() / 1000);

  return {
    id,
    buyer,
    seller,
    value: (BigInt(paymentRequirements.maxAmountRequired) + BigInt(value)).toString(),
    asset,
    timestamp: newTimestamp,
    nonce: nonce + 1,
    escrow,
    chainId,
  };
}

/**
 * Signs a payment header using the provided client and payment requirements.
 *
 * @param client - The signer wallet instance used to sign the payment header
 * @param unsignedPaymentHeader - The unsigned payment payload to be signed
 * @returns A promise that resolves to the signed payment payload
 */
export async function signPaymentHeader<transport extends Transport, chain extends Chain>(
  client: SignerWallet<chain, transport> | LocalAccount,
  unsignedPaymentHeader: UnsignedDeferredPaymentPayload,
): Promise<DeferredPaymentPayload> {
  const { signature } = await signVoucher(client, unsignedPaymentHeader.payload.voucher);

  return {
    ...unsignedPaymentHeader,
    payload: {
      ...unsignedPaymentHeader.payload,
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
): Promise<DeferredPaymentPayload> {
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
