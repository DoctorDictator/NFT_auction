export function ipfsToHttp(uri) {
  if (!uri) return null;
  if (uri.startsWith("ipfs://")) {
    return "https://ipfs.io/ipfs/" + uri.slice(7);
  }
  if (uri.startsWith("Qm") || uri.startsWith("baf")) {
    return "https://ipfs.io/ipfs/" + uri;
  }
  return uri;
}

export function shortenAddress(addr) {
  if (!addr) return "";
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

export function timeLeft(endTime) {
  const now = Math.floor(Date.now() / 1000);
  if (endTime <= now) return "Ended";
  const diff = endTime - now;
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatEther(wei) {
  if (!wei || wei === 0n) return "0";
  return parseFloat(wei.toString()) / 1e18;
}

const LISTING_TYPE = { 0: "Auction", 1: "Fixed Price" };
const LISTING_STATUS = { 0: "Active", 1: "Ended", 2: "Canceled" };

export function listingTypeLabel(t) { return LISTING_TYPE[t] || "Unknown"; }
export function listingStatusLabel(s) { return LISTING_STATUS[s] || "Unknown"; }

export async function fetchTokenMetadata(tokenURI) {
  try {
    const url = ipfsToHttp(tokenURI);
    if (!url) return null;
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}
