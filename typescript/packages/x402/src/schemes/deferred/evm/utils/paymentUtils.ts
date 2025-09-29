import { safeBase64Encode, safeBase64Decode } from "../../../../shared";
import {
  ExactPaymentPayload,
  ExactPaymentPayloadSchema,
} from "../../../../types/verify/schemes/exact";

/**
 * Encodes a payment payload into a base64 string, ensuring bigint values are properly stringified
 *
 * @param payment - The payment payload to encode
 * @returns A base64 encoded string representation of the payment payload
 */
export function encodePayment(payment: ExactPaymentPayload): string {
  const safe = {
    ...payment,
    payload: {
      ...payment.payload,
      authorization: Object.fromEntries(
        Object.entries(payment.payload.authorization).map(([key, value]) => [
          key,
          typeof value === "bigint" ? (value as bigint).toString() : value,
        ]),
      ),
    },
  };
  return safeBase64Encode(JSON.stringify(safe));
}

/**
 * Decodes a base64 encoded payment string back into a PaymentPayload object
 *
 * @param payment - The base64 encoded payment string to decode
 * @returns The decoded and validated PaymentPayload object
 */
export function decodePayment(payment: string): ExactPaymentPayload {
  const decoded = safeBase64Decode(payment);
  const parsed = JSON.parse(decoded);

  const obj = {
    ...parsed,
    payload: {
      signature: parsed.payload.signature,
      authorization: {
        ...parsed.payload.authorization,
        value: parsed.payload.authorization.value,
        validAfter: parsed.payload.authorization.validAfter,
        validBefore: parsed.payload.authorization.validBefore,
      },
    },
  };

  const validated = ExactPaymentPayloadSchema.parse(obj);
  return validated;
}
