// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EditableERC721} from "./EditableERC721.sol";

interface IERC721Balance {
    function balanceOf(address owner) external view returns (uint256);
}

/// @notice Factory for EditableERC721 collections. Platform settings are owner-editable so
/// publish fees, treasury, swap addresses, and default royalty can change without redeploying.
/// @dev publishFee is the ETN charge per 10 max-supply units (e.g. 1000 ETN per 10 NFTs).
contract LaunchpadFactory is Ownable2Step {
    address public treasury;
    address public clubToken;
    address public wetn;
    address public swapRouter;
    uint256 public publishFee;
    uint96 public defaultRoyaltyBps;
    address public electroGemsCollection;
    address public clubWatchCollection;
    uint96 public dualHolderDiscountBps;
    uint96 public platformMintFeeBps;

    address[] public deployedCollections;

    event CollectionDeployed(
        address indexed creator,
        address indexed collection,
        string name,
        string symbol,
        EditableERC721.BurnConfig burnConfig,
        uint256 maxSupply
    );
    event PublishFeeUpdated(uint256 newFee);
    event TreasuryUpdated(address newTreasury);
    event ClubTokenUpdated(address newClubToken);
    event WetnUpdated(address newWetn);
    event SwapRouterUpdated(address newSwapRouter);
    event DefaultRoyaltyBpsUpdated(uint96 newBps);
    event CreatorAccessConfigUpdated(address electroGems, address clubWatch, uint96 discountBps);

    constructor(
        address initialOwner,
        address treasury_,
        address clubToken_,
        address wetn_,
        address swapRouter_,
        uint256 publishFee_,
        uint96 defaultRoyaltyBps_
    ) Ownable(initialOwner) {
        require(defaultRoyaltyBps_ <= 10_000, "Invalid royalty bps");
        treasury = treasury_;
        clubToken = clubToken_;
        wetn = wetn_;
        swapRouter = swapRouter_;
        publishFee = publishFee_;
        defaultRoyaltyBps = defaultRoyaltyBps_;
        platformMintFeeBps = 300;
    }

    function setPublishFee(uint256 newFee) external onlyOwner {
        publishFee = newFee;
        emit PublishFeeUpdated(newFee);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "Invalid treasury");
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    function setClubToken(address newClubToken) external onlyOwner {
        require(newClubToken != address(0), "Invalid CLUB token");
        clubToken = newClubToken;
        emit ClubTokenUpdated(newClubToken);
    }

    function setWetn(address newWetn) external onlyOwner {
        wetn = newWetn;
        emit WetnUpdated(newWetn);
    }

    function setSwapRouter(address newSwapRouter) external onlyOwner {
        swapRouter = newSwapRouter;
        emit SwapRouterUpdated(newSwapRouter);
    }

    function setDefaultRoyaltyBps(uint96 newBps) external onlyOwner {
        require(newBps <= 10_000, "Invalid royalty bps");
        defaultRoyaltyBps = newBps;
        emit DefaultRoyaltyBpsUpdated(newBps);
    }

    function setCreatorAccessConfig(
        address electroGems_,
        address clubWatch_,
        uint96 discountBps_
    ) external onlyOwner {
        require(discountBps_ <= 10_000, "Invalid discount bps");
        electroGemsCollection = electroGems_;
        clubWatchCollection = clubWatch_;
        dualHolderDiscountBps = discountBps_;
        emit CreatorAccessConfigUpdated(electroGems_, clubWatch_, discountBps_);
    }

    function setPlatformMintFeeBps(uint96 feeBps_) external onlyOwner {
        require(feeBps_ <= 10_000, "Invalid platform mint fee bps");
        platformMintFeeBps = feeBps_;
    }

    function tieredPublishFee(uint256 maxSupply) public view returns (uint256) {
        require(maxSupply > 0, "Invalid max supply");
        uint256 tiers = (maxSupply + 9) / 10;
        return tiers * publishFee;
    }

    function requiredPublishFee(address payer, uint256 maxSupply) public view returns (uint256) {
        uint256 fee = tieredPublishFee(maxSupply);
        if (
            dualHolderDiscountBps > 0 &&
            electroGemsCollection != address(0) &&
            clubWatchCollection != address(0) &&
            IERC721Balance(electroGemsCollection).balanceOf(payer) > 0 &&
            IERC721Balance(clubWatchCollection).balanceOf(payer) > 0
        ) {
            fee = (fee * (10_000 - dualHolderDiscountBps)) / 10_000;
        }
        return fee;
    }

    function setDeploymentConfig(
        address clubToken_,
        address wetn_,
        address swapRouter_,
        uint96 defaultRoyaltyBps_
    ) external onlyOwner {
        require(clubToken_ != address(0), "Invalid CLUB token");
        require(defaultRoyaltyBps_ <= 10_000, "Invalid royalty bps");
        clubToken = clubToken_;
        wetn = wetn_;
        swapRouter = swapRouter_;
        defaultRoyaltyBps = defaultRoyaltyBps_;
        emit ClubTokenUpdated(clubToken_);
        emit WetnUpdated(wetn_);
        emit SwapRouterUpdated(swapRouter_);
        emit DefaultRoyaltyBpsUpdated(defaultRoyaltyBps_);
    }

    function deployCollection(
        string calldata name,
        string calldata symbol,
        EditableERC721.BurnConfig calldata burnConfig,
        uint256 maxSupply
    ) external payable returns (address) {
        uint256 requiredFee = requiredPublishFee(msg.sender, maxSupply);
        require(msg.value >= requiredFee, "Insufficient publish fee");

        EditableERC721 collection = new EditableERC721(
            name,
            symbol,
            msg.sender,
            clubToken,
            wetn,
            swapRouter,
            burnConfig,
            maxSupply,
            defaultRoyaltyBps,
            treasury,
            platformMintFeeBps,
            electroGemsCollection,
            clubWatchCollection
        );

        require(collection.owner() == msg.sender, "Owner transfer failed");

        deployedCollections.push(address(collection));

        if (msg.value > 0) {
            (bool sent, ) = treasury.call{value: msg.value}("");
            require(sent, "Treasury transfer failed");
        }

        emit CollectionDeployed(msg.sender, address(collection), name, symbol, burnConfig, maxSupply);
        return address(collection);
    }

    function deployedCollectionsCount() external view returns (uint256) {
        return deployedCollections.length;
    }
}
