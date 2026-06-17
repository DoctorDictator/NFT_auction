# NFT Auction

A portfolio-grade NFT auction platform with Solidity smart contracts and a React frontend. Supports native ETH auctions with anti-sniping time extensions, minimum bid increments, and pull-based refunds.

## Stack

- **Contracts**: Solidity 0.8.20, OpenZeppelin 5.x
- **Framework**: Hardhat, ethers v6
- **Frontend**: Vite + React 18, ethers v6
- **Testing**: Hardhat test, chai, hardhat-chai-matchers

## Quick Start

```bash
# Install contract dependencies
cd minty
npm install

# Start a local Hardhat node
npx hardhat node

# In another terminal, deploy contracts
npx hardhat run --network localhost scripts/deploy.js

# Run tests
npm test
```

## Frontend

```bash
# Install frontend dependencies
cd frontend
npm install

# Copy deployment artifact so the frontend can find contracts
cp ../minty/deployment.json public/

# Start dev server
npm run dev
```

Set `VITE_MINTY_ADDRESS` and `VITE_AUCTION_ADDRESS` environment variables if not using the deployment artifact.

## CLI (Minting)

```bash
# Link the CLI globally
cd minty
npm link

# Mint a new NFT
minty mint ./asset-path --name "Name" --description "Description"

# Show token info
minty show <token-id>

# Transfer a token
minty transfer <token-id> <to-address>
```

## Contracts

### Auction
- `list(nft, tokenId, minPriceWei, durationSeconds)` — Create an active listing after approval
- `bid(listingId)` — Place a bid (payable); enforces min price, 5% bid increment, and auction deadline
- `cancel(listingId)` — Cancel a listing; seller only, only before any bid
- `end(listingId)` — Finalize ended auction; sends NFT to winner (or back to seller if no bids)
- `withdraw()` — Pull-based refund/claim for outbid bidders and sellers
- Anti-sniping: a bid in the last 15 minutes extends the deadline by 15 minutes
- Max auction duration: 14 days

### Minty
- ERC721 with `MINTER_ROLE`-restricted minting
- Stores full `ipfs://...` URIs per token
- Deployer receives `DEFAULT_ADMIN_ROLE` and `MINTER_ROLE`

## Test

```bash
cd minty
npm test
```
