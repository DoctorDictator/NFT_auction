import { ethers } from "ethers";

export default function WithdrawPanel({ balance, onWithdraw, loading }) {
  const balWei = BigInt(balance || "0");
  const hasBalance = balWei > 0;

  return (
    <div className="panel">
      <h3>Withdraw Funds</h3>
      <div className="panel-body">
        <p className="withdraw-balance">
          Available: <strong>{ethers.formatEther(balWei)} ETH</strong>
        </p>
        <button className="btn btn-primary" onClick={onWithdraw} disabled={loading || !hasBalance}>
          {loading ? "Withdrawing..." : "Withdraw"}
        </button>
        {!hasBalance && (
          <p className="hint">No funds to withdraw. Outbid bidders and sellers after sale receive funds here.</p>
        )}
      </div>
    </div>
  );
}
