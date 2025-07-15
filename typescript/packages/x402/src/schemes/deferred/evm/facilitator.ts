import { Account, Address, Chain, getAddress, Hex, parseErc6492Signature, Transport } from "viem";
import { getNetworkId } from "../../../shared";
import { getERC20Balance } from "../../../shared/evm";
import {
  usdcABI as abi,
  typedDataTypes,
  ConnectedClient,
  SignerWallet,
  deferredVoucherPrimaryType,
} from "../../../types/shared/evm";
import { PaymentRequirements, SettleResponse, VerifyResponse } from "../../../types/verify";
import { SCHEME } from "../../deferred";
import { DeferredPaymentPayload } from "../../../types/verify/schemes/deferred";
import { deferredEscrowABI } from "../../../types/shared/evm/deferredEscrowABI";

/**
 * Verifies a payment payload against the required payment details
 *
 * This function performs several verification steps:
 * - ✅ Verify payload matches requirements
 *    - ✅ Verify scheme is deferred
 *    - ✅ Verify network matches payment requirements
 *    - ✅ Verify voucher value is enough to cover maxAmountRequired
 *    - ✅ Verify payTo is voucher seller
 *    - ✅ Verify voucher asset matches payment requirements
 * - ✅ Validates the signature is valid
 * - ✅ Validates the voucher chainId matches the chain specified in the payment requirements
 * - ✅ (on-chain) Verifies buyer has sufficient asset balance
 * - ✅ (on-chain) Verifies the voucher id has not been already claimed
 *
 * @param client - The public client used for blockchain interactions
 * @param payload - The signed payment payload containing transfer parameters and signature
 * @param paymentRequirements - The payment requirements that the payload must satisfy
 * @returns A ValidPaymentRequest indicating if the payment is valid and any invalidation reason
 */
export async function verify<
  transport extends Transport,
  chain extends Chain,
  account extends Account | undefined,
>(
  client: ConnectedClient<transport, chain, account>,
  payload: DeferredPaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<VerifyResponse> {
  // Verify payload matches requirements: scheme
  if (payload.scheme !== SCHEME || paymentRequirements.scheme !== SCHEME) {
    return {
      isValid: false,
      invalidReason: `unsupported_scheme`,
      payer: payload.payload.voucher.buyer,
    };
  }

  // Verify payload matches requirements: network
  if (payload.network !== paymentRequirements.network) {
    return {
      isValid: false,
      invalidReason: `invalid_network`,
      payer: payload.payload.voucher.buyer,
    };
  }

  // Verify payload matches requirements: maxAmountRequired -- value in payload is enough to cover paymentRequirements.maxAmountRequired
  if (BigInt(payload.payload.voucher.value) < BigInt(paymentRequirements.maxAmountRequired)) {
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_voucher_value",
      payer: payload.payload.voucher.buyer,
    };
  }

  // Verify payload matches requirements: payTo
  if (getAddress(payload.payload.voucher.seller) !== getAddress(paymentRequirements.payTo)) {
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_recipient_mismatch",
      payer: payload.payload.voucher.buyer,
    };
  }

  // Verify payload matches requirements: asset
  if (payload.payload.voucher.asset !== paymentRequirements.asset) {
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_asset_mismatch",
      payer: payload.payload.voucher.buyer,
    };
  }

  //Validates the voucher chainId matches the chain specified in the payment requirements
  let chainId: number;
  try {
    chainId = getNetworkId(paymentRequirements.network);
    if (chainId !== payload.payload.voucher.chainId) {
      throw new Error();
    }
  } catch {
    return {
      isValid: false,
      invalidReason: `invalid_deferred_evm_payload_chain_id`,
      payer: payload.payload.voucher.buyer,
    };
  }

  // Verify voucher signature is recoverable for the owner address
  const voucherTypedData = {
    types: typedDataTypes,
    primaryType: deferredVoucherPrimaryType,
    domain: {
      name: "VoucherEscrow",
      version: "1",
      chainId,
      verifyingContract: payload.payload.voucher.escrow as Address,
    },
    message: payload.payload.voucher,
  };
  const recoveredAddress = await client.verifyTypedData({
    address: payload.payload.voucher.buyer as Address,
    ...voucherTypedData,
    signature: payload.payload.signature as Hex,
  });
  if (!recoveredAddress) {
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_signature",
      payer: payload.payload.voucher.buyer,
    };
  }

  // Verify buyer has sufficient asset balance
  try {
    const balance = await getERC20Balance(
      client,
      payload.payload.voucher.asset as Address,
      payload.payload.voucher.buyer as Address,
    );
    if (balance < BigInt(payload.payload.voucher.value)) {
      throw new Error();
    }
  } catch {
    return {
      isValid: false,
      invalidReason: "insufficient_funds",
      payer: payload.payload.voucher.buyer,
    };
  }

  // Verify voucher id has not been already claimed
  try {
    const isCollected = await client.readContract({
      address: payload.payload.voucher.escrow as Address,
      abi: deferredEscrowABI,
      functionName: "isCollected",
      args: [payload.payload.voucher.id as Hex],
    });
    if (isCollected) {
      throw new Error();
    }
  } catch {
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_voucher_already_claimed",
      payer: payload.payload.voucher.buyer,
    };
  }

  return {
    isValid: true,
    invalidReason: undefined,
    payer: payload.payload.voucher.buyer,
  };
}

