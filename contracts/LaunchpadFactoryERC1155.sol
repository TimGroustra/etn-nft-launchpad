// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EditableERC1155} from "./EditableERC1155.sol";
import {ILaunchpadCollection} from "./interfaces/ILaunchpadCollection.sol";

interface IERC721Balance {
    function balanceOf(address owner) external view returns (uint256);
}

/// @notice Deploys EditableERC1155 collections. Kept separate from ERC-721 V2 factory for bytecode size.
contract LaunchpadFactoryERC1155 is Ownable2Step {
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

    event CollectionDeployedV2(
        address indexed creator,
        address indexed collection,
        string name,
        string symbol,
        uint8 tokenStandard,
        uint256 maxSupply
    );
    event PublishFeeUpdated(uint256 newFee);
    event TreasuryUpdated(address newTreasury);
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

    function tieredPublishFee(uint256 maxSupply) public view returns (uint256) {
        require(maxSupply > 0, "Invalid max supply");
        return ((maxSupply + 9) / 10) * publishFee;
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

    function deployCollectionERC1155(
        string calldata name,
        string calldata symbol,
        ILaunchpadCollection.BurnConfig calldata burnConfig,
        uint256 maxSupply
    ) external payable returns (address collection) {
        require(msg.value >= requiredPublishFee(msg.sender, maxSupply), "Insufficient publish fee");
        collection = address(
            new EditableERC1155(
                name,
                symbol,
                "",
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
            )
        );
        require(Ownable(collection).owner() == msg.sender, "Owner transfer failed");
        deployedCollections.push(collection);
        if (msg.value > 0) {
            (bool sent, ) = treasury.call{value: msg.value}("");
            require(sent, "Treasury transfer failed");
        }
        emit CollectionDeployedV2(msg.sender, collection, name, symbol, 1, maxSupply);
    }
}
