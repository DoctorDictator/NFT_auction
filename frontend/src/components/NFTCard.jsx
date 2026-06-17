import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ethers } from "ethers";
import { ipfsToHttp, timeLeft, shortenAddress, listingTypeLabel, fetchTokenMetadata } from "../utils";

export default function NFTCard({ listing, account, onBid, onBuyNow, onBuyFixed, onCancel, onEnd, loading }) {
  const [bidAmount, setBidAmount] = useState("");
  const [metadata, setMetadata] = useState(null);
  const [imgError, setImgError] = useState(false);

  const { id, seller, nft, tokenId, listingType, status, minPriceWei, reservePriceWei, buyNowPriceWei, highestBid, highestBidder, endTime } = listing;

  const isActive = status === 0;
  const isAuction = listingType === 0;
  const isFixed = listingType === 1;
  const hasEnded = status === 1;
  const now = Math.floor(Date.now() / 1000);
  const isSeller = account && seller.toLowerCase() === account.toLowerCase();
  const isWinning = account && highestBidder && highestBidder.toLowerCase() === account.toLowerCase();
  const canCancel = isActive && isSeller && (isAuction ? highestBidder === ethers.ZeroAddress : true);
  const canEnd = isActive && now >= endTime && isSeller;
  const hasBuyNow = isAuction && isActive && buyNowPriceWei > 0n;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const resp = await fetch(`/api/metadata?nft=${nft}&tokenId=${tokenId}`);
        const data = await resp.json();
        if (!cancelled) setMetadata(data);
      } catch {
        if (!cancelled) setMetadata({ name: `#${tokenId}`, image: null });
      }
    }
    load();
    return () => { cancelled = true; };
  }, [nft, tokenId]);

  async function handleBid() {
    if (!bidAmount || parseFloat(bidAmount) <= 0) return;
    await onBid(id, bidAmount);
    setBidAmount("");
  }

  const imageUrl = metadata?.image ? ipfsToHttp(metadata.image) : null;

  return (
    <Link to={`/listing/${id}`} className="nft-card-link">
      <div className={`nft-card ${hasEnded ? "ended" : ""}`}>
        <div className="nft-image-wrapper">
          {imageUrl && !imgError ? (
            <img src={imageUrl} alt={metadata?.name || `Token #${tokenId}`} onError={() => setImgError(true)} className="nft-image" />
          ) : (
            <div className="nft-image-placeholder">
              <span className="placeholder-icon">{isAuction ? "\uD83D\uDEE1\uFE0F" : "\uD83D\uDCE6"}</span>
            </div>
          )}
          {isActive && isAuction && (
            <span className="nft-badge badge-auction">Auction</span>
          )}
          {isActive && isFixed && (
            <span className="nft-badge badge-fixed">Fixed Price</span>
          )}
          {!isActive && (
            <span className={`nft-badge ${status === 1 ? "badge-ended" : "badge-canceled"}`}>
              {status === 1 ? "Ended" : "Canceled"}
            </span>
          )}
        </div>
        <div className="nft-info">
          <div className="nft-name">{metadata?.name || `NFT #${tokenId}`}</div>
          <div className="nft-seller">{shortenAddress(seller)}</div>
          <div className="nft-price-row">
            {isAuction && (
              <>
                <span className="price-label">
                  {highestBidder !== ethers.ZeroAddress ? "Highest Bid" : "Min Bid"}
                </span>
                <span className="price-value">
                  {ethers.formatEther(highestBidder !== ethers.ZeroAddress ? highestBid : minPriceWei)} ETH
                </span>
              </>
            )}
            {isFixed && (
              <>
                <span className="price-label">Price</span>
                <span className="price-value">{ethers.formatEther(minPriceWei)} ETH</span>
              </>
            )}
          </div>
          {isActive && isAuction && (
            <div className="nft-time">
              {now < endTime ? `Ends ${timeLeft(endTime)}` : "Ending soon"}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