/**
 * Settles a payment by executing a USDC transferWithAuthorization transaction
 *
 * This function executes the actual USDC transfer using the signed authorization from the user.
 * The facilitator wallet submits the transaction but does not need to hold or transfer any tokens itself.
 *
 * @param wallet - The facilitator wallet that will submit the transaction
 * @param paymentPayload - The signed payment payload containing the transfer parameters and signature
 * @param paymentRequirements - The original payment details that were used to create the payload
 * @returns A PaymentExecutionResponse containing the transaction status and hash
 */
export async function settle<transport extends Transport, chain extends Chain>(
  wallet: SignerWallet<chain, transport>,
  paymentPayload: ExactPaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<SettleResponse> {
  // re-verify to ensure the payment is still valid
  const valid = await verify(wallet, paymentPayload, paymentRequirements);

  if (!valid.isValid) {
    return {
      success: false,
      network: paymentPayload.network,
      transaction: "",
      errorReason: valid.invalidReason ?? "invalid_scheme", //`Payment is no longer valid: ${valid.invalidReason}`,
      payer: paymentPayload.payload.authorization.from,
    };
  }

  // Returns the original signature (no-op) if the signature is not a 6492 signature
  const { signature } = parseErc6492Signature(paymentPayload.payload.signature as Hex);

  const tx = await wallet.writeContract({
    address: paymentRequirements.asset as Address,
    abi,
    functionName: "transferWithAuthorization" as const,
    args: [
      paymentPayload.payload.authorization.from as Address,
      paymentPayload.payload.authorization.to as Address,
      BigInt(paymentPayload.payload.authorization.value),
      BigInt(paymentPayload.payload.authorization.validAfter),
      BigInt(paymentPayload.payload.authorization.validBefore),
      paymentPayload.payload.authorization.nonce as Hex,
      signature,
    ],
    chain: wallet.chain as Chain,
  });

  const receipt = await wallet.waitForTransactionReceipt({ hash: tx });

  if (receipt.status !== "success") {
    return {
      success: false,
      errorReason: "invalid_transaction_state", //`Transaction failed`,
      transaction: tx,
      network: paymentPayload.network,
      payer: paymentPayload.payload.authorization.from,
    };
  }

  return {
    success: true,
    transaction: tx,
    network: paymentPayload.network,
    payer: paymentPayload.payload.authorization.from,
  };
}
