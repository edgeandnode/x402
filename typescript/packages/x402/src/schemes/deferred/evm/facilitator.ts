import {
  Account,
  Address,
  Chain,
  getAddress,
  Hex,
  encodeAbiParameters,
  parseAbiParameters,
  Transport,
} from "viem";
import { getNetworkId } from "../../../shared";
import { ConnectedClient, SignerWallet } from "../../../types/shared/evm";
import {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "../../../types/verify";
import {
  DeferredPaymentPayloadSchema,
  DEFERRRED_SCHEME,
} from "../../../types/verify/schemes/deferred";
import { deferredEscrowABI } from "../../../types/shared/evm/deferredEscrowABI";
import { verifyVoucher } from "./sign";

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
 * - ⌛ TODO: Simulate the transaction to ensure it will succeed
 *
 * @param client - The public client used for blockchain interactions
 * @param paymentPayload - The signed payment payload containing transfer parameters and signature
 * @param paymentRequirements - The payment requirements that the payload must satisfy
 * @returns A ValidPaymentRequest indicating if the payment is valid and any invalidation reason
 */
export async function verify<
  transport extends Transport,
  chain extends Chain,
  account extends Account | undefined,
>(
  client: ConnectedClient<transport, chain, account>,
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<VerifyResponse> {
  // Verify payload is a deferred payment payload - plus type assert to DeferredPaymentPayload
  paymentPayload = DeferredPaymentPayloadSchema.parse(paymentPayload);

  // Verify payload matches requirements: scheme
  if (paymentPayload.scheme !== DEFERRRED_SCHEME) {
    return {
      isValid: false,
      invalidReason: `invalid_deferred_evm_payload_scheme`,
    };
  }
  if (paymentRequirements.scheme !== DEFERRRED_SCHEME) {
    return {
      isValid: false,
      invalidReason: `invalid_deferred_evm_requirements_scheme`,
    };
  }
  if (paymentPayload.scheme !== paymentRequirements.scheme) {
    return {
      isValid: false,
      invalidReason: `invalid_deferred_evm_payload_requirements_scheme_mismatch`,
    };
  }

  // Verify payload matches requirements: network
  if (paymentPayload.network !== paymentRequirements.network) {
    return {
      isValid: false,
      invalidReason: `invalid_deferred_evm_payload_network_mismatch`,
      payer: paymentPayload.payload.voucher.buyer,
    };
  }

  // Verify payload matches requirements: maxAmountRequired -- new vouchers
  // value in voucher should be enough to cover paymentRequirements.maxAmountRequired
  if (paymentRequirements.extra.type === "new") {
    if (
      BigInt(paymentPayload.payload.voucher.valueAggregate) <
      BigInt(paymentRequirements.maxAmountRequired)
    ) {
      return {
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_voucher_value",
        payer: paymentPayload.payload.voucher.buyer,
      };
    }
  }

  // Verify payload matches requirements: maxAmountRequired -- aggregate vouchers
  // value in voucher should be enough to cover paymentRequirements.maxAmountRequired plus previous voucher value
  if (paymentRequirements.extra.type === "aggregation") {
    if (
      BigInt(paymentPayload.payload.voucher.valueAggregate) <
      BigInt(paymentRequirements.maxAmountRequired) +
        BigInt(paymentRequirements.extra.voucher.valueAggregate)
    ) {
      return {
        isValid: false,
        invalidReason: "invalid_deferred_evm_payload_voucher_value",
        payer: paymentPayload.payload.voucher.buyer,
      };
    }
  }

  // Verify payload matches requirements: payTo
  if (getAddress(paymentPayload.payload.voucher.seller) !== getAddress(paymentRequirements.payTo)) {
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_recipient_mismatch",
      payer: paymentPayload.payload.voucher.buyer,
    };
  }

  // Verify payload matches requirements: asset
  if (paymentPayload.payload.voucher.asset !== paymentRequirements.asset) {
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_asset_mismatch",
      payer: paymentPayload.payload.voucher.buyer,
    };
  }

  //Validates the voucher chainId matches the chain specified in the payment requirements
  let chainId: number;
  try {
    chainId = getNetworkId(paymentRequirements.network);
  } catch {
    return {
      isValid: false,
      invalidReason: `invalid_network_unsupported`,
      payer: paymentPayload.payload.voucher.buyer,
    };
  }
  if (chainId !== paymentPayload.payload.voucher.chainId) {
    return {
      isValid: false,
      invalidReason: `invalid_deferred_evm_payload_chain_id`,
      payer: paymentPayload.payload.voucher.buyer,
    };
  }

  // Verify voucher signature is recoverable for the owner address
  const voucherSignatureIsValid = await verifyVoucher(
    paymentPayload.payload.voucher,
    paymentPayload.payload.signature as Hex,
    paymentPayload.payload.voucher.buyer as Address,
  );
  if (!voucherSignatureIsValid) {
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_signature",
      payer: paymentPayload.payload.voucher.buyer,
    };
  }

  // Verify buyer has sufficient asset balance
  let balance: bigint;
  try {
    const account = await client.readContract({
      address: paymentPayload.payload.voucher.escrow as Address,
      abi: deferredEscrowABI,
      functionName: "accounts",
      args: [
        paymentPayload.payload.voucher.buyer as Address,
        paymentPayload.payload.voucher.seller as Address,
        paymentPayload.payload.voucher.asset as Address,
      ],
    });
    balance = account.balance;
  } catch {
    return {
      isValid: false,
      invalidReason: "insufficient_funds_contract_call_failed",
      payer: paymentPayload.payload.voucher.buyer,
    };
  }
  if (balance < BigInt(paymentPayload.payload.voucher.valueAggregate)) {
    return {
      isValid: false,
      invalidReason: "insufficient_funds",
      payer: paymentPayload.payload.voucher.buyer,
    };
  }

  // Verify voucher id has not been already claimed
  let isCollected: boolean;
  try {
    isCollected = await client.readContract({
      address: paymentPayload.payload.voucher.escrow as Address,
      abi: deferredEscrowABI,
      functionName: "isCollected",
      args: [paymentPayload.payload.voucher.id as Hex],
    });
  } catch {
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_voucher_contract_call_failed",
      payer: paymentPayload.payload.voucher.buyer,
    };
  }
  if (isCollected) {
    return {
      isValid: false,
      invalidReason: "invalid_deferred_evm_payload_voucher_already_claimed",
      payer: paymentPayload.payload.voucher.buyer,
    };
  }

  return {
    isValid: true,
    invalidReason: undefined,
    payer: paymentPayload.payload.voucher.buyer,
  };
}

