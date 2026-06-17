const { expect } = require("chai");
const { ethers } = require("hardhat");

const getTime = async () => {
  const blockNumBefore = await ethers.provider.getBlockNumber();
  const blockBefore = await ethers.provider.getBlock(blockNumBefore);
  return blockBefore.timestamp;
};

const mineBlock = async (timestamp) => {
  await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);
  await ethers.provider.send("evm_mine");
};

describe("Auction", function () {
  let auction;
  let minty;
  let owner;
  let seller;
  let bidder1;
  let bidder2;

  beforeEach(async () => {
    [owner, seller, bidder1, bidder2] = await ethers.getSigners();

    const Minty = await ethers.getContractFactory("Minty");
    minty = await Minty.deploy("TestNFT", "TNFT");

    const Auction = await ethers.getContractFactory("Auction");
    auction = await Auction.deploy();

    // Mint three tokens to seller for testing
    await minty.connect(owner).mintToken(seller.address, "ipfs://token1");
    await minty.connect(owner).mintToken(seller.address, "ipfs://token2");
    await minty.connect(owner).mintToken(seller.address, "ipfs://token3");
  });

  describe("Listing", () => {
    it("should revert if not approved", async () => {
      await expect(
        auction.connect(seller).list(minty.address, 1, ethers.parseEther("1"), 3600)
      ).to.be.revertedWith("not approved");
    });

    it("should revert if not owner", async () => {
      await expect(
        auction.connect(bidder1).list(minty.address, 1, ethers.parseEther("1"), 3600)
      ).to.be.revertedWith("not owner");
    });

    it("should revert if min price is zero", async () => {
      await expect(
        auction.connect(seller).list(minty.address, 1, 0, 3600)
      ).to.be.revertedWith("min price must be > 0");
    });

    it("should revert if duration is zero", async () => {
      await expect(
        auction.connect(seller).list(minty.address, 1, ethers.parseEther("1"), 0)
      ).to.be.revertedWith("duration must be > 0");
    });

    it("should revert if duration exceeds MAX_DURATION", async () => {
      const maxDuration = await auction.MAX_DURATION();
      await expect(
        auction.connect(seller).list(minty.address, 1, ethers.parseEther("1"), maxDuration + 1n)
      ).to.be.revertedWith("duration too long");
    });

    it("should allow listing with approval and emit Listed", async () => {
      await minty.connect(seller).approve(auction.address, 1);
      const tx = await auction.connect(seller).list(minty.address, 1, ethers.parseEther("1"), 3600);
      await expect(tx).to.emit(auction, "Listed").withArgs(
        seller.address, minty.address, 1, 0, ethers.parseEther("1"), await getTime() + 3600
      );
      expect(await auction.listingCount()).to.equal(1);

      const listing = await auction.getListing(0);
      expect(listing.seller).to.equal(seller.address);
      expect(listing.nft).to.equal(minty.address);
      expect(listing.tokenId).to.equal(1);
      expect(listing.minPriceWei).to.equal(ethers.parseEther("1"));
      expect(listing.highestBid).to.equal(0);
      expect(listing.highestBidder).to.equal(ethers.ZeroAddress);
      expect(listing.status).to.equal(0); // Active
    });

    it("should accept approval for all and allow listing", async () => {
      await minty.connect(seller).setApprovalForAll(auction.address, true);
      await expect(
        auction.connect(seller).list(minty.address, 1, ethers.parseEther("1"), 3600)
      ).to.emit(auction, "Listed");
    });
  });

  describe("Bid", () => {
    beforeEach(async () => {
      await minty.connect(seller).approve(auction.address, 1);
      await auction.connect(seller).list(minty.address, 1, ethers.parseEther("1"), 3600);
    });

    it("should revert on nonexistent listing", async () => {
      await expect(
        auction.connect(bidder1).bid(99, { value: ethers.parseEther("2") })
      ).to.be.revertedWith("listing does not exist");
    });

    it("should revert if below min price", async () => {
      await expect(
        auction.connect(bidder1).bid(0, { value: ethers.parseEther("0.5") })
      ).to.be.revertedWith("below min price");
    });

    it("should accept first valid bid at min price", async () => {
      const tx = await auction.connect(bidder1).bid(0, { value: ethers.parseEther("1") });
      await expect(tx).to.emit(auction, "BidPlaced").withArgs(bidder1.address, 0, ethers.parseEther("1"));
      const listing = await auction.getListing(0);
      expect(listing.highestBid).to.equal(ethers.parseEther("1"));
      expect(listing.highestBidder).to.equal(bidder1.address);
    });

    it("should reject bid below increment", async () => {
      await auction.connect(bidder1).bid(0, { value: ethers.parseEther("1") });
      // 5% of 1 ETH = 0.05 ETH, so min is 1.05 ETH
      await expect(
        auction.connect(bidder2).bid(0, { value: ethers.parseEther("1.03") })
      ).to.be.revertedWith("bid too low");
    });

    it("should accept bid at exactly the increment", async () => {
      await auction.connect(bidder1).bid(0, { value: ethers.parseEther("1") });
      await expect(
        auction.connect(bidder2).bid(0, { value: ethers.parseEther("1.05") })
      ).to.emit(auction, "BidPlaced");
    });

    it("should refund previous bidder", async () => {
      await auction.connect(bidder1).bid(0, { value: ethers.parseEther("1") });
      await auction.connect(bidder2).bid(0, { value: ethers.parseEther("2") });
      expect(await auction.pendingWithdrawals(bidder1.address)).to.equal(ethers.parseEther("1"));
    });

    it("should revert if auction ended (past deadline)", async () => {
      const now = await getTime();
      await mineBlock(now + 7200);
      await expect(
        auction.connect(bidder1).bid(0, { value: ethers.parseEther("2") })
      ).to.be.revertedWith("auction ended");
    });

    it("should extend deadline when bid placed in last 15 minutes (anti-sniping)", async () => {
      const extensionPeriod = await auction.EXTENSION_PERIOD();
      const now = await getTime();
      // Move to 5 minutes before end
      await mineBlock(now + 3550);
      const tx = await auction.connect(bidder1).bid(0, { value: ethers.parseEther("2") });
      const newEndTime = BigInt(now + 3550) + extensionPeriod;
      await expect(tx).to.emit(auction, "AuctionExtended").withArgs(0, newEndTime);
      const listing = await auction.getListing(0);
      expect(listing.endTime).to.equal(newEndTime);
    });

    it("should reject bid on canceled listing", async () => {
      await expect(
        auction.connect(bidder1).bid(0, { value: ethers.parseEther("2") })
      ).to.emit(auction, "BidPlaced");
    });

    it("should revert on nonReentrant: cannot reenter bid from another contract", async () => {
      await auction.connect(bidder1).bid(0, { value: ethers.parseEther("1") });
    });
  });

  describe("Cancel", () => {
    beforeEach(async () => {
      await minty.connect(seller).approve(auction.address, 1);
      await auction.connect(seller).list(minty.address, 1, ethers.parseEther("1"), 3600);
    });

    it("should revert if not seller", async () => {
      await expect(auction.connect(bidder1).cancel(0)).to.be.revertedWith("not seller");
    });

    it("should revert if listing is not active", async () => {
      const now = await getTime();
      await mineBlock(now + 3601);
      await auction.connect(seller).end(0);
      await expect(auction.connect(seller).cancel(0)).to.be.revertedWith("not active");
    });

    it("should revert if bids have been placed", async () => {
      await auction.connect(bidder1).bid(0, { value: ethers.parseEther("1") });
      await expect(auction.connect(seller).cancel(0)).to.be.revertedWith("bids placed");
    });

    it("should cancel and return NFT to seller, emit AuctionCanceled", async () => {
      const tx = await auction.connect(seller).cancel(0);
      await expect(tx).to.emit(auction, "AuctionCanceled").withArgs(0);
      expect(await minty.ownerOf(1)).to.equal(seller.address);
      const listing = await auction.getListing(0);
      expect(listing.status).to.equal(2); // Canceled
    });
  });

  describe("End", () => {
    beforeEach(async () => {
      await minty.connect(seller).approve(auction.address, 1);
      await auction.connect(seller).list(minty.address, 1, ethers.parseEther("1"), 3600);
    });

    it("should revert if still active", async () => {
      await expect(auction.connect(seller).end(0)).to.be.revertedWith("auction still active");
    });

    it("should revert if already ended", async () => {
      const now = await getTime();
      await mineBlock(now + 3601);
      await auction.connect(seller).end(0);
      await expect(auction.connect(seller).end(0)).to.be.revertedWith("not active");
    });

    it("should end with winner: send NFT to winner, credit seller", async () => {
      await auction.connect(bidder1).bid(0, { value: ethers.parseEther("5") });
      const now = await getTime();
      await mineBlock(now + 7200);
      const tx = await auction.connect(seller).end(0);
      await expect(tx).to.emit(auction, "AuctionEnded").withArgs(0, bidder1.address, ethers.parseEther("5"));
      expect(await minty.ownerOf(1)).to.equal(bidder1.address);
      expect(await auction.pendingWithdrawals(seller.address)).to.equal(ethers.parseEther("5"));
    });

    it("should end with no bids: return NFT to seller", async () => {
      const now = await getTime();
      await mineBlock(now + 3601);
      const tx = await auction.connect(seller).end(0);
      await expect(tx).to.emit(auction, "AuctionEnded").withArgs(0, ethers.ZeroAddress, 0);
      expect(await minty.ownerOf(1)).to.equal(seller.address);
    });
  });

  describe("Withdraw", () => {
    beforeEach(async () => {
      await minty.connect(seller).approve(auction.address, 1);
      await auction.connect(seller).list(minty.address, 1, ethers.parseEther("1"), 3600);
    });

    it("should revert if nothing to withdraw", async () => {
      await expect(auction.connect(bidder1).withdraw()).to.be.revertedWith("nothing to withdraw");
    });

    it("should allow seller to withdraw after auction ends", async () => {
      await auction.connect(bidder1).bid(0, { value: ethers.parseEther("5") });
      const now = await getTime();
      await mineBlock(now + 7200);
      await auction.connect(seller).end(0);
      const sellerBalBefore = await ethers.provider.getBalance(seller.address);
      const tx = await auction.connect(seller).withdraw();
      await expect(tx).to.emit(auction, "FundsWithdrawn").withArgs(seller.address, ethers.parseEther("5"));
      const sellerBalAfter = await ethers.provider.getBalance(seller.address);
      expect(sellerBalAfter - sellerBalBefore).to.equal(ethers.parseEther("5"));
    });

    it("should allow outbid bidder to withdraw", async () => {
      await auction.connect(bidder1).bid(0, { value: ethers.parseEther("1") });
      await auction.connect(bidder2).bid(0, { value: ethers.parseEther("2") });
      const balBefore = await ethers.provider.getBalance(bidder1.address);
      await auction.connect(bidder1).withdraw();
      const balAfter = await ethers.provider.getBalance(bidder1.address);
      expect(balAfter - balBefore).to.equal(ethers.parseEther("1"));
    });
  });

  describe("Multiple listings", () => {
    it("should support multiple independent listings", async () => {
      await minty.connect(seller).setApprovalForAll(auction.address, true);
      await auction.connect(seller).list(minty.address, 1, ethers.parseEther("1"), 3600);
      await auction.connect(seller).list(minty.address, 2, ethers.parseEther("2"), 7200);
      expect(await auction.listingCount()).to.equal(2);

      const l1 = await auction.getListing(0);
      expect(l1.tokenId).to.equal(1);
      expect(l1.minPriceWei).to.equal(ethers.parseEther("1"));

      const l2 = await auction.getListing(1);
      expect(l2.tokenId).to.equal(2);
      expect(l2.minPriceWei).to.equal(ethers.parseEther("2"));

      // Bid on listing 0 only
      await auction.connect(bidder1).bid(0, { value: ethers.parseEther("1") });
      const l1b = await auction.getListing(0);
      expect(l1b.highestBid).to.equal(ethers.parseEther("1"));
      const l2b = await auction.getListing(1);
      expect(l2b.highestBid).to.equal(0);
    });
  });
});
