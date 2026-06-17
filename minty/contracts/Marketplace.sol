// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract Marketplace is ERC721Holder, ReentrancyGuard, AccessControl, Pausable {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    enum ListingType { Auction, FixedPrice }
    enum ListingStatus { Active, Ended, Canceled }

    struct Listing {
        address seller;
        IERC721 nft;
        uint256 tokenId;
        ListingType listingType;
        ListingStatus status;
        uint96 minPriceWei;
        uint96 reservePriceWei;
        uint96 buyNowPriceWei;
        uint96 highestBid;
        address highestBidder;
        uint40 endTime;
        uint40 extensionPeriod;
    }

    uint256 public listingCount;
    uint256 public auctionCount;
    uint256 public fixedPriceCount;

    mapping(uint256 => Listing) private _listings;
    mapping(address => uint256) public pendingWithdrawals;

    struct EndedAuction {
        uint256 listingId;
        address nft;
        uint256 tokenId;
        address winner;
        uint256 winningBid;
        address seller;
        uint256 endTime;
    }
    EndedAuction[] public auctionHistory;

    uint256 public platformFeeBps = 250;
    address public treasury;

    uint256 public constant MIN_BID_INCREMENT_PERCENT = 5;
    uint256 public constant MAX_DURATION = 14 days;
    uint256 public constant DEFAULT_EXTENSION_PERIOD = 15 minutes;

    event AuctionListed(
        address indexed seller,
        address indexed nft,
        uint256 indexed tokenId,
        uint256 listingId,
        uint256 minPriceWei,
        uint256 reservePriceWei,
        uint256 buyNowPriceWei,
        uint256 endTime
    );

    event FixedPriceListed(
        address indexed seller,
        address indexed nft,
        uint256 indexed tokenId,
        uint256 listingId,
        uint256 priceWei
    );

    event BidPlaced(
        address indexed bidder,
        uint256 indexed listingId,
        uint256 amount
    );

    event BuyNowPurchased(
        address indexed buyer,
        uint256 indexed listingId,
        uint256 amount
    );

    event AuctionExtended(
        uint256 indexed listingId,
        uint256 newEndTime
    );

    event ListingCanceled(
        address indexed caller,
        uint256 indexed listingId
    );

    event AuctionEnded(
        uint256 indexed listingId,
        address winner,
        uint256 winningBid,
        bool reserveMet
    );

    event FixedPriceSold(
        address indexed buyer,
        uint256 indexed listingId,
        uint256 priceWei
    );

    event FundsWithdrawn(
        address indexed account,
        uint256 amount
    );

    event PlatformFeeUpdated(
        uint256 oldFeeBps,
        uint256 newFeeBps
    );

    event TreasuryUpdated(
        address indexed oldTreasury,
        address indexed newTreasury
    );

    event PriceReduced(
        uint256 indexed listingId,
        uint256 oldPrice,
        uint256 newPrice
    );

    modifier listingExists(uint256 listingId) {
        require(listingId < listingCount, "listing does not exist");
        _;
    }

    modifier onlyActive(uint256 listingId) {
        require(_listings[listingId].status == ListingStatus.Active, "not active");
        _;
    }

    modifier onlySeller(uint256 listingId) {
        require(_listings[listingId].seller == msg.sender, "not seller");
        _;
    }

    constructor(address _treasury, uint256 _platformFeeBps) {
        require(_treasury != address(0), "invalid treasury");
        require(_platformFeeBps <= 1000, "fee too high");
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        treasury = _treasury;
        platformFeeBps = _platformFeeBps;
    }

    function listAuction(
        address nft,
        uint256 tokenId,
        uint256 minPriceWei,
        uint256 reservePriceWei,
        uint256 buyNowPriceWei,
        uint64 durationSeconds
    ) external whenNotPaused returns (uint256) {
        require(minPriceWei > 0, "min price must be > 0");
        require(durationSeconds > 0, "duration must be > 0");
        require(durationSeconds <= MAX_DURATION, "duration too long");
        if (reservePriceWei > 0) {
            require(reservePriceWei >= minPriceWei, "reserve too low");
        }
        if (buyNowPriceWei > 0) {
            uint256 refPrice = reservePriceWei > 0 ? reservePriceWei : minPriceWei;
            require(buyNowPriceWei > refPrice, "buy-now too low");
        }

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
        l.listingType = ListingType.Auction;
        l.status = ListingStatus.Active;
        l.minPriceWei = uint96(minPriceWei);
        l.reservePriceWei = uint96(reservePriceWei);
        l.buyNowPriceWei = uint96(buyNowPriceWei);
        l.endTime = uint40(block.timestamp + durationSeconds);
        l.extensionPeriod = uint40(DEFAULT_EXTENSION_PERIOD);

        listingCount++;
        auctionCount++;

        emit AuctionListed(msg.sender, nft, tokenId, id, minPriceWei, reservePriceWei, buyNowPriceWei, l.endTime);
        return id;
    }

    function listFixedPrice(
        address nft,
        uint256 tokenId,
        uint256 priceWei
    ) external whenNotPaused returns (uint256) {
        require(priceWei > 0, "price must be > 0");

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
        l.listingType = ListingType.FixedPrice;
        l.status = ListingStatus.Active;
        l.minPriceWei = uint96(priceWei);

        listingCount++;
        fixedPriceCount++;

        emit FixedPriceListed(msg.sender, nft, tokenId, id, priceWei);
        return id;
    }

    function bid(uint256 listingId)
        external
        payable
        nonReentrant
        whenNotPaused
        listingExists(listingId)
        onlyActive(listingId)
    {
        Listing storage l = _listings[listingId];
        require(l.listingType == ListingType.Auction, "not an auction");
        require(block.timestamp < l.endTime, "auction ended");
        require(msg.value >= l.minPriceWei, "below min price");

        uint256 minBid;
        if (l.highestBid == 0) {
            minBid = l.minPriceWei;
        } else {
            minBid = (uint256(l.highestBid) * (100 + MIN_BID_INCREMENT_PERCENT)) / 100;
        }
        require(msg.value >= minBid, "bid too low");

        if (l.buyNowPriceWei > 0 && msg.value >= l.buyNowPriceWei) {
            if (l.highestBidder != address(0)) {
                pendingWithdrawals[l.highestBidder] += l.highestBid;
            }
            l.status = ListingStatus.Ended;
            l.highestBid = l.buyNowPriceWei;
            l.highestBidder = msg.sender;
            _processPayout(l.seller, l.buyNowPriceWei);
            l.nft.safeTransferFrom(address(this), msg.sender, l.tokenId);
            _recordAuctionHistory(listingId, l);
            emit BuyNowPurchased(msg.sender, listingId, l.buyNowPriceWei);
            emit AuctionEnded(listingId, msg.sender, l.buyNowPriceWei, _reserveMet(l));
            return;
        }

        if (l.highestBidder != address(0)) {
            pendingWithdrawals[l.highestBidder] += l.highestBid;
        }

        l.highestBid = uint96(msg.value);
        l.highestBidder = msg.sender;

        if (uint256(l.endTime) - block.timestamp < l.extensionPeriod) {
            l.endTime = uint40(block.timestamp + l.extensionPeriod);
            emit AuctionExtended(listingId, l.endTime);
        }

        emit BidPlaced(msg.sender, listingId, msg.value);
    }

    function buyNow(uint256 listingId)
        external
        payable
        nonReentrant
        whenNotPaused
        listingExists(listingId)
        onlyActive(listingId)
    {
        Listing storage l = _listings[listingId];
        require(l.listingType == ListingType.Auction, "not an auction");
        require(l.buyNowPriceWei > 0, "no buy-now price");
        require(msg.value >= l.buyNowPriceWei, "below buy-now price");

        if (l.highestBidder != address(0)) {
            pendingWithdrawals[l.highestBidder] += l.highestBid;
        }

        l.status = ListingStatus.Ended;
        l.highestBid = l.buyNowPriceWei;
        l.highestBidder = msg.sender;

        _processPayout(l.seller, l.buyNowPriceWei);
        l.nft.safeTransferFrom(address(this), msg.sender, l.tokenId);

        _recordAuctionHistory(listingId, l);

        emit BuyNowPurchased(msg.sender, listingId, l.buyNowPriceWei);
        emit AuctionEnded(listingId, msg.sender, l.buyNowPriceWei, true);
    }

    function buyFixedPrice(uint256 listingId)
        external
        payable
        nonReentrant
        whenNotPaused
        listingExists(listingId)
        onlyActive(listingId)
    {
        Listing storage l = _listings[listingId];
        require(l.listingType == ListingType.FixedPrice, "not fixed-price");
        require(msg.value >= l.minPriceWei, "below price");

        l.status = ListingStatus.Ended;
        _processPayout(l.seller, l.minPriceWei);
        l.nft.safeTransferFrom(address(this), msg.sender, l.tokenId);

        emit FixedPriceSold(msg.sender, listingId, l.minPriceWei);
    }

    function cancel(uint256 listingId)
        external
        listingExists(listingId)
        onlyActive(listingId)
    {
        Listing storage l = _listings[listingId];

        if (l.listingType == ListingType.Auction) {
            require(
                l.seller == msg.sender || hasRole(ADMIN_ROLE, msg.sender),
                "not seller or admin"
            );
            require(l.highestBidder == address(0), "bids placed");
        } else {
            require(l.seller == msg.sender, "not seller");
        }

        l.status = ListingStatus.Canceled;
        l.nft.safeTransferFrom(address(this), l.seller, l.tokenId);

        emit ListingCanceled(msg.sender, listingId);
    }

    function end(uint256 listingId)
        external
        nonReentrant
        listingExists(listingId)
        onlyActive(listingId)
    {
        Listing storage l = _listings[listingId];
        require(l.listingType == ListingType.Auction, "not an auction");
        require(block.timestamp >= l.endTime, "auction still active");

        l.status = ListingStatus.Ended;

        if (l.highestBidder == address(0)) {
            l.nft.safeTransferFrom(address(this), l.seller, l.tokenId);
            emit AuctionEnded(listingId, address(0), 0, false);
        } else {
            bool reserveMet = _reserveMet(l);
            if (reserveMet) {
                _processPayout(l.seller, l.highestBid);
                l.nft.safeTransferFrom(address(this), l.highestBidder, l.tokenId);
            } else {
                pendingWithdrawals[l.highestBidder] += l.highestBid;
                l.nft.safeTransferFrom(address(this), l.seller, l.tokenId);
            }
            _recordAuctionHistory(listingId, l);
            emit AuctionEnded(listingId, l.highestBidder, l.highestBid, reserveMet);
        }
    }

    function reducePrice(uint256 listingId, uint256 newPriceWei)
        external
        listingExists(listingId)
        onlyActive(listingId)
        onlySeller(listingId)
    {
        Listing storage l = _listings[listingId];
        require(l.listingType == ListingType.FixedPrice, "not fixed-price");
        require(newPriceWei < l.minPriceWei, "must reduce price");
        require(newPriceWei > 0, "price must be > 0");

        uint256 oldPrice = l.minPriceWei;
        l.minPriceWei = uint96(newPriceWei);

        emit PriceReduced(listingId, oldPrice, newPriceWei);
    }

    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "nothing to withdraw");
        pendingWithdrawals[msg.sender] = 0;
        (bool sent, ) = payable(msg.sender).call{value: amount}("");
        require(sent, "transfer failed");
        emit FundsWithdrawn(msg.sender, amount);
    }

    function setPlatformFee(uint256 bps) external onlyRole(ADMIN_ROLE) {
        require(bps <= 1000, "fee too high");
        uint256 oldFee = platformFeeBps;
        platformFeeBps = bps;
        emit PlatformFeeUpdated(oldFee, bps);
    }

    function setTreasury(address _treasury) external onlyRole(ADMIN_ROLE) {
        require(_treasury != address(0), "invalid address");
        address oldTreasury = treasury;
        treasury = _treasury;
        emit TreasuryUpdated(oldTreasury, _treasury);
    }

    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    function _processPayout(address seller, uint256 amount) internal {
        uint256 fee = (amount * platformFeeBps) / 10000;
        uint256 sellerProceeds = amount - fee;
        if (fee > 0) {
            pendingWithdrawals[treasury] += fee;
        }
        pendingWithdrawals[seller] += sellerProceeds;
    }

    function _reserveMet(Listing storage l) internal view returns (bool) {
        return l.reservePriceWei == 0 || l.highestBid >= l.reservePriceWei;
    }

    function _recordAuctionHistory(uint256 listingId, Listing storage l) internal {
        bool reserveMet = _reserveMet(l);
        if (reserveMet && l.highestBidder != address(0)) {
            auctionHistory.push(EndedAuction({
                listingId: listingId,
                nft: address(l.nft),
                tokenId: l.tokenId,
                winner: l.highestBidder,
                winningBid: l.highestBid,
                seller: l.seller,
                endTime: block.timestamp
            }));
        }
    }

    function getListing(uint256 listingId) external view listingExists(listingId) returns (
        address seller,
        address nft,
        uint256 tokenId,
        ListingType listingType,
        ListingStatus status,
        uint256 minPriceWei,
        uint256 reservePriceWei,
        uint256 buyNowPriceWei,
        uint256 highestBid,
        address highestBidder,
        uint256 endTime
    ) {
        Listing storage l = _listings[listingId];
        return (
            l.seller,
            address(l.nft),
            l.tokenId,
            l.listingType,
            l.status,
            l.minPriceWei,
            l.reservePriceWei,
            l.buyNowPriceWei,
            l.highestBid,
            l.highestBidder,
            l.endTime
        );
    }

    function getAuctionHistory(uint256 index) external view returns (EndedAuction memory) {
        return auctionHistory[index];
    }

    function getAuctionHistoryCount() external view returns (uint256) {
        return auctionHistory.length;
    }

    function getActiveListingIds(uint256 offset, uint256 limit) external view returns (uint256[] memory) {
        if (offset >= listingCount) return new uint256[](0);
        uint256 endIdx = offset + limit;
        if (endIdx > listingCount) endIdx = listingCount;

        uint256 count = 0;
        for (uint256 i = offset; i < endIdx; i++) {
            if (_listings[i].status == ListingStatus.Active) count++;
        }

        uint256[] memory ids = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = offset; i < endIdx; i++) {
            if (_listings[i].status == ListingStatus.Active) {
                ids[idx] = i;
                idx++;
            }
        }
        return ids;
    }

    function getListingsBySeller(address seller, uint256 offset, uint256 limit)
        external view returns (uint256[] memory)
    {
        if (offset >= listingCount) return new uint256[](0);
        uint256 endIdx = offset + limit;
        if (endIdx > listingCount) endIdx = listingCount;

        uint256 count = 0;
        for (uint256 i = offset; i < endIdx; i++) {
            if (_listings[i].seller == seller) count++;
        }

        uint256[] memory ids = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = offset; i < endIdx; i++) {
            if (_listings[i].seller == seller) {
                ids[idx] = i;
                idx++;
            }
        }
        return ids;
    }
}
