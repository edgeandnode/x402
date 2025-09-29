# Scheme: `deferred`

## Summary

`deferred` is a scheme designed to support micro-payments between AI agents or automated clients. Unlike the `exact` scheme, which requires a payment to be executed immediately and fully on-chain, `deferred` allows clients to issue signed vouchers (IOUs) off-chain, which can later be aggregated and redeemed by the seller. This scheme enables payments smaller than the minimum feasible on-chain transaction cost.

`deferred` payment scheme requires the seller to store and manage the buyer's vouchers until their eventual on chain settlement. To simplify their setup sellers might choose to offload this task to trusted third parties providing these services, i.e facilitators.

## Example Use Cases

- An LLM paying to use a tool
- Any case where payments are smaller than on-chain settlement costs

## Appendix