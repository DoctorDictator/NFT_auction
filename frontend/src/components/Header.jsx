import { ethers } from "ethers";

export default function Header({
  account,
  chainId,
  isCorrectNetwork,
  onConnect,
  onSwitchNetwork,
  contractsReady,
}) {
  return (
    <header className="header">
      <div className="header-left">
        <h1 className="logo">NFT Auction</h1>
        {!contractsReady && (
          <span className="badge badge-warn">No contracts deployed</span>
        )}
      </div>
      <div className="header-right">
        {account ? (
          <>
            <span className={`badge ${isCorrectNetwork ? "badge-ok" : "badge-warn"}`}>
              {isCorrectNetwork
                ? `Hardhat (${chainId})`
                : `Wrong Network (${chainId})`}
            </span>
            {!isCorrectNetwork && (
              <button className="btn btn-sm" onClick={onSwitchNetwork}>
                Switch
              </button>
            )}
            <span className="account" title={account}>
              {account.slice(0, 6)}...{account.slice(-4)}
            </span>
            <span className="balance-dot" />
          </>
        ) : (
          <button className="btn btn-primary" onClick={onConnect}>
            Connect Wallet
          </button>
        )}
      </div>
    </header>
  );
}
