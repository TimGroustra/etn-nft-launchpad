// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EditableERC721} from "./EditableERC721.sol";

contract LaunchpadFactory is Ownable2Step {
    address public treasury;
    address public immutable clubToken;
    uint256 public publishFee;

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

    constructor(address initialOwner, address treasury_, address clubToken_, uint256 publishFee_) Ownable(initialOwner) {
        treasury = treasury_;
        clubToken = clubToken_;
        publishFee = publishFee_;
    }

    function setPublishFee(uint256 newFee) external onlyOwner {
        publishFee = newFee;
        emit PublishFeeUpdated(newFee);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    function deployCollection(
        string calldata name,
        string calldata symbol,
        EditableERC721.BurnConfig calldata burnConfig,
        uint256 maxSupply
    ) external payable returns (address) {
        require(msg.value >= publishFee, "Insufficient publish fee");

        EditableERC721 collection = new EditableERC721(
            name,
            symbol,
            msg.sender, // collection owner = publisher wallet
            clubToken,
            burnConfig,
            maxSupply
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
