import { useState } from "react";
import { ethers } from "ethers";

const STATUS_LABELS = { 0: "Active", 1: "Ended", 2: "Canceled" };

function timeLeft(endTime, now) {
  if (endTime <= now) return "Ended";
  const diff = endTime - now;
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function ListingCard({
  listing,
  now,
  account,
  onBid,
  onCancel,
  onEnd,
  loading,
  showError,
}) {
  const [bidAmount, setBidAmount] = useState("");
  const isActive = listing.status === 0;
  const canCancel = isActive && listing.seller.toLowerCase() === account?.toLowerCase() && listing.highestBidder === ethers.ZeroAddress;
  const canEnd =
    isActive &&
    now >= listing.endTime &&
    listing.seller.toLowerCase() === account?.toLowerCase();
  const hasEnded = listing.status === 1;
  const isSeller =
    listing.seller.toLowerCase() === account?.toLowerCase();
  const isWinner =
    hasEnded &&
    listing.highestBidder.toLowerCase() === account?.toLowerCase();

  async function handleBid() {
    if (!bidAmount || parseFloat(bidAmount) <= 0) {
      showError("Enter a valid bid amount");
      return;
    }
    await onBid(listing.id, bidAmount);
    setBidAmount("");
  }

  return (
    <div className={`listing-card ${STATUS_LABELS[listing.status].toLowerCase()}`}>
      <div className="card-header">
        <span className="card-id">Listing #{listing.id}</span>
        <span className={`card-status status-${STATUS_LABELS[listing.status].toLowerCase()}`}>
          {STATUS_LABELS[listing.status]}
        </span>
      </div>
      <div className="card-body">
        <div className="card-field">
          <span className="field-label">NFT</span>
          <span className="field-value">{listing.nft.slice(0, 10)}... #{listing.tokenId}</span>
        </div>
        <div className="card-field">
          <span className="field-label">Seller</span>
          <span className="field-value">{listing.seller.slice(0, 6)}...{listing.seller.slice(-4)}</span>
        </div>
        <div className="card-field">
          <span className="field-label">Min Price</span>
          <span className="field-value">{ethers.formatEther(listing.minPriceWei)} ETH</span>
        </div>
        <div className="card-field">
          <span className="field-label">Highest Bid</span>
          <span className="field-value highlight">
            {listing.highestBidder === ethers.ZeroAddress
              ? "None"
              : `${ethers.formatEther(listing.highestBid)} ETH`}
          </span>
        </div>
        {listing.highestBidder !== ethers.ZeroAddress && (
          <div className="card-field">
            <span className="field-label">High Bidder</span>
            <span className="field-value">
              {listing.highestBidder.slice(0, 6)}...{listing.highestBidder.slice(-4)}
            </span>
          </div>
        )}
        <div className="card-field">
          <span className="field-label">Time</span>
          <span className={`field-value ${isActive && now >= listing.endTime ? "text-warn" : ""}`}>
            {timeLeft(listing.endTime, now)}
          </span>
        </div>
      </div>
      <div className="card-actions">
        {isActive && now < listing.endTime && (
          <div className="bid-row">
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="ETH"
              value={bidAmount}
              onChange={(e) => setBidAmount(e.target.value)}
              disabled={loading}
            />
            <button className="btn btn-primary btn-sm" onClick={handleBid} disabled={loading}>
              Bid
            </button>
          </div>
        )}
        {canEnd && (
          <button className="btn btn-sm" onClick={() => onEnd(listing.id)} disabled={loading}>
            End Auction
          </button>
        )}
        {canCancel && (
          <button className="btn btn-sm btn-danger" onClick={() => onCancel(listing.id)} disabled={loading}>
            Cancel
          </button>
        )}
        {isSeller && hasEnded && (
          <span className="badge badge-ok">You were the seller</span>
        )}
        {isWinner && (
          <span className="badge badge-ok">You won!</span>
        )}
      </div>
    </div>
  );
}
