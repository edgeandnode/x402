# voucher specification

## Specification
An `EIP-712` signed message with the following data:

| Property   | Type     | Description |
|------------|----------|-------------|
| `id`       | `bytes32` | A unique identifier for an ongoing buyer-seller aggregation relationship. Used to prevent vouchers from being double claimed, and can also support simultaneous aggregations for parallel requests. |
| `buyer`    | `address` | Address of the payment initiator, i.e., the buyer agent. |
| `seller`   | `address` | Address of the payment recipient, i.e., the seller agent. |
| `valueAggregate` | `uint256` | The total outstanding amount owed. This value represents the amount the seller can collect on-chain from the buyer. It should be monotonically increasing with each voucher aggregation. |
| `asset`    | `address` | The ERC-20 token address representing the currency used in the voucher. |
| `timestamp`| `uint64`  | Timestamp when this voucher was last aggregated. |
| `nonce`    | `uint256` | A nonce for the voucher. Incremented each time the voucher is aggregated. |
| `escrow`   | `address` | Address of the escrow contract where the voucher can be collected at. |
| `chainId`  | `uint64`  | Chain id of the network where the voucher can be collected at. |

## Voucher Verification

### Smart contracts
- Verify the signature is valid
- Verify `chainId` matches the network chain id
- Verify `buyer` balance of `asset` is enough to cover `valueAggregate` in voucher
- Verify the `id` has not been used, or if it has, that the new balance is greater than what was already paid (in which case we'll pay the difference)

### Facilitator
1. Verify the signature is valid
2. Verify the `paymentPayload` matches the requirements set by `paymentRequirements`
    - Verify scheme is `"deferred"`
    - Verify `paymentPayload.network` matches `paymentRequirements.network`
    - Verify `paymentPayload.voucher.valueAggregate` is enough to cover `paymentRequirements.maxAmountRequired` plus previous voucher value aggregate if it's an aggregate voucher
    - Verify `paymentRequirements.payTo` matches `paymentPayload.voucher.seller`
    - Verify `paymentPayload.voucher.asset` matches `paymentRequirements.asset`
    - Validates the `paymentPayload.voucher.chainId` matches the chain specified by `paymentRequirements.network`
    - Validates the `paymentPayload.voucher.expiry` and `paymentPayload.voucher.timestamp` dates make sense
3. Verify the `buyer` has enough of the `asset` (ERC20 token) in the escrow to cover the valueAggregate in the `payload.voucher`
4. Verify `id` has not been already collected in the escrow, or if it has, that the new balance is greater than what was already paid (in which case we'll pay the difference)
5. (Optional, but recommended) Simulate the voucher collection to ensure the transaction would succeed

### Gateway
- If a voucher with the same `id` already exists, get the latest using `timestamp` and:
    - Verify `nonce` equals the previous `nonce + 1`
    - Verify `valueAggregate` is equal to the previous `valueAggregate + paymentRequirements.maxAmountRequired`
    - Verify `timestamp` is greater than the previous `timestamp`
    - Verify `buyer`, `seller`, `asset`, `escrow` and `chainId` all match the previous voucher values

### Seller
- Performs no verification, trusts the gateway

### Buyer
- When aggregating a voucher:
    - Verify the signature is valid
    - Verify the `seller`, `asset` and `chainId` in the previous voucher match the payment requirements
