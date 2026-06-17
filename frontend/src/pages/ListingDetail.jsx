import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { ethers } from "ethers";
import { ipfsToHttp, timeLeft, shortenAddress, listingTypeLabel, listingStatusLabel, fetchTokenMetadata } from "../utils";
import { useToast } from "../ToastContext";

export default function ListingDetail({ signer, account, marketplace, loading, setLoading, loadListings, loadWithdrawBalance }) {
  const { id } = useParams();
  const toast = useToast();
  const [listing, setListing] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [bidAmount, setBidAmount] = useState("");
  const [imgError, setImgError] = useState(false);
  const now = Math.floor(Date.now() / 1000);

  useEffect(() => {
    async function load() {
      if (!marketplace) return;
      try {
        const l = await marketplace.getListing(Number(id));
        const mapped = {
          id: Number(id),
          seller: l[0], nft: l[1], tokenId: Number(l[2]),
          listingType: Number(l[3]), status: Number(l[4]),
          minPriceWei: l[5], reservePriceWei: l[6], buyNowPriceWei: l[7],
          highestBid: l[8], highestBidder: l[9], endTime: Number(l[10]),
        };
        setListing(mapped);

        const meta = await fetchTokenMetadata(await getTokenURI(mapped.nft, mapped.tokenId));
        if (meta) setMetadata(meta);
      } catch (err) {
        toast.error("Failed to load listing");
      }
    }
    load();
  }, [id, marketplace]);

  async function getTokenURI(nftAddr, tokenId) {
    try {
      const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
      const nft = new ethers.Contract(nftAddr, ["function tokenURI(uint256) view returns (string)"], provider);
      return await nft.tokenURI(tokenId);
    } catch {
      return null;
    }
  }

  if (!listing) {
    return <div className="loading-page"><div className="spinner" /><p>Loading listing...</p></div>;
  }

  const isActive = listing.status === 0;
  const isAuction = listing.listingType === 0;
  const isSeller = account && listing.seller.toLowerCase() === account.toLowerCase();
  const isWinning = account && listing.highestBidder && listing.highestBidder.toLowerCase() === account.toLowerCase();
  const canCancel = isActive && isSeller && (isAuction ? listing.highestBidder === ethers.ZeroAddress : true);
  const canEnd = isActive && now >= listing.endTime && isSeller;

  async function handleBid() {
    if (!bidAmount || parseFloat(bidAmount) <= 0) return toast.error("Enter a valid bid amount");
    setLoading(true);
    try {
      const tx = await marketplace.connect(signer).bid(listing.id, { value: ethers.parseEther(bidAmount) });
      await tx.wait();
      toast.success("Bid placed!");
      setBidAmount("");
      loadListings();
      loadWithdrawBalance();
    } catch (err) {
      toast.error(err.reason || err.message || "Bid failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleBuyNow() {
    setLoading(true);
    try {
      const tx = await marketplace.connect(signer).buyNow(listing.id, { value: listing.buyNowPriceWei });
      await tx.wait();
      toast.success("Purchased!");
      loadListings();
      loadWithdrawBalance();
    } catch (err) {
      toast.error(err.reason || err.message || "Purchase failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleBuyFixed() {
    setLoading(true);
    try {
      const tx = await marketplace.connect(signer).buyFixedPrice(listing.id, { value: listing.minPriceWei });
      await tx.wait();
      toast.success("Purchased!");
      loadListings();
      loadWithdrawBalance();
    } catch (err) {
      toast.error(err.reason || err.message || "Purchase failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel() {
    setLoading(true);
    try {
      const tx = await marketplace.connect(signer).cancel(listing.id);
      await tx.wait();
      toast.success("Listing canceled");
      loadListings();
    } catch (err) {
      toast.error(err.reason || err.message || "Cancel failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleEnd() {
    setLoading(true);
    try {
      const tx = await marketplace.connect(signer).end(listing.id);
      await tx.wait();
      toast.success("Auction ended");
      loadListings();
      loadWithdrawBalance();
    } catch (err) {
      toast.error(err.reason || err.message || "End failed");
    } finally {
      setLoading(false);
    }
  }

  const imageUrl = metadata?.image ? ipfsToHttp(metadata.image) : null;

  return (
    <div className="detail-page">
      <Link to="/" className="back-link">&larr; Back to listings</Link>
      <div className="detail-layout">
        <div className="detail-image-section">
          {imageUrl && !imgError ? (
            <img src={imageUrl} alt={metadata?.name || `NFT #${listing.tokenId}`} onError={() => setImgError(true)} className="detail-image" />
          ) : (
            <div className="detail-image-placeholder">
              <span>{isAuction ? "\uD83D\uDEE1\uFE0F" : "\uD83D\uDCE6"}</span>
              <p>{metadata?.name || `Token #${listing.tokenId}`}</p>
            </div>
          )}
          {metadata?.description && (
            <p className="detail-description">{metadata.description}</p>
          )}
        </div>

        <div className="detail-info-section">
          <div className="detail-header">
            <h1>{metadata?.name || `NFT #${listing.tokenId}`}</h1>
            <span className={`detail-status status-${listingStatusLabel(listing.status).toLowerCase()}`}>
              {listingStatusLabel(listing.status)}
            </span>
          </div>

          <div className="detail-type-badge">
            {listingTypeLabel(listing.listingType)}
          </div>

          <div className="detail-owner">
            <span className="detail-label">Seller</span>
            <span className="detail-value">{shortenAddress(listing.seller)}</span>
          </div>

          <div className="detail-owner">
            <span className="detail-label">NFT Contract</span>
            <span className="detail-value">{shortenAddress(listing.nft)}</span>
          </div>

          <div className="detail-owner">
            <span className="detail-label">Token ID</span>
            <span className="detail-value">#{listing.tokenId}</span>
          </div>

          {isAuction ? (
            <>
              <div className="detail-price-section">
                <div className="detail-price-item">
                  <span className="detail-label">Min Price</span>
                  <span className="detail-value highlight">{ethers.formatEther(listing.minPriceWei)} ETH</span>
                </div>
                {listing.reservePriceWei > 0n && (
                  <div className="detail-price-item">
                    <span className="detail-label">Reserve Price</span>
                    <span className="detail-value">{ethers.formatEther(listing.reservePriceWei)} ETH</span>
                  </div>
                )}
                {listing.buyNowPriceWei > 0n && (
                  <div className="detail-price-item">
                    <span className="detail-label">Buy Now</span>
                    <span className="detail-value highlight">{ethers.formatEther(listing.buyNowPriceWei)} ETH</span>
                  </div>
                )}
                <div className="detail-price-item">
                  <span className="detail-label">Highest Bid</span>
                  <span className="detail-value highlight">
                    {listing.highestBidder !== ethers.ZeroAddress
                      ? `${ethers.formatEther(listing.highestBid)} ETH`
                      : "No bids yet"}
                  </span>
                </div>
                {listing.highestBidder !== ethers.ZeroAddress && (
                  <div className="detail-price-item">
                    <span className="detail-label">Highest Bidder</span>
                    <span className="detail-value">{shortenAddress(listing.highestBidder)}</span>
                  </div>
                )}
                <div className="detail-price-item">
                  <span className="detail-label">Time Remaining</span>
                  <span className={`detail-value ${isActive && now >= listing.endTime ? "text-warn" : ""}`}>
                    {timeLeft(listing.endTime)}
                  </span>
                </div>
              </div>

              {isActive && account && (
                <div className="detail-actions">
                  {now < listing.endTime && (
                    <div className="bid-input-row">
                      <input type="number" step="0.01" min="0" placeholder="Bid amount (ETH)"
                        value={bidAmount} onChange={(e) => setBidAmount(e.target.value)} disabled={loading} />
                      <button className="btn btn-primary" onClick={handleBid} disabled={loading}>Place Bid</button>
                    </div>
                  )}
                  {listing.buyNowPriceWei > 0n && now < listing.endTime && (
                    <button className="btn btn-primary" onClick={handleBuyNow} disabled={loading}>
                      Buy Now for {ethers.formatEther(listing.buyNowPriceWei)} ETH
                    </button>
                  )}
                  {canEnd && (
                    <button className="btn btn-sm" onClick={handleEnd} disabled={loading}>End Auction</button>
                  )}
                  {canCancel && (
                    <button className="btn btn-sm btn-danger" onClick={handleCancel} disabled={loading}>Cancel Listing</button>
                  )}
                </div>
              )}

              {!isActive && isWinning && (
                <div className="winner-badge">
                  You won this auction!
                </div>
              )}
            </>
          ) : (
            <>
              <div className="detail-price-section">
                <div className="detail-price-item">
                  <span className="detail-label">Price</span>
                  <span className="detail-value highlight">{ethers.formatEther(listing.minPriceWei)} ETH</span>
                </div>
              </div>

              {isActive && account && !isSeller && (
                <div className="detail-actions">
                  <button className="btn btn-primary btn-lg" onClick={handleBuyFixed} disabled={loading}>
                    Buy for {ethers.formatEther(listing.minPriceWei)} ETH
                  </button>
                </div>
              )}

              {isActive && isSeller && (
                <div className="detail-actions">
                  <button className="btn btn-sm btn-danger" onClick={handleCancel} disabled={loading}>Cancel Listing</button>
                </div>
              )}
            </>
          )}

          {isWinning && (
            <div className="winning-badge">
              You are the highest bidder
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
