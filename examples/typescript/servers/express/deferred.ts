#!/usr/bin/env node

/**
 * X402 Deferred Payment Joke Server - Simplified Example
 *
 * This is a minimal Express server demonstrating X402 deferred payment integration
 * 
 */

import express from "express";

// Configuration
const PORT = parseInt(process.env.PORT || "3002");
const GATEWAY_URL = process.env.GATEWAY_URL || "http://localhost:3001";
const PAYMENT_PRICE = process.env.PAYMENT_PRICE || "0.00001";
const PAYMENT_NETWORK = (process.env.PAYMENT_NETWORK as "base-sepolia" | "base") || "base-sepolia";
const PAYMENT_SELLER = process.env.PAYMENT_SELLER || "0xC93d37AD45c907eE1b27a02b2E1bd823BA9D379C";

// Simple joke collections
const FREE_JOKES = [
  "Why don't scientists trust atoms? Because they make up everything!",
  "Why did the scarecrow win an award? He was outstanding in his field!",
  "Why don't eggs tell jokes? They'd crack each other up!",
  "What do you call a fake noodle? An impasta!",
  "Why did the math book look so sad? Because it was full of problems!",
];

const PREMIUM_JOKES = [
  "Why don't programmers like nature? It has too many bugs!",
  "How many programmers does it take to change a light bulb? None – that's a hardware problem!",
  "Why do Java developers wear glasses? Because they don't see sharp!",
  "What's a computer's favorite beat? An algo-rhythm!",
  "Why did the developer go broke? Because he used up all his cache!",
  "How do you comfort a JavaScript bug? You console it!",
  "What do you call a programmer from Finland? Nerdic!",
  "Why do programmers prefer dark mode? Because light attracts bugs!",
];

// Helper functions
/**
 * Get a random joke from the list
 *
 * @param jokes - The list of jokes to choose from
 * @returns A random joke from the list
 */
function getRandomJoke(jokes: string[]): string {
  return jokes[Math.floor(Math.random() * jokes.length)];
}

/**
 * Convert a price in dollars to atomic units
 *
 * @param priceInDollars - The price in dollars
 * @returns The price in atomic units
 */
function priceToAtomicUnits(priceInDollars: string): string {
  const priceFloat = parseFloat(priceInDollars);
  const atomicUnits = Math.floor(priceFloat * 1000000); // USDC has 6 decimals
  return atomicUnits.toString();
}

// Create Express app
const app = express();

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Add request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Routes

// Root endpoint - Server info
app.get("/", (req, res) => {
  res.json({
    name: "X402 Deferred Payment Joke Server",
    version: "1.0.0",
    description: "A simple example demonstrating X402 deferred payments",
    endpoints: {
      freeJoke: "/free-joke",
      premiumJoke: "/premium-joke",
      health: "/health",
    },
    payment: {
      network: PAYMENT_NETWORK,
      price: `$${PAYMENT_PRICE}`,
      seller: PAYMENT_SELLER,
    },
  });
});

