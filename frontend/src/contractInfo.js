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

const MarketplaceABI = [
  "function listAuction(address nft, uint256 tokenId, uint256 minPriceWei, uint256 reservePriceWei, uint256 buyNowPriceWei, uint64 durationSeconds) returns (uint256)",
  "function listFixedPrice(address nft, uint256 tokenId, uint256 priceWei) returns (uint256)",
  "function bid(uint256 listingId) payable",
  "function buyNow(uint256 listingId) payable",
  "function buyFixedPrice(uint256 listingId) payable",
  "function cancel(uint256 listingId)",
  "function end(uint256 listingId)",
  "function reducePrice(uint256 listingId, uint256 newPriceWei)",
  "function withdraw()",
  "function getListing(uint256 listingId) view returns (address seller, address nft, uint256 tokenId, uint256 listingType, uint256 status, uint256 minPriceWei, uint256 reservePriceWei, uint256 buyNowPriceWei, uint256 highestBid, address highestBidder, uint256 endTime)",
  "function listingCount() view returns (uint256)",
  "function pendingWithdrawals(address) view returns (uint256)",
  "function platformFeeBps() view returns (uint256)",
  "function treasury() view returns (address)",
  "function getAuctionHistory(uint256) view returns (uint256 listingId, address nft, uint256 tokenId, address winner, uint256 winningBid, address seller, uint256 endTime)",
  "function getAuctionHistoryCount() view returns (uint256)",
  "function getActiveListingIds(uint256 offset, uint256 limit) view returns (uint256[])",
  "function getListingsBySeller(address seller, uint256 offset, uint256 limit) view returns (uint256[])",
  "event AuctionListed(address indexed seller, address indexed nft, uint256 indexed tokenId, uint256 listingId, uint256 minPriceWei, uint256 reservePriceWei, uint256 buyNowPriceWei, uint256 endTime)",
  "event FixedPriceListed(address indexed seller, address indexed nft, uint256 indexed tokenId, uint256 listingId, uint256 priceWei)",
  "event BidPlaced(address indexed bidder, uint256 indexed listingId, uint256 amount)",
  "event BuyNowPurchased(address indexed buyer, uint256 indexed listingId, uint256 amount)",
  "event AuctionExtended(uint256 indexed listingId, uint256 newEndTime)",
  "event ListingCanceled(address indexed caller, uint256 indexed listingId)",
  "event AuctionEnded(uint256 indexed listingId, address winner, uint256 winningBid, bool reserveMet)",
  "event FixedPriceSold(address indexed buyer, uint256 indexed listingId, uint256 priceWei)",
  "event FundsWithdrawn(address indexed account, uint256 amount)",
];

let cachedDeployment = null;

function isAddress(addr) {
  try { return ethers.isAddress(addr); } catch { return false; }
}

export async function getContractAddresses() {
  if (cachedDeployment) return cachedDeployment;

  try {
    const resp = await fetch("/deployment.json");
    if (resp.ok) {
      const data = await resp.json();
      if (data.contracts?.Minty?.address && data.contracts?.Marketplace?.address) {
        cachedDeployment = { Minty: data.contracts.Minty.address, Marketplace: data.contracts.Marketplace.address };
        return cachedDeployment;
      }
    }
  } catch {}

  const envMinty = import.meta.env.VITE_MINTY_ADDRESS;
  const envMarketplace = import.meta.env.VITE_MARKETPLACE_ADDRESS;
  if (envMinty && envMarketplace && isAddress(envMinty) && isAddress(envMarketplace)) {
    cachedDeployment = { Minty: envMinty, Marketplace: envMarketplace };
    return cachedDeployment;
  }

  return null;
}

export function getMintyContract(signerOrProvider) {
  const addr = cachedDeployment?.Minty;
  if (!addr) return null;
  return new ethers.Contract(addr, MintyABI, signerOrProvider);
}

export function getMarketplaceContract(signerOrProvider) {
  const addr = cachedDeployment?.Marketplace;
  if (!addr) return null;
  return new ethers.Contract(addr, MarketplaceABI, signerOrProvider);
}

export { MintyABI, MarketplaceABI };
