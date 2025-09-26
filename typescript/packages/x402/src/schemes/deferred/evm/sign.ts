import { Address, Chain, getAddress, Hex, LocalAccount, Transport } from "viem";
import {
  typedDataTypes,
  isAccount,
  isSignerWallet,
  SignerWallet,
  deferredVoucherPrimaryType,
  createConnectedClient,
} from "../../../types/shared/evm";
import { DeferredEvmPayloadVoucher } from "../../../types/verify/schemes/deferred";
import { getNetworkName } from "../../../shared";

/**
 * Signs a voucher
 *
 * @param walletClient - The wallet client that will sign the authorization
 * @param voucher - The voucher to sign
 * @returns The signature for the authorization
 */
export async function signVoucher<transport extends Transport, chain extends Chain>(
  walletClient: SignerWallet<chain, transport> | LocalAccount,
  voucher: DeferredEvmPayloadVoucher,
): Promise<{ signature: Hex }> {
  const { id, buyer, seller, valueAggregate, asset, timestamp, nonce, escrow, chainId, expiry } =
    voucher;
  const data = {
    types: typedDataTypes,
    primaryType: deferredVoucherPrimaryType,
    domain: {
      name: "DeferredPaymentEscrow",
      version: "1",
      chainId,
      verifyingContract: getAddress(escrow),
    },
    message: {
      id: id.toLowerCase(),
      buyer: getAddress(buyer),
      seller: getAddress(seller),
      valueAggregate,
      asset: getAddress(asset),
      timestamp,
      nonce,
      escrow: getAddress(escrow),
      chainId,
      expiry,
    },
  };

  if (isSignerWallet(walletClient)) {
    const signature = await walletClient.signTypedData(data);
    return {
      signature,
    };
  } else if (isAccount(walletClient) && walletClient.signTypedData) {
    const signature = await walletClient.signTypedData(data);
    return {
      signature,
    };
  } else {
    throw new Error("Invalid wallet client provided does not support signTypedData");
  }
}

/**
 * Verifies a voucher signature
 *
 * @param voucher - The voucher to verify
 * @param signature - The signature to verify
 * @param signer - The address of the signer to verify
 * @returns The address that signed the voucher
 */
export async function verifyVoucher(
  voucher: DeferredEvmPayloadVoucher,
  signature: Hex,
  signer: Address,
) {
  const voucherTypedData = {
    types: typedDataTypes,
    primaryType: deferredVoucherPrimaryType,
    domain: {
      name: "DeferredPaymentEscrow",
      version: "1",
      chainId: voucher.chainId,
      verifyingContract: getAddress(voucher.escrow),
    },
    message: voucher,
  };

  const client = createConnectedClient(getNetworkName(voucher.chainId));
  return await client.verifyTypedData({
    address: signer,
    ...voucherTypedData,
    signature: signature as Hex,
  });
}
