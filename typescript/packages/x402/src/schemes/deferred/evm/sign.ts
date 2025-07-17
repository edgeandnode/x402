import { Address, Chain, getAddress, Hex, LocalAccount, Transport, verifyTypedData } from "viem";
import {
  typedDataTypes,
  isAccount,
  isSignerWallet,
  SignerWallet,
  deferredVoucherPrimaryType,
} from "../../../types/shared/evm";
import { DeferredEvmPayloadVoucher } from "../../../types/verify/schemes/deferred";

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
  const { id, buyer, seller, valueAggregate, asset, timestamp, nonce, escrow, chainId } = voucher;
  const data = {
    types: typedDataTypes,
    primaryType: deferredVoucherPrimaryType,
    domain: {
      name: "VoucherEscrow",
      version: "1",
      chainId,
      verifyingContract: getAddress(escrow),
    },
    message: {
      id,
      buyer,
      seller,
      valueAggregate,
      asset,
      timestamp,
      nonce,
      escrow,
      chainId,
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
      name: "VoucherEscrow",
      version: "1",
      chainId: voucher.chainId,
      verifyingContract: getAddress(voucher.escrow),
    },
    message: voucher,
  };

  // TODO: use client.verifyTypedData to support smart accounts
  return await verifyTypedData({
    address: signer,
    ...voucherTypedData,
    signature: signature as Hex,
  });
}
