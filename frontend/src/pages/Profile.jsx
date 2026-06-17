import { useState, useEffect } from "react";
import { ethers } from "ethers";
import NFTCard from "../components/NFTCard";
import { shortenAddress } from "../utils";

export default function Profile({ signer, account, marketplace, minty, listings, loading, setLoading, loadListings, loadWithdrawBalance }) {
  const [nftBalance, setNftBalance] = useState(0);
  const [ownedTokens, setOwnedTokens] = useState([]);

  useEffect(() => {
    async function loadProfile() {
      if (!minty || !account) return;
      try {
        const bal = await minty.balanceOf(account);
        setNftBalance(Number(bal));
      } catch {}
    }
    loadProfile();
  }, [minty, account]);

  const myListings = listings.filter(
    (l) => l.seller.toLowerCase() === account?.toLowerCase()
  );
  const myBids = listings.filter(
    (l) => l.highestBidder && l.highestBidder.toLowerCase() === account?.toLowerCase()
  );
  const activeListings = myListings.filter((l) => l.status === 0);
  const wonListings = listings.filter(
    (l) => l.status === 1 && l.highestBidder && l.highestBidder.toLowerCase() === account?.toLowerCase()
  );

  return (
    <div className="profile-page">
      <div className="profile-header">
        <div className="profile-avatar">{shortenAddress(account)}</div>
        <div className="profile-stats">
          <div className="stat-card">
            <span className="stat-value">{nftBalance}</span>
            <span className="stat-label">NFTs Owned</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{activeListings.length}</span>
            <span className="stat-label">Active Listings</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{wonListings.length}</span>
            <span className="stat-label">Won</span>
          </div>
        </div>
      </div>

      <section className="section">
        <h2>My Active Listings ({activeListings.length})</h2>
        {activeListings.length === 0 ? (
          <p className="empty">No active listings. Create one on the home page!</p>
        ) : (
          <div className="nft-grid">
            {activeListings.map((l) => (
              <NFTCard key={l.id} listing={l} account={account} loading={loading} />
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <h2>My Bids ({myBids.length})</h2>
        {myBids.length === 0 ? (
          <p className="empty">No bids placed yet.</p>
        ) : (
          <div className="nft-grid">
            {myBids.filter((l) => l.status === 0).map((l) => (
              <NFTCard key={l.id} listing={l} account={account} loading={loading} />
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <h2>Won Auctions ({wonListings.length})</h2>
        {wonListings.length === 0 ? (
          <p className="empty">No auctions won yet.</p>
        ) : (
          <div className="nft-grid">
            {wonListings.map((l) => (
              <NFTCard key={l.id} listing={l} account={account} loading={loading} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