// Health check
app.get("/health", (_req, res) => {
  void (async () => {
    try {
      // Simple fetch to check gateway connectivity
      const response = await fetch(`${GATEWAY_URL}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });

      const gatewayHealthy = response.ok;

      res.status(gatewayHealthy ? 200 : 503).json({
        status: gatewayHealthy ? "healthy" : "unhealthy",
        gateway: {
          url: GATEWAY_URL,
          status: gatewayHealthy ? "connected" : "disconnected",
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      res.status(503).json({
        status: "unhealthy",
        gateway: {
          url: GATEWAY_URL,
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        },
        timestamp: new Date().toISOString(),
      });
    }
  })();
});

// Free joke endpoint
app.get("/free-joke", (req, res) => {
  const joke = getRandomJoke(FREE_JOKES);
  res.json({
    joke,
    type: "free",
    timestamp: new Date().toISOString(),
  });
});

// Premium joke endpoint (requires payment)
app.get("/premium-joke", (req, res) => {
  void (async () => {
    try {
      const paymentHeader = req.header("X-Payment");

      // Check for payment header
      if (!paymentHeader) {
        return res.status(402).json({
          error: "Payment required",
          code: "PAYMENT_REQUIRED",
          x402Version: 1,
          accepts: [
            {
              scheme: "deferred",
              network: PAYMENT_NETWORK,
              maxAmountRequired: priceToAtomicUnits(PAYMENT_PRICE),
              resource: `${req.protocol}://${req.get("host")}${req.originalUrl}`,
              description: `Premium joke access - $${PAYMENT_PRICE}`,
              mimeType: "application/json",
              payTo: PAYMENT_SELLER,
              maxTimeoutSeconds: 300,
              asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
              extra: {
                type: "new",
                voucher: {
                  id: `0x${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`.padEnd(
                    66,
                    "0",
                  ),
                  escrow: "0x1a9ea876cfe472514967d2e5cf326fb49dc68559", // TODO: Update with real escrow
                },
              },
            },
          ],
          timestamp: new Date().toISOString(),
        });
      }

      // Decode payment
      let decodedPayment;
      try {
        decodedPayment = deferred.evm.decodePayment(paymentHeader);
      } catch (error) {
        return res.status(400).json({
          error: "Invalid payment format",
          code: "INVALID_PAYMENT",
          details: error instanceof Error ? error.message : "Payment decoding failed",
          timestamp: new Date().toISOString(),
        });
      }

      // Verify scheme
      if (decodedPayment.scheme !== "deferred") {
        return res.status(400).json({
          error: `Invalid payment scheme. Expected 'deferred', got '${decodedPayment.scheme}'`,
          code: "INVALID_SCHEME",
          timestamp: new Date().toISOString(),
        });
      }

      // Create payment requirements for Gateway verification
      const paymentRequirements = {
        scheme: "deferred" as const,
        network: PAYMENT_NETWORK,
        maxAmountRequired: priceToAtomicUnits(PAYMENT_PRICE),
        resource: `${req.protocol}://${req.get("host")}${req.originalUrl}`,
        description: `Premium joke access - $${PAYMENT_PRICE}`,
        mimeType: "application/json",
        payTo: PAYMENT_SELLER,
        maxTimeoutSeconds: 300,
        asset:
          PAYMENT_NETWORK === "base-sepolia"
            ? "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
            : "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        extra: {
          type: "new" as const,
          voucher: {
            id: `0x${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`.padEnd(
              66,
              "0",
            ),
            escrow: "0x0000000000000000000000000000000000000000",
          },
        },
      };

      // Verify payment with Gateway
      console.log("Verifying payment with Gateway...");
      const verificationResult = await gatewayClient.verify(decodedPayment, paymentRequirements);

      if (!verificationResult.valid) {
        return res.status(402).json({
          error: "Payment verification failed",
          code: "VERIFICATION_FAILED",
          details: verificationResult.error,
          timestamp: new Date().toISOString(),
        });
      }

      // Payment verified successfully
      console.log("Payment verified successfully:", {
        isNewVoucher: verificationResult.gatewayDetails?.isNewVoucher,
        details:
          typeof verificationResult.gatewayDetails?.details === "string"
            ? verificationResult.gatewayDetails?.details
            : JSON.stringify(verificationResult.gatewayDetails?.details) || "No details provided",
      });

      // Return premium joke
      const joke = getRandomJoke(PREMIUM_JOKES);
      res.json({
        joke,
        type: "premium",
        price: `$${PAYMENT_PRICE}`,
        payment: {
          verified: true,
          isNewVoucher: verificationResult.gatewayDetails?.isNewVoucher,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      console.error("Premium joke endpoint error:", error);
      res.status(500).json({
        error: "Internal server error",
        code: "INTERNAL_ERROR",
        details: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      });
    }
  })();
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Not found",
    code: "NOT_FOUND",
    path: req.path,
    timestamp: new Date().toISOString(),
  });
});

// Error handler
app.use((error: Error, req: express.Request, res: express.Response) => {
  console.error("Unhandled error:", error);
  res.status(500).json({
    error: "Internal server error",
    code: "INTERNAL_ERROR",
    timestamp: new Date().toISOString(),
  });
});

// Start server
/**
 * Start the server
 */
async function startServer() {
  try {
    // Check Gateway connection on startup
    console.log("🔍 Checking Gateway connection...");
    try {
      const response = await fetch(`${GATEWAY_URL}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        console.log("✅ Gateway connection verified");
      } else {
        console.log("⚠️  Gateway connection failed - server will still start");
      }
    } catch {
      console.log("⚠️  Gateway connection error - server will still start");
    }

    // Start Express server
    const server = app.listen(PORT, () => {
      console.log(`🎭 X402 Deferred Payment Joke Server started`);
      console.log(`📍 Server: http://localhost:${PORT}`);
      console.log(`🌐 Network: ${PAYMENT_NETWORK}`);
      console.log(`💰 Price: $${PAYMENT_PRICE}`);
      console.log(`🔗 Gateway: ${GATEWAY_URL}`);
      console.log(`🔗 Seller: ${PAYMENT_SELLER}`);
      console.log("");
      console.log("Available endpoints:");
      console.log(`  GET  /            - Server info`);
      console.log(`  GET  /health      - Health check`);
      console.log(`  GET  /free-joke   - Get a free joke`);
      console.log(`  GET  /premium-joke - Get a premium joke (requires X-Payment header)`);
      console.log("");
      console.log(`Try: curl http://localhost:${PORT}/free-joke`);
    });

    // Graceful shutdown
    const gracefulShutdown = (signal: string) => {
      console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
      server.close(() => {
        console.log("✅ Server closed");
        process.exit(0);
      });
    };

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  void startServer();
}

// Export for testing
export { app, startServer };
