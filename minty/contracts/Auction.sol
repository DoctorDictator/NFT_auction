// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract Auction is ERC721Holder, ReentrancyGuard {
    enum ListingStatus { Active, Ended, Canceled }

    struct Listing {
        address seller;
        IERC721 nft;
        uint256 tokenId;
        uint96 minPriceWei;
        uint96 highestBid;
        address highestBidder;
        uint40 endTime;
        ListingStatus status;
    }

    uint256 public listingCount;
    mapping(uint256 => Listing) private _listings;
    mapping(address => uint256) public pendingWithdrawals;

    uint256 public constant MIN_BID_INCREMENT_PERCENT = 5;
    uint256 public constant EXTENSION_PERIOD = 15 minutes;
    uint256 public constant MAX_DURATION = 14 days;

    event Listed(
        address indexed seller,
        address indexed nft,
        uint256 indexed tokenId,
        uint256 listingId,
        uint256 minPriceWei,
        uint256 endTime
    );

    event BidPlaced(
        address indexed bidder,
        uint256 indexed listingId,
        uint256 amount
    );

    event AuctionExtended(
        uint256 indexed listingId,
        uint256 newEndTime
    );

    event AuctionCanceled(
        uint256 indexed listingId
    );

    event AuctionEnded(
        uint256 indexed listingId,
        address winner,
        uint256 winningBid
    );

    event FundsWithdrawn(
        address indexed account,
        uint256 amount
    );

    modifier listingExists(uint256 listingId) {
        require(listingId < listingCount, "listing does not exist");
        _;
    }

    function list(
        address nft,
        uint256 tokenId,
        uint256 minPriceWei,
        uint64 durationSeconds
    ) external returns (uint256) {
        require(minPriceWei > 0, "min price must be > 0");
        require(durationSeconds > 0, "duration must be > 0");
        require(durationSeconds <= MAX_DURATION, "duration too long");

        IERC721 nftContract = IERC721(nft);
        require(nftContract.ownerOf(tokenId) == msg.sender, "not owner");
        require(
            nftContract.getApproved(tokenId) == address(this) ||
            nftContract.isApprovedForAll(msg.sender, address(this)),
            "not approved"
        );

        nftContract.safeTransferFrom(msg.sender, address(this), tokenId);

        uint256 id = listingCount;
        Listing storage l = _listings[id];
        l.seller = msg.sender;
        l.nft = nftContract;
        l.tokenId = tokenId;
        l.minPriceWei = uint96(minPriceWei);
        l.endTime = uint40(block.timestamp + durationSeconds);
        l.status = ListingStatus.Active;

        listingCount++;

        emit Listed(msg.sender, nft, tokenId, id, minPriceWei, l.endTime);

        return id;
    }

    function bid(uint256 listingId) external payable nonReentrant listingExists(listingId) {
        Listing storage l = _listings[listingId];
        require(l.status == ListingStatus.Active, "auction not active");
        require(block.timestamp < l.endTime, "auction ended");
        require(msg.value >= l.minPriceWei, "below min price");

        uint96 minBid = l.highestBid;
        if (minBid == 0) {
            minBid = l.minPriceWei;
        } else {
            minBid = uint96((uint256(minBid) * (100 + MIN_BID_INCREMENT_PERCENT)) / 100);
        }
        require(msg.value >= minBid, "bid too low");

        if (l.highestBidder != address(0)) {
            pendingWithdrawals[l.highestBidder] += l.highestBid;
        }

        l.highestBid = uint96(msg.value);
        l.highestBidder = msg.sender;

        if (l.endTime - block.timestamp < EXTENSION_PERIOD) {
            l.endTime = uint40(block.timestamp + EXTENSION_PERIOD);
            emit AuctionExtended(listingId, l.endTime);
        }

        emit BidPlaced(msg.sender, listingId, msg.value);
    }

    function cancel(uint256 listingId) external listingExists(listingId) {
        Listing storage l = _listings[listingId];
        require(l.seller == msg.sender, "not seller");
        require(l.status == ListingStatus.Active, "not active");
        require(l.highestBidder == address(0) && l.highestBid == 0, "bids placed");

        l.status = ListingStatus.Canceled;
        l.nft.safeTransferFrom(address(this), msg.sender, l.tokenId);

        emit AuctionCanceled(listingId);
    }

    function end(uint256 listingId) external nonReentrant listingExists(listingId) {
        Listing storage l = _listings[listingId];
        require(l.status == ListingStatus.Active, "not active");
        require(block.timestamp >= l.endTime, "auction still active");

        l.status = ListingStatus.Ended;

        if (l.highestBidder == address(0)) {
            l.nft.safeTransferFrom(address(this), l.seller, l.tokenId);
            emit AuctionEnded(listingId, address(0), 0);
        } else {
            pendingWithdrawals[l.seller] += l.highestBid;
            l.nft.safeTransferFrom(address(this), l.highestBidder, l.tokenId);
            emit AuctionEnded(listingId, l.highestBidder, l.highestBid);
        }
    }

    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "nothing to withdraw");
        pendingWithdrawals[msg.sender] = 0;
        (bool sent, ) = payable(msg.sender).call{value: amount}("");
        require(sent, "transfer failed");
        emit FundsWithdrawn(msg.sender, amount);
    }

    function getListing(uint256 listingId) external view listingExists(listingId) returns (
        address seller,
        address nft,
        uint256 tokenId,
        uint256 minPriceWei,
        uint256 highestBid,
        address highestBidder,
        uint256 endTime,
        ListingStatus status
    ) {
        Listing storage l = _listings[listingId];
        return (
            l.seller,
            address(l.nft),
            l.tokenId,
            l.minPriceWei,
            l.highestBid,
            l.highestBidder,
            l.endTime,
            l.status
        );
    }
}
