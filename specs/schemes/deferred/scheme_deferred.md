# Scheme: `deferred`

## Summary

`deferred` is a scheme designed to support micro-payments between AI agents or automated clients. Unlike the `exact` scheme, which requires a payment to be executed immediately and fully on-chain, `deferred` allows clients to issue signed vouchers (IOUs) off-chain, which can later be aggregated and redeemed by the seller. This scheme enables payments smaller than the minimum feasible on-chain transaction cost.

## Example Use Cases

- An LLM paying to use a tool

## Related Schemes

- **`deferred_paymaster`**: Extension that uses an intermediary Paymaster service to improve UX by eliminating buyer escrow management

## Appendix