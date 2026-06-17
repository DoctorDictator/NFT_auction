import { useLocation } from "react-router-dom";
import { Link } from "react-router-dom";
import { shortenAddress } from "../utils";

export default function Header({ account, chainId, isCorrectNetwork, onConnect, onSwitchNetwork }) {
  const location = useLocation();

  return (
    <header className="header">
      <div className="header-left">
        <Link to="/" className="logo">NFT Marketplace</Link>
        <nav className="nav-links">
          <Link to="/" className={`nav-link ${location.pathname === "/" ? "active" : ""}`}>Explore</Link>
          {account && (
            <Link to="/profile" className={`nav-link ${location.pathname === "/profile" ? "active" : ""}`}>Profile</Link>
          )}
        </nav>
      </div>
      <div className="header-right">
        {account ? (
          <>
            <span className={`badge ${isCorrectNetwork ? "badge-ok" : "badge-warn"}`}>
              {isCorrectNetwork ? `Network \u2713` : `Wrong Network (${chainId})`}
            </span>
            {!isCorrectNetwork && (
              <button className="btn btn-sm" onClick={onSwitchNetwork}>Switch</button>
            )}
            <Link to="/profile" className="account" title={account}>
              {shortenAddress(account)}
            </Link>
          </>
        ) : (
          <button className="btn btn-primary" onClick={onConnect}>Connect Wallet</button>
        )}
      </div>
    </header>
  );
}
