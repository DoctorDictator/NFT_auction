import { ethers } from "ethers";

const MintyABI = [
  "function mintToken(address to, string memory uri) returns (uint256)",
  "function tokenURI(uint256 tokenId) view returns (string memory)",
  "function approve(address to, uint256 tokenId)",
  "function getApproved(uint256 tokenId) view returns (address)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function balanceOf(address owner) view returns (uint256)",
  "function setApprovalForAll(address operator, bool approved)",
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
  "function transferFrom(address from, address to, uint256 tokenId)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId)",
];

const AuctionABI = [
  "function list(address nft, uint256 tokenId, uint256 minPriceWei, uint64 durationSeconds) returns (uint256)",
  "function bid(uint256 listingId) payable",
  "function cancel(uint256 listingId)",
  "function end(uint256 listingId)",
  "function withdraw()",
  "function getListing(uint256 listingId) view returns (address seller, address nft, uint256 tokenId, uint256 minPriceWei, uint256 highestBid, address highestBidder, uint256 endTime, uint8 status)",
  "function listingCount() view returns (uint256)",
  "function pendingWithdrawals(address) view returns (uint256)",
  "function MIN_BID_INCREMENT_PERCENT() view returns (uint256)",
  "event Listed(address indexed seller, address indexed nft, uint256 indexed tokenId, uint256 listingId, uint256 minPriceWei, uint256 endTime)",
  "event BidPlaced(address indexed bidder, uint256 indexed listingId, uint256 amount)",
  "event AuctionExtended(uint256 indexed listingId, uint256 newEndTime)",
  "event AuctionCanceled(uint256 indexed listingId)",
  "event AuctionEnded(uint256 indexed listingId, address winner, uint256 winningBid)",
  "event FundsWithdrawn(address indexed account, uint256 amount)",
];

let cachedDeployment = null;

function isAddress(addr) {
  try {
    return ethers.isAddress(addr);
  } catch {
    return false;
  }
}

export async function getContractAddresses() {
  if (cachedDeployment) return cachedDeployment;

  try {
    const resp = await fetch("/deployment.json");
    if (resp.ok) {
      const data = await resp.json();
      if (
        data.contracts?.Minty?.address &&
        data.contracts?.Auction?.address
      ) {
        cachedDeployment = {
          Minty: data.contracts.Minty.address,
          Auction: data.contracts.Auction.address,
        };
        return cachedDeployment;
      }
    }
  } catch {
    // fetch failed, fall through
  }

  const envMinty = import.meta.env.VITE_MINTY_ADDRESS;
  const envAuction = import.meta.env.VITE_AUCTION_ADDRESS;
  if (envMinty && envAuction && isAddress(envMinty) && isAddress(envAuction)) {
    cachedDeployment = { Minty: envMinty, Auction: envAuction };
    return cachedDeployment;
  }

  return null;
}

export function getMintyContract(signerOrProvider) {
  const addr = cachedDeployment?.Minty;
  if (!addr) return null;
  return new ethers.Contract(addr, MintyABI, signerOrProvider);
}

export function getAuctionContract(signerOrProvider) {
  const addr = cachedDeployment?.Auction;
  if (!addr) return null;
  return new ethers.Contract(addr, AuctionABI, signerOrProvider);
}

export { MintyABI, AuctionABI };
