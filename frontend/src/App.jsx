import { useState, useEffect, useCallback } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ethers } from "ethers";
import { getContractAddresses, getMintyContract, getMarketplaceContract } from "./contractInfo";
import { ToastProvider, useToast } from "./ToastContext";
import Header from "./components/Header";
import Home from "./pages/Home";
import ListingDetail from "./pages/ListingDetail";
import Profile from "./pages/Profile";

function AppContent() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [listings, setListings] = useState([]);
  const [withdrawBalance, setWithdrawBalance] = useState("0");
  const [loading, setLoading] = useState(false);
  const [contractsReady, setContractsReady] = useState(false);
  const [marketplace, setMarketplace] = useState(null);
  const [minty, setMinty] = useState(null);
  const toast = useToast();

  useEffect(() => {
    getContractAddresses().then((addrs) => {
      if (addrs) setContractsReady(true);
    });
  }, []);

  useEffect(() => {
    if (!signer) return;
    const mp = getMarketplaceContract(signer);
    const mn = getMintyContract(signer);
    setMarketplace(mp);
    setMinty(mn);
  }, [signer]);

  async function connectWallet() {
    if (!window.ethereum) {
      toast.error("Please install MetaMask or another wallet");
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
      toast.error(err.reason || err.message || "Failed to connect wallet");
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
        params: [{
          chainId: "0x7A69",
          chainName: "Hardhat Local",
          rpcUrls: ["http://127.0.0.1:8545"],
          nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
        }],
      });
    }
  }

  const loadListings = useCallback(async () => {
    if (!signer) return;
    try {
      const mp = getMarketplaceContract(signer);
      if (!mp) return;
      const count = Number(await mp.listingCount());
      const promises = [];
      for (let i = 0; i < count; i++) {
        promises.push(mp.getListing(i));
      }
      const raw = await Promise.all(promises);
      const mapped = raw.map((l, i) => ({
        id: i,
        seller: l[0],
        nft: l[1],
        tokenId: Number(l[2]),
        listingType: Number(l[3]),
        status: Number(l[4]),
        minPriceWei: l[5],
        reservePriceWei: l[6],
        buyNowPriceWei: l[7],
        highestBid: l[8],
        highestBidder: l[9],
        endTime: Number(l[10]),
      }));
      setListings(mapped);
    } catch (err) {
      console.error("Failed to load listings:", err);
    }
  }, [signer]);

  useEffect(() => {
    if (signer) {
      loadListings();
      loadWithdrawBalance();
    }
  }, [signer, loadListings]);

  async function loadWithdrawBalance() {
    if (!signer || !account) return;
    try {
      const mp = getMarketplaceContract(signer);
      if (!mp) return;
      const bal = await mp.pendingWithdrawals(account);
      setWithdrawBalance(bal.toString());
    } catch {
      setWithdrawBalance("0");
    }
  }

  useEffect(() => {
    if (!window.ethereum) return;
    const handleAccountsChanged = (accs) => {
      if (accs.length === 0) {
        setAccount(null); setSigner(null); setProvider(null);
      }
    };
    const handleChainChanged = () => window.location.reload();
    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);
    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, []);

  const isCorrectNetwork = chainId === 31337 || chainId === 1337;

  const commonProps = { signer, account, marketplace, minty, loading, setLoading, loadListings, loadWithdrawBalance, withdrawBalance, listings };

  return (
    <div className="app">
      <Header account={account} chainId={chainId} isCorrectNetwork={isCorrectNetwork}
        onConnect={connectWallet} onSwitchNetwork={switchNetwork} />

      {!account ? (
        <div className="welcome">
          <h2>NFT Marketplace</h2>
          <p>Connect your wallet to browse, buy, and sell NFTs.</p>
          <button className="btn btn-primary btn-lg" onClick={connectWallet}>Connect Wallet</button>
        </div>
      ) : !isCorrectNetwork ? (
        <div className="welcome">
          <h2>Wrong Network</h2>
          <p>Please switch to Hardhat local network (chain ID 31337).</p>
          <button className="btn btn-primary" onClick={switchNetwork}>Switch Network</button>
        </div>
      ) : (
        <Routes>
          <Route path="/" element={<Home {...commonProps} />} />
          <Route path="/listing/:id" element={<ListingDetail {...commonProps} />} />
          <Route path="/profile" element={<Profile {...commonProps} />} />
        </Routes>
      )}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </BrowserRouter>
  );
}
