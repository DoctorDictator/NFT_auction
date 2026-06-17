import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { getContractAddresses, getMintyContract, getAuctionContract } from "./contractInfo";
import Header from "./components/Header";
import ListingCard from "./components/ListingCard";
import CreateListing from "./components/CreateListing";
import WithdrawPanel from "./components/WithdrawPanel";

const STATUS = { ACTIVE: 0, ENDED: 1, CANCELED: 2 };

export default function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [listings, setListings] = useState([]);
  const [withdrawBalance, setWithdrawBalance] = useState("0");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [contractsReady, setContractsReady] = useState(false);

  useEffect(() => {
    getContractAddresses().then((addrs) => {
      if (addrs) setContractsReady(true);
    });
  }, []);

  const showError = useCallback((msg) => {
    setError(msg);
    setTimeout(() => setError(""), 6000);
  }, []);

  const showSuccess = useCallback((msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 4000);
  }, []);

  async function connectWallet() {
    if (!window.ethereum) {
      showError("Please install MetaMask or another wallet");
      return;
    }
    try {
      const p = new ethers.BrowserProvider(window.ethereum);
      const accs = await p.send("eth_requestAccounts", []);
      const s = await p.getSigner();
      const network = await p.getNetwork();
      setProvider(p);
      setSigner(s);
      setAccount(accs[0]);
      setChainId(Number(network.chainId));
    } catch (err) {
      showError(err.reason || err.message || "Failed to connect wallet");
    }
  }

  async function switchNetwork() {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x7A69" }],
      });
    } catch {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: "0x7A69",
            chainName: "Hardhat Local",
            rpcUrls: ["http://127.0.0.1:8545"],
            nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
          },
        ],
      });
    }
  }

  const loadListings = useCallback(async () => {
    if (!signer) return;
    try {
      const auction = getAuctionContract(signer);
      if (!auction) return;
      const count = Number(await auction.listingCount());
      const promises = [];
      for (let i = 0; i < count; i++) {
        promises.push(auction.getListing(i));
      }
      const raw = await Promise.all(promises);
      const mapped = raw.map((l, i) => ({
        id: i,
        seller: l[0],
        nft: l[1],
        tokenId: Number(l[2]),
        minPriceWei: l[3],
        highestBid: l[4],
        highestBidder: l[5],
        endTime: Number(l[6]),
        status: Number(l[7]),
      }));
      setListings(mapped);
    } catch (err) {
      showError("Failed to load listings: " + (err.reason || err.message));
    }
  }, [signer, showError]);

  useEffect(() => {
    if (signer) {
      loadListings();
      loadWithdrawBalance();
    }
  }, [signer, loadListings]);

  async function loadWithdrawBalance() {
    if (!signer || !account) return;
    try {
      const auction = getAuctionContract(signer);
      if (!auction) return;
      const bal = await auction.pendingWithdrawals(account);
      setWithdrawBalance(bal.toString());
    } catch {
      setWithdrawBalance("0");
    }
  }

  useEffect(() => {
    if (!window.ethereum) return;
    const handleAccountsChanged = (accs) => {
      if (accs.length === 0) {
        setAccount(null);
        setSigner(null);
        setProvider(null);
      }
    };
    const handleChainChanged = () => {
      window.location.reload();
    };
    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);
    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, []);

  async function handleApprove(tokenId) {
    setLoading(true);
    setError("");
    try {
      const minty = getMintyContract(signer);
      const auctionAddr = (await getContractAddresses()).Auction;
      const tx = await minty.approve(auctionAddr, tokenId);
      await tx.wait();
      showSuccess(`Approved Auction contract for token ${tokenId}`);
    } catch (err) {
      showError(err.reason || err.message || "Approve failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleList(tokenId, minPriceEth, durationHours) {
    setLoading(true);
    setError("");
    try {
      const auction = getAuctionContract(signer);
      const addr = (await getContractAddresses()).Minty;
      const minWei = ethers.parseEther(minPriceEth);
      const durSecs = BigInt(Math.round(parseFloat(durationHours) * 3600));
      const tx = await auction.list(addr, tokenId, minWei, durSecs);
      await tx.wait();
      showSuccess(`Listed token ${tokenId} for auction`);
      await loadListings();
    } catch (err) {
      showError(err.reason || err.message || "List failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleBid(listingId, amountEth) {
    setLoading(true);
    setError("");
    try {
      const auction = getAuctionContract(signer);
      const tx = await auction.bid(listingId, { value: ethers.parseEther(amountEth) });
      await tx.wait();
      showSuccess(`Bid placed on listing ${listingId}`);
      await loadListings();
      await loadWithdrawBalance();
    } catch (err) {
      showError(err.reason || err.message || "Bid failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(listingId) {
    setLoading(true);
    setError("");
    try {
      const auction = getAuctionContract(signer);
      const tx = await auction.cancel(listingId);
      await tx.wait();
      showSuccess(`Listing ${listingId} canceled`);
      await loadListings();
    } catch (err) {
      showError(err.reason || err.message || "Cancel failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleEnd(listingId) {
    setLoading(true);
    setError("");
    try {
      const auction = getAuctionContract(signer);
      const tx = await auction.end(listingId);
      await tx.wait();
      showSuccess(`Listing ${listingId} ended`);
      await loadListings();
      await loadWithdrawBalance();
    } catch (err) {
      showError(err.reason || err.message || "End failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleWithdraw() {
    setLoading(true);
    setError("");
    try {
      const auction = getAuctionContract(signer);
      const tx = await auction.withdraw();
      await tx.wait();
      showSuccess("Funds withdrawn successfully");
      setWithdrawBalance("0");
    } catch (err) {
      showError(err.reason || err.message || "Withdraw failed");
    } finally {
      setLoading(false);
    }
  }

  const activeListings = listings.filter((l) => l.status === STATUS.ACTIVE);
  const now = Math.floor(Date.now() / 1000);

  const isCorrectNetwork = chainId === 31337 || chainId === 1337;

  return (
    <div className="app">
      <Header
        account={account}
        chainId={chainId}
        isCorrectNetwork={isCorrectNetwork}
        onConnect={connectWallet}
        onSwitchNetwork={switchNetwork}
        contractsReady={contractsReady}
      />

      {error && <div className="msg msg-error">{error}</div>}
      {success && <div className="msg msg-success">{success}</div>}

      {!account ? (
        <div className="welcome">
          <h2>NFT Auction House</h2>
          <p>Connect your wallet to browse and bid on NFT auctions.</p>
          <button className="btn btn-primary btn-lg" onClick={connectWallet}>
            Connect Wallet
          </button>
        </div>
      ) : !isCorrectNetwork ? (
        <div className="welcome">
          <h2>Wrong Network</h2>
          <p>Please switch to Hardhat local network (chain ID 31337).</p>
          <button className="btn btn-primary" onClick={switchNetwork}>
            Switch Network
          </button>
        </div>
      ) : (
        <div className="main-content">
          <section className="section">
            <h2>Active Auctions ({activeListings.length})</h2>
            {activeListings.length === 0 ? (
              <p className="empty">No active auctions. Create one below!</p>
            ) : (
              <div className="listing-grid">
                {activeListings.map((l) => (
                  <ListingCard
                    key={l.id}
                    listing={l}
                    now={now}
                    account={account}
                    onBid={handleBid}
                    onCancel={handleCancel}
                    onEnd={handleEnd}
                    loading={loading}
                    showError={showError}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="section">
            <h2>Ended / Canceled</h2>
            {listings.filter((l) => l.status !== STATUS.ACTIVE).length === 0 ? (
              <p className="empty">No ended auctions.</p>
            ) : (
              <div className="listing-grid">
                {listings
                  .filter((l) => l.status !== STATUS.ACTIVE)
                  .map((l) => (
                    <ListingCard
                      key={l.id}
                      listing={l}
                      now={now}
                      account={account}
                      loading={loading}
                    />
                  ))}
              </div>
            )}
          </section>

          <div className="panels">
            <CreateListing
              signer={signer}
              onApprove={handleApprove}
              onList={handleList}
              loading={loading}
            />
            <WithdrawPanel
              balance={withdrawBalance}
              onWithdraw={handleWithdraw}
              loading={loading}
            />
          </div>
        </div>
      )}
    </div>
  );
}