/**
 * Settles a payment by executing a collect transaction on the deferred escrow contract
 *
 * This function executes the collect transaction using a signed voucher.
 * The facilitator wallet submits the transaction but does not need to hold or transfer any tokens itself.
 *
 * @param wallet - The facilitator wallet that will submit the transaction
 * @param paymentPayload - The signed payment payload containing the transfer parameters and signature
 * @param paymentRequirements - The original payment details that were used to create the payload
 * @returns A PaymentExecutionResponse containing the transaction status and hash
 */
export async function settle<transport extends Transport, chain extends Chain>(
  wallet: SignerWallet<chain, transport>,
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<SettleResponse> {
  // Verify payload is a deferred payment payload - plus type assert to DeferredPaymentPayload
  paymentPayload = DeferredPaymentPayloadSchema.parse(paymentPayload);

  // re-verify to ensure the payment is still valid
  const valid = await verify(wallet, paymentPayload, paymentRequirements);

  if (!valid.isValid) {
    return {
      success: false,
      network: paymentPayload.network,
      transaction: "",
      errorReason: valid.invalidReason ?? "invalid_deferred_evm_payload_no_longer_valid",
      payer: paymentPayload.payload.voucher.buyer,
    };
  }

  const { voucher, signature } = paymentPayload.payload;

  const abiTypes = parseAbiParameters(
    "(tuple(bytes32 id, address buyer, address seller, uint256 value, address asset, uint256 timestamp, uint256 nonce, address escrow, uint256 chainId) voucher, bytes signature)",
  );
  const encodedData = encodeAbiParameters(abiTypes, [[voucher, signature]]);
  const tx = await wallet.writeContract({
    address: voucher.escrow as Address,
    abi: deferredEscrowABI,
    functionName: "collect" as const,
    args: [encodedData],
    chain: wallet.chain as Chain,
  });

  const receipt = await wallet.waitForTransactionReceipt({ hash: tx });

  if (receipt.status !== "success") {
    return {
      success: false,
      errorReason: "invalid_transaction_state",
      transaction: tx,
      network: paymentPayload.network,
      payer: paymentPayload.payload.voucher.buyer,
    };
  }

  return {
    success: true,
    transaction: tx,
    network: paymentPayload.network,
    payer: paymentPayload.payload.voucher.buyer,
  };
}
