import { useState } from "react";
import { ethers } from "ethers";

export default function CreateListing({ signer, onApprove, onListAuction, onListFixed, loading }) {
  const [step, setStep] = useState("form");
  const [listingType, setListingType] = useState("auction");
  const [tokenId, setTokenId] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [reservePrice, setReservePrice] = useState("");
  const [buyNowPrice, setBuyNowPrice] = useState("");
  const [fixedPrice, setFixedPrice] = useState("");
  const [duration, setDuration] = useState("24");

  if (!signer) return null;

  async function handleApprove() {
    if (!tokenId) return;
    await onApprove(tokenId);
    setStep("list");
  }

  async function handleList() {
    if (listingType === "auction") {
      if (!tokenId || !minPrice || !duration) return;
      await onListAuction(tokenId, minPrice, reservePrice, buyNowPrice, duration);
    } else {
      if (!tokenId || !fixedPrice) return;
      await onListFixed(tokenId, fixedPrice);
    }
    setStep("form");
    setTokenId("");
    setMinPrice("");
    setReservePrice("");
    setBuyNowPrice("");
    setFixedPrice("");
    setDuration("24");
  }

  return (
    <div className="panel">
      <h3>Create Listing</h3>
      <div className="panel-body">
        <div className="listing-type-toggle">
          <button
            className={`toggle-btn ${listingType === "auction" ? "active" : ""}`}
            onClick={() => setListingType("auction")}
            disabled={loading}
          >
            Auction
          </button>
          <button
            className={`toggle-btn ${listingType === "fixed" ? "active" : ""}`}
            onClick={() => setListingType("fixed")}
            disabled={loading}
          >
            Fixed Price
          </button>
        </div>

        <label>
          Token ID
          <input type="number" min="1" step="1" value={tokenId}
            onChange={(e) => setTokenId(e.target.value)}
            disabled={loading || step === "done"} />
        </label>

        {listingType === "auction" ? (
          <>
            <label>
              Min Price (ETH)
              <input type="number" step="0.001" min="0" value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                disabled={loading || step === "done"} />
            </label>
            <label>
              Reserve Price (ETH, optional)
              <input type="number" step="0.001" min="0" value={reservePrice}
                onChange={(e) => setReservePrice(e.target.value)}
                disabled={loading || step === "done"} />
            </label>
            <label>
              Buy Now Price (ETH, optional)
              <input type="number" step="0.001" min="0" value={buyNowPrice}
                onChange={(e) => setBuyNowPrice(e.target.value)}
                disabled={loading || step === "done"} />
            </label>
            <label>
              Duration (hours)
              <input type="number" step="0.5" min="0.1" max="336" value={duration}
                onChange={(e) => setDuration(e.target.value)}
                disabled={loading || step === "done"} />
            </label>
          </>
        ) : (
          <label>
            Price (ETH)
            <input type="number" step="0.001" min="0" value={fixedPrice}
              onChange={(e) => setFixedPrice(e.target.value)}
              disabled={loading || step === "done"} />
          </label>
        )}

        {step === "form" && (
          <button className="btn btn-primary" onClick={handleApprove} disabled={loading || !tokenId}>
            {loading ? "Approving..." : "1. Approve Contract"}
          </button>
        )}
        {step === "list" && (
          <button className="btn btn-primary" onClick={handleList} disabled={loading}>
            {loading ? "Listing..." : `2. List for ${listingType === "auction" ? "Auction" : "Sale"}`}
          </button>
        )}
      </div>
    </div>
  );
}
