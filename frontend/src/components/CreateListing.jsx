import { useState } from "react";

export default function CreateListing({ signer, onApprove, onList, loading }) {
  const [step, setStep] = useState("form");
  const [tokenId, setTokenId] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [duration, setDuration] = useState("24");

  if (!signer) return null;

  async function handleApprove() {
    if (!tokenId) return;
    await onApprove(tokenId);
    setStep("list");
  }

  async function handleList() {
    if (!tokenId || !minPrice || !duration) return;
    await onList(tokenId, minPrice, duration);
    setStep("form");
    setTokenId("");
    setMinPrice("");
    setDuration("24");
  }

  return (
    <div className="panel">
      <h3>Create Listing</h3>
      <div className="panel-body">
        <label>
          Token ID
          <input
            type="number"
            min="1"
            step="1"
            value={tokenId}
            onChange={(e) => setTokenId(e.target.value)}
            disabled={loading || step === "done"}
          />
        </label>
        <label>
          Min Price (ETH)
          <input
            type="number"
            step="0.001"
            min="0"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            disabled={loading || step === "done"}
          />
        </label>
        <label>
          Duration (hours)
          <input
            type="number"
            step="0.5"
            min="0.1"
            max="336"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            disabled={loading || step === "done"}
          />
        </label>
        {step === "form" && (
          <button
            className="btn btn-primary"
            onClick={handleApprove}
            disabled={loading || !tokenId}
          >
            {loading ? "Approving..." : "1. Approve Auction Contract"}
          </button>
        )}
        {step === "list" && (
          <button
            className="btn btn-primary"
            onClick={handleList}
            disabled={loading}
          >
            {loading ? "Listing..." : "2. List NFT for Auction"}
          </button>
        )}
      </div>
    </div>
  );
}
