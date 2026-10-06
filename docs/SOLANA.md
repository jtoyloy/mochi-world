# Solana

Configuration never guesses mint addresses. Real mode requires SOLANA_RPC_URL,
MOCHI_TOKEN_MINT, MOCHI_TREASURY_WALLET, MOCHI_TOKEN_DECIMALS and visible SOLANA_NETWORK.
Supported clusters are devnet and mainnet-beta. Startup verifies RPC genesis hash, standard
SPL mint ownership/type and decimals. Mainnet additionally requires ALLOW_MAINNET_PAYMENTS=true.
MOCK_TOKEN_MODE=true is permitted only with DEV_MODE=true and represents no blockchain funds.

Connected wallets belong to game accounts. A five-minute nonce/account/wallet/origin-bound
message is signed using an injected wallet's signMessage; the server verifies Ed25519 and marks
the challenge used. A public key alone never establishes ownership; an address cannot be linked
to two accounts. No player secret, seed phrase or private key is requested/stored.

The optional wallet UI supports injected Phantom-compatible APIs. Solana Pay transfer links
let the user sign in their wallet; devnet requires the wallet to be set to devnet. Confirmed
signatures are submitted for independent verification. Integrated transaction construction,
wallet-adapter matrix and fully automated confirmation UX remain follow-ups. No actual
Solana payment was submitted in development validation; verifier tests use mocked RPC fixtures.

Official RPC references: https://solana.com/docs/rpc/http/gettransaction and
https://solana.com/docs/rpc/json-structures
