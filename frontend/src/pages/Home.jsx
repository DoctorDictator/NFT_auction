import { useState, useEffect } from "react";
import { ethers } from "ethers";
import NFTCard from "../components/NFTCard";
import CreateListing from "../components/CreateListing";
import WithdrawPanel from "../components/WithdrawPanel";
import { useToast } from "../ToastContext";

export default function Home({ signer, account, marketplace, minty, loading, setLoading, loadListings, listings, loadWithdrawBalance, withdrawBalance }) {
  const toast = useToast();
  const [filterType, setFilterType] = useState("all");

  const now = Math.floor(Date.now() / 1000);

  const activeListings = listings.filter((l) => l.status === 0);
  const endedListings = listings.filter((l) => l.status !== 0);

  const filteredActive = filterType === "all" ? activeListings
    : filterType === "auction" ? activeListings.filter((l) => l.listingType === 0)
    : activeListings.filter((l) => l.listingType === 1);

  async function handleApprove(tokenId) {
    setLoading(true);
    try {
      const mintyContract = minty.connect(signer);
      const addrs = await mintyContract.getAddress();
      const marketplaceAddr = await marketplace.getAddress();
      const tx = await mintyContract.approve(marketplaceAddr, tokenId);
      await tx.wait();
      toast.success(`Approved Marketplace for token ${tokenId}`);
    } catch (err) {
      toast.error(err.reason || err.message || "Approve failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleListAuction(tokenId, minPriceEth, reserveEth, buyNowEth, durationHours) {
    setLoading(true);
    try {
      const mintyAddr = await minty.getAddress();
      const minWei = ethers.parseEther(minPriceEth);
      const reserveWei = reserveEth ? ethers.parseEther(reserveEth) : 0n;
      const buyNowWei = buyNowEth ? ethers.parseEther(buyNowEth) : 0n;
      const durSecs = BigInt(Math.round(parseFloat(durationHours) * 3600));
      const tx = await marketplace.connect(signer).listAuction(mintyAddr, tokenId, minWei, reserveWei, buyNowWei, durSecs);
      toast.loading("Listing auction...");
      await tx.wait();
      toast.success(`Listed token ${tokenId} for auction`);
      await loadListings();
    } catch (err) {
      toast.error(err.reason || err.message || "List failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleListFixed(tokenId, priceEth) {
    setLoading(true);
    try {
      const mintyAddr = await minty.getAddress();
      const priceWei = ethers.parseEther(priceEth);
      const tx = await marketplace.connect(signer).listFixedPrice(mintyAddr, tokenId, priceWei);
      toast.loading("Listing for sale...");
      await tx.wait();
      toast.success(`Listed token ${tokenId} for ${priceEth} ETH`);
      await loadListings();
    } catch (err) {
      toast.error(err.reason || err.message || "List failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleBid(listingId, amountEth) {
    setLoading(true);
    try {
      const tx = await marketplace.connect(signer).bid(listingId, { value: ethers.parseEther(amountEth) });
      await tx.wait();
      toast.success(`Bid placed on listing ${listingId}`);
      await loadListings();
      await loadWithdrawBalance();
    } catch (err) {
      toast.error(err.reason || err.message || "Bid failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleBuyNow(listingId) {
    // handled in ListingDetail
  }

  async function handleCancel(listingId) {
    setLoading(true);
    try {
      const tx = await marketplace.connect(signer).cancel(listingId);
      await tx.wait();
      toast.success(`Listing ${listingId} canceled`);
      await loadListings();
    } catch (err) {
      toast.error(err.reason || err.message || "Cancel failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleEnd(listingId) {
    setLoading(true);
    try {
      const tx = await marketplace.connect(signer).end(listingId);
      await tx.wait();
      toast.success(`Listing ${listingId} ended`);
      await loadListings();
      await loadWithdrawBalance();
    } catch (err) {
      toast.error(err.reason || err.message || "End failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleWithdraw() {
    setLoading(true);
    try {
      const tx = await marketplace.connect(signer).withdraw();
      await tx.wait();
      toast.success("Funds withdrawn successfully");
      await loadWithdrawBalance();
    } catch (err) {
      toast.error(err.reason || err.message || "Withdraw failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="main-content">
      <section className="section">
        <div className="section-header">
          <h2>Active Listings ({activeListings.length})</h2>
          <div className="filter-row">
            <button className={`filter-btn ${filterType === "all" ? "active" : ""}`} onClick={() => setFilterType("all")}>All</button>
            <button className={`filter-btn ${filterType === "auction" ? "active" : ""}`} onClick={() => setFilterType("auction")}>Auctions</button>
            <button className={`filter-btn ${filterType === "fixed" ? "active" : ""}`} onClick={() => setFilterType("fixed")}>Fixed Price</button>
          </div>
        </div>
        {filteredActive.length === 0 ? (
          <p className="empty">No active listings. Create one below!</p>
        ) : (
          <div className="nft-grid">
            {filteredActive.map((l) => (
              <NFTCard key={l.id} listing={l} account={account} onBid={handleBid} onCancel={handleCancel} onEnd={handleEnd} loading={loading} />
            ))}
          </div>
        )}
      </section>

      {endedListings.length > 0 && (
        <section className="section">
          <h2>Past Listings</h2>
          <div className="nft-grid">
            {endedListings.map((l) => (
              <NFTCard key={l.id} listing={l} account={account} loading={loading} />
            ))}
          </div>
        </section>
      )}

      {signer && (
        <div className="panels">
          <CreateListing
            signer={signer}
            onApprove={handleApprove}
            onListAuction={handleListAuction}
            onListFixed={handleListFixed}
            loading={loading}
          />
          <WithdrawPanel balance={withdrawBalance} onWithdraw={handleWithdraw} loading={loading} />
        </div>
      )}
    </div>
  );
}
