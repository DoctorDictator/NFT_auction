const { expect } = require("chai");
const { ethers } = require("hardhat");

const getTime = async () => {
  const block = await ethers.provider.getBlock("latest");
  return block.timestamp;
};

const mineBlock = async (timestamp) => {
  await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);
  await ethers.provider.send("evm_mine");
};

const STATUS_ACTIVE = 0;
const STATUS_ENDED = 1;
const STATUS_CANCELED = 2;
const TYPE_AUCTION = 0;
const TYPE_FIXED = 1;

describe("Marketplace", function () {
  let marketplace, minty;
  let owner, seller, bidder1, bidder2, treasury, admin;

  beforeEach(async () => {
    [owner, seller, bidder1, bidder2, treasury, admin] = await ethers.getSigners();

    const Minty = await ethers.getContractFactory("Minty");
    minty = await Minty.deploy("TestNFT", "TNFT");

    const Marketplace = await ethers.getContractFactory("Marketplace");
    marketplace = await Marketplace.deploy(treasury.address, 250);

    const MINTER_ROLE = await minty.MINTER_ROLE();
    await minty.grantRole(MINTER_ROLE, owner.address);

    await minty.connect(owner).mintToken(seller.address, "ipfs://token1");
    await minty.connect(owner).mintToken(seller.address, "ipfs://token2");
    await minty.connect(owner).mintToken(seller.address, "ipfs://token3");
    await minty.connect(owner).mintToken(seller.address, "ipfs://token4");
    await minty.connect(owner).mintToken(seller.address, "ipfs://token5");
  });

  describe("Deployment", () => {
    it("should set treasury and fee correctly", async () => {
      expect(await marketplace.treasury()).to.equal(treasury.address);
      expect(await marketplace.platformFeeBps()).to.equal(250);
    });

    it("should grant admin roles to deployer", async () => {
      expect(await marketplace.hasRole(await marketplace.DEFAULT_ADMIN_ROLE(), owner.address)).to.be.true;
      expect(await marketplace.hasRole(await marketplace.ADMIN_ROLE(), owner.address)).to.be.true;
    });

    it("should reject invalid constructor args", async () => {
      const Marketplace = await ethers.getContractFactory("Marketplace");
      await expect(Marketplace.deploy(ethers.ZeroAddress, 250)).to.be.revertedWith("invalid treasury");
      await expect(Marketplace.deploy(treasury.address, 2000)).to.be.revertedWith("fee too high");
    });
  });

  describe("Auction Listing", () => {
    it("should revert if not approved", async () => {
      await expect(
        marketplace.connect(seller).listAuction(minty.target, 1, ethers.parseEther("1"), 0, 0, 3600)
      ).to.be.revertedWith("not approved");
    });

    it("should revert if not owner", async () => {
      await expect(
        marketplace.connect(bidder1).listAuction(minty.target, 1, ethers.parseEther("1"), 0, 0, 3600)
      ).to.be.revertedWith("not owner");
    });

    it("should revert if min price is zero", async () => {
      await expect(
        marketplace.connect(seller).listAuction(minty.target, 1, 0, 0, 0, 3600)
      ).to.be.revertedWith("min price must be > 0");
    });

    it("should revert if duration exceeds max", async () => {
      const max = await marketplace.MAX_DURATION();
      await expect(
        marketplace.connect(seller).listAuction(minty.target, 1, ethers.parseEther("1"), 0, 0, max + 1n)
      ).to.be.revertedWith("duration too long");
    });

    it("should revert if reserve below min price", async () => {
      await minty.connect(seller).approve(marketplace.target, 1);
      await expect(
        marketplace.connect(seller).listAuction(minty.target, 1, ethers.parseEther("1"), ethers.parseEther("0.5"), 0, 3600)
      ).to.be.revertedWith("reserve too low");
    });

    it("should revert if buy-now too low", async () => {
      await minty.connect(seller).approve(marketplace.target, 1);
      await expect(
        marketplace.connect(seller).listAuction(minty.target, 1, ethers.parseEther("1"), 0, ethers.parseEther("0.9"), 3600)
      ).to.be.revertedWith("buy-now too low");
    });

    it("should create auction and emit AuctionListed", async () => {
      await minty.connect(seller).approve(marketplace.target, 1);
      const tx = await marketplace.connect(seller).listAuction(
        minty.target, 1, ethers.parseEther("1"), ethers.parseEther("2"), ethers.parseEther("5"), 3600
      );
      await expect(tx).to.emit(marketplace, "AuctionListed");
      expect(await marketplace.listingCount()).to.equal(1);
      expect(await marketplace.auctionCount()).to.equal(1);

      const l = await marketplace.getListing(0);
      expect(l.seller).to.equal(seller.address);
      expect(l.nft).to.equal(minty.target);
      expect(l.tokenId).to.equal(1);
      expect(l.listingType).to.equal(TYPE_AUCTION);
      expect(l.status).to.equal(STATUS_ACTIVE);
      expect(l.minPriceWei).to.equal(ethers.parseEther("1"));
      expect(l.reservePriceWei).to.equal(ethers.parseEther("2"));
      expect(l.buyNowPriceWei).to.equal(ethers.parseEther("5"));
    });

    it("should transfer NFT to contract", async () => {
      await minty.connect(seller).approve(marketplace.target, 1);
      await marketplace.connect(seller).listAuction(minty.target, 1, ethers.parseEther("1"), 0, 0, 3600);
      expect(await minty.ownerOf(1)).to.equal(marketplace.target);
    });
  });

  describe("Fixed-Price Listing", () => {
    it("should create fixed-price listing", async () => {
      await minty.connect(seller).approve(marketplace.target, 2);
      const tx = await marketplace.connect(seller).listFixedPrice(minty.target, 2, ethers.parseEther("10"));
      await expect(tx).to.emit(marketplace, "FixedPriceListed");
      expect(await marketplace.fixedPriceCount()).to.equal(1);

      const l = await marketplace.getListing(0);
      expect(l.listingType).to.equal(TYPE_FIXED);
      expect(l.minPriceWei).to.equal(ethers.parseEther("10"));
    });
  });

  describe("Bidding", () => {
    beforeEach(async () => {
      await minty.connect(seller).approve(marketplace.target, 1);
      await marketplace.connect(seller).listAuction(minty.target, 1, ethers.parseEther("1"), 0, 0, 3600);
    });

    it("should reject below min price", async () => {
      await expect(
        marketplace.connect(bidder1).bid(0, { value: ethers.parseEther("0.5") })
      ).to.be.revertedWith("below min price");
    });

    it("should accept first valid bid", async () => {
      const tx = await marketplace.connect(bidder1).bid(0, { value: ethers.parseEther("1") });
      await expect(tx).to.emit(marketplace, "BidPlaced");
      const l = await marketplace.getListing(0);
      expect(l.highestBid).to.equal(ethers.parseEther("1"));
      expect(l.highestBidder).to.equal(bidder1.address);
    });

    it("should reject below increment", async () => {
      await marketplace.connect(bidder1).bid(0, { value: ethers.parseEther("1") });
      await expect(
        marketplace.connect(bidder2).bid(0, { value: ethers.parseEther("1.03") })
      ).to.be.revertedWith("bid too low");
    });

    it("should accept at increment", async () => {
      await marketplace.connect(bidder1).bid(0, { value: ethers.parseEther("1") });
      await expect(
        marketplace.connect(bidder2).bid(0, { value: ethers.parseEther("1.05") })
      ).to.emit(marketplace, "BidPlaced");
    });

    it("should refund previous bidder", async () => {
      await marketplace.connect(bidder1).bid(0, { value: ethers.parseEther("1") });
      await marketplace.connect(bidder2).bid(0, { value: ethers.parseEther("2") });
      expect(await marketplace.pendingWithdrawals(bidder1.address)).to.equal(ethers.parseEther("1"));
    });

    it("should revert after end time", async () => {
      const now = await getTime();
      await mineBlock(now + 7200);
      await expect(
        marketplace.connect(bidder1).bid(0, { value: ethers.parseEther("2") })
      ).to.be.revertedWith("auction ended");
    });

    it("should extend deadline for late bids", async () => {
      const extension = await marketplace.DEFAULT_EXTENSION_PERIOD();
      const listingBefore = await marketplace.getListing(0);
      const originalEnd = listingBefore.endTime;
      const now = await getTime();
      await mineBlock(now + 3550);
      await marketplace.connect(bidder1).bid(0, { value: ethers.parseEther("2") });
      const listingAfter = await marketplace.getListing(0);
      expect(listingAfter.endTime).to.be.greaterThan(originalEnd);
      expect(listingAfter.endTime).to.be.at.most(originalEnd + extension);
    });

    it("should revert on non-auction type", async () => {
      await minty.connect(seller).approve(marketplace.target, 2);
      await marketplace.connect(seller).listFixedPrice(minty.target, 2, ethers.parseEther("5"));
      await expect(
        marketplace.connect(bidder1).bid(1, { value: ethers.parseEther("5") })
      ).to.be.revertedWith("not an auction");
    });
  });

  describe("Buy Now", () => {
    beforeEach(async () => {
      await minty.connect(seller).approve(marketplace.target, 1);
      await marketplace.connect(seller).listAuction(
        minty.target, 1, ethers.parseEther("1"), 0, ethers.parseEther("5"), 3600
      );
    });

    it("should purchase instantly via bid at or above buy-now", async () => {
      const tx = await marketplace.connect(bidder1).bid(0, { value: ethers.parseEther("5") });
      await expect(tx).to.emit(marketplace, "BuyNowPurchased");

      const l = await marketplace.getListing(0);
      expect(l.status).to.equal(STATUS_ENDED);
      expect(await minty.ownerOf(1)).to.equal(bidder1.address);
    });

    it("should process payout with fee", async () => {
      await marketplace.connect(bidder1).bid(0, { value: ethers.parseEther("5") });
      const fee = ethers.parseEther("5") * 250n / 10000n;
      const sellerProceeds = ethers.parseEther("5") - fee;
      expect(await marketplace.pendingWithdrawals(seller.address)).to.equal(sellerProceeds);
      expect(await marketplace.pendingWithdrawals(treasury.address)).to.equal(fee);
    });

    it("should allow explicit buyNow", async () => {
      const tx = await marketplace.connect(bidder1).buyNow(0, { value: ethers.parseEther("5") });
      await expect(tx).to.emit(marketplace, "BuyNowPurchased");
    });

    it("should reject below buy-now price", async () => {
      await expect(
        marketplace.connect(bidder1).buyNow(0, { value: ethers.parseEther("4") })
      ).to.be.revertedWith("below buy-now price");
    });

    it("should refund existing highest bidder on buy-now", async () => {
      await marketplace.connect(bidder1).bid(0, { value: ethers.parseEther("1") });
      await marketplace.connect(bidder2).buyNow(0, { value: ethers.parseEther("5") });
      expect(await marketplace.pendingWithdrawals(bidder1.address)).to.equal(ethers.parseEther("1"));
    });
  });

  describe("Fixed Price Purchase", () => {
    beforeEach(async () => {
      await minty.connect(seller).approve(marketplace.target, 2);
      await marketplace.connect(seller).listFixedPrice(minty.target, 2, ethers.parseEther("10"));
    });

    it("should allow purchase at exact price", async () => {
      const tx = await marketplace.connect(bidder1).buyFixedPrice(0, { value: ethers.parseEther("10") });
      await expect(tx).to.emit(marketplace, "FixedPriceSold");
      expect(await minty.ownerOf(2)).to.equal(bidder1.address);
    });

    it("should reject below price", async () => {
      await expect(
        marketplace.connect(bidder1).buyFixedPrice(0, { value: ethers.parseEther("9") })
      ).to.be.revertedWith("below price");
    });

    it("should process payout with fee", async () => {
      await marketplace.connect(bidder1).buyFixedPrice(0, { value: ethers.parseEther("10") });
      const fee = ethers.parseEther("10") * 250n / 10000n;
      const sellerProceeds = ethers.parseEther("10") - fee;
      expect(await marketplace.pendingWithdrawals(seller.address)).to.equal(sellerProceeds);
      expect(await marketplace.pendingWithdrawals(treasury.address)).to.equal(fee);
    });

    it("should fail on auction type", async () => {
      await expect(
        marketplace.connect(bidder1).buyFixedPrice(1, { value: ethers.parseEther("1") })
      ).to.be.revertedWith("listing does not exist");
    });
  });

  describe("Cancel", () => {
    beforeEach(async () => {
      await minty.connect(seller).approve(marketplace.target, 1);
      await marketplace.connect(seller).listAuction(minty.target, 1, ethers.parseEther("1"), 0, 0, 3600);
    });

    it("should revert if not seller", async () => {
      await expect(marketplace.connect(bidder1).cancel(0)).to.be.revertedWith("not seller or admin");
    });

    it("should revert if bids placed", async () => {
      await marketplace.connect(bidder1).bid(0, { value: ethers.parseEther("1") });
      await expect(marketplace.connect(seller).cancel(0)).to.be.revertedWith("bids placed");
    });

    it("should cancel and return NFT", async () => {
      const tx = await marketplace.connect(seller).cancel(0);
      await expect(tx).to.emit(marketplace, "ListingCanceled");
      expect(await minty.ownerOf(1)).to.equal(seller.address);
      const l = await marketplace.getListing(0);
      expect(l.status).to.equal(STATUS_CANCELED);
    });

    it("should allow admin to cancel", async () => {
      const ADMIN_ROLE = await marketplace.ADMIN_ROLE();
      await marketplace.connect(owner).grantRole(ADMIN_ROLE, admin.address);
      await expect(marketplace.connect(admin).cancel(0)).to.emit(marketplace, "ListingCanceled");
    });
  });

  describe("End Auction", () => {
    beforeEach(async () => {
      await minty.connect(seller).approve(marketplace.target, 1);
      await marketplace.connect(seller).listAuction(minty.target, 1, ethers.parseEther("1"), 0, 0, 3600);
    });

    it("should revert if still active", async () => {
      await expect(marketplace.connect(seller).end(0)).to.be.revertedWith("auction still active");
    });

    it("should end with winner: pay seller, send NFT", async () => {
      await marketplace.connect(bidder1).bid(0, { value: ethers.parseEther("5") });
      const now = await getTime();
      await mineBlock(now + 7200);
      const tx = await marketplace.connect(seller).end(0);
      await expect(tx).to.emit(marketplace, "AuctionEnded").withArgs(0, bidder1.address, ethers.parseEther("5"), true);
      expect(await minty.ownerOf(1)).to.equal(bidder1.address);
      const fee = ethers.parseEther("5") * 250n / 10000n;
      expect(await marketplace.pendingWithdrawals(seller.address)).to.equal(ethers.parseEther("5") - fee);
    });

    it("should end with no bids: return NFT", async () => {
      const now = await getTime();
      await mineBlock(now + 3601);
      const tx = await marketplace.connect(seller).end(0);
      await expect(tx).to.emit(marketplace, "AuctionEnded").withArgs(0, ethers.ZeroAddress, 0, false);
      expect(await minty.ownerOf(1)).to.equal(seller.address);
    });
  });

  describe("Reserve Price", () => {
    beforeEach(async () => {
      await minty.connect(seller).approve(marketplace.target, 1);
      await marketplace.connect(seller).listAuction(
        minty.target, 1, ethers.parseEther("1"), ethers.parseEther("3"), 0, 3600
      );
    });

    it("should not complete if reserve not met", async () => {
      await marketplace.connect(bidder1).bid(0, { value: ethers.parseEther("2") });
      const now = await getTime();
      await mineBlock(now + 7200);
      const tx = await marketplace.connect(seller).end(0);
      await expect(tx).to.emit(marketplace, "AuctionEnded").withArgs(0, bidder1.address, ethers.parseEther("2"), false);
      // Bidder refunded
      expect(await marketplace.pendingWithdrawals(bidder1.address)).to.equal(ethers.parseEther("2"));
      // NFT back to seller
      expect(await minty.ownerOf(1)).to.equal(seller.address);
    });

    it("should complete if reserve met", async () => {
      await marketplace.connect(bidder1).bid(0, { value: ethers.parseEther("3") });
      const now = await getTime();
      await mineBlock(now + 7200);
      const tx = await marketplace.connect(seller).end(0);
      await expect(tx).to.emit(marketplace, "AuctionEnded").withArgs(0, bidder1.address, ethers.parseEther("3"), true);
      expect(await minty.ownerOf(1)).to.equal(bidder1.address);
    });
  });

  describe("Auction History", () => {
    it("should record completed auctions", async () => {
      await minty.connect(seller).approve(marketplace.target, 1);
      await marketplace.connect(seller).listAuction(minty.target, 1, ethers.parseEther("1"), 0, 0, 3600);
      await marketplace.connect(bidder1).bid(0, { value: ethers.parseEther("5") });
      const now = await getTime();
      await mineBlock(now + 7200);
      await marketplace.connect(seller).end(0);

      expect(await marketplace.getAuctionHistoryCount()).to.equal(1);
      const history = await marketplace.getAuctionHistory(0);
      expect(history.winner).to.equal(bidder1.address);
      expect(history.winningBid).to.equal(ethers.parseEther("5"));
    });

    it("should not record if reserve not met", async () => {
      await minty.connect(seller).approve(marketplace.target, 1);
      await marketplace.connect(seller).listAuction(
        minty.target, 1, ethers.parseEther("1"), ethers.parseEther("10"), 0, 3600
      );
      await marketplace.connect(bidder1).bid(0, { value: ethers.parseEther("5") });
      const now = await getTime();
      await mineBlock(now + 7200);
      await marketplace.connect(seller).end(0);
      expect(await marketplace.getAuctionHistoryCount()).to.equal(0);
    });
  });

  describe("Withdraw", () => {
    it("should revert if nothing to withdraw", async () => {
      await expect(marketplace.connect(bidder1).withdraw()).to.be.revertedWith("nothing to withdraw");
    });

    it("should allow seller to withdraw proceeds", async () => {
      await minty.connect(seller).approve(marketplace.target, 1);
      await marketplace.connect(seller).listAuction(minty.target, 1, ethers.parseEther("1"), 0, 0, 3600);
      await marketplace.connect(bidder1).bid(0, { value: ethers.parseEther("5") });
      const now = await getTime();
      await mineBlock(now + 7200);
      await marketplace.connect(seller).end(0);

      const balBefore = await ethers.provider.getBalance(seller.address);
      const tx = await marketplace.connect(seller).withdraw();
      await expect(tx).to.emit(marketplace, "FundsWithdrawn");
      const balAfter = await ethers.provider.getBalance(seller.address);
      expect(balAfter > balBefore).to.be.true;
    });
  });

  describe("Admin Functions", () => {
    it("should update platform fee", async () => {
      await marketplace.connect(owner).setPlatformFee(500);
      expect(await marketplace.platformFeeBps()).to.equal(500);
    });

    it("should only allow admin to update fee", async () => {
      await expect(marketplace.connect(bidder1).setPlatformFee(500)).to.be.reverted;
    });

    it("should update treasury", async () => {
      await marketplace.connect(owner).setTreasury(bidder1.address);
      expect(await marketplace.treasury()).to.equal(bidder1.address);
    });

    it("should pause and unpause", async () => {
      await marketplace.connect(owner).pause();
      await expect(
        marketplace.connect(seller).listAuction(minty.target, 1, ethers.parseEther("1"), 0, 0, 3600)
      ).to.be.reverted;
      await marketplace.connect(owner).unpause();
      // Should work now
      await minty.connect(seller).approve(marketplace.target, 1);
      await expect(
        marketplace.connect(seller).listAuction(minty.target, 1, ethers.parseEther("1"), 0, 0, 3600)
      ).to.emit(marketplace, "AuctionListed");
    });
  });

  describe("Reduce Price", () => {
    beforeEach(async () => {
      await minty.connect(seller).approve(marketplace.target, 2);
      await marketplace.connect(seller).listFixedPrice(minty.target, 2, ethers.parseEther("10"));
    });

    it("should reduce price", async () => {
      const tx = await marketplace.connect(seller).reducePrice(0, ethers.parseEther("7"));
      await expect(tx).to.emit(marketplace, "PriceReduced").withArgs(0, ethers.parseEther("10"), ethers.parseEther("7"));
      const l = await marketplace.getListing(0);
      expect(l.minPriceWei).to.equal(ethers.parseEther("7"));
    });

    it("should reject non-seller", async () => {
      await expect(
        marketplace.connect(bidder1).reducePrice(0, ethers.parseEther("7"))
      ).to.be.revertedWith("not seller");
    });

    it("should reject non-fixed-price", async () => {
      await minty.connect(seller).approve(marketplace.target, 3);
      await marketplace.connect(seller).listAuction(minty.target, 3, ethers.parseEther("1"), 0, 0, 3600);
      await expect(
        marketplace.connect(seller).reducePrice(1, ethers.parseEther("7"))
      ).to.be.revertedWith("not fixed-price");
    });
  });

  describe("View Functions", () => {
    it("should return active listing IDs", async () => {
      await minty.connect(seller).setApprovalForAll(marketplace.target, true);
      await marketplace.connect(seller).listAuction(minty.target, 1, ethers.parseEther("1"), 0, 0, 3600);
      await marketplace.connect(seller).listFixedPrice(minty.target, 2, ethers.parseEther("5"));

      const activeIds = await marketplace.getActiveListingIds(0, 10);
      expect(activeIds.length).to.equal(2);
    });

    it("should return listings by seller", async () => {
      await minty.connect(seller).setApprovalForAll(marketplace.target, true);
      await marketplace.connect(seller).listAuction(minty.target, 1, ethers.parseEther("1"), 0, 0, 3600);
      await marketplace.connect(seller).listFixedPrice(minty.target, 2, ethers.parseEther("5"));

      const sellerIds = await marketplace.getListingsBySeller(seller.address, 0, 10);
      expect(sellerIds.length).to.equal(2);

      const otherIds = await marketplace.getListingsBySeller(bidder1.address, 0, 10);
      expect(otherIds.length).to.equal(0);
    });
  });
});
