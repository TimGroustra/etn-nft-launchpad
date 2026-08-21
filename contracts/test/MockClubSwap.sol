// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IWETN, ISwapRouterV3} from "../interfaces/IClubSwap.sol";

contract MockWETN is IWETN {
    mapping(address => uint256) public balanceOf;

    function deposit() external payable {
        balanceOf[msg.sender] += msg.value;
    }

    function withdraw(uint256 amount) external {
        require(balanceOf[msg.sender] >= amount, "Insufficient WETN");
        balanceOf[msg.sender] -= amount;
        (bool sent, ) = msg.sender.call{value: amount}("");
        require(sent, "Withdraw failed");
    }

    function pull(address from, uint256 amount) external {
        require(balanceOf[from] >= amount, "Insufficient pull");
        balanceOf[from] -= amount;
    }

    function approve(address, uint256) external pure returns (bool) {
        return true;
    }

    receive() external payable {
        balanceOf[msg.sender] += msg.value;
    }
}

contract MockClub is ERC20 {
    constructor() ERC20("CLUB", "CLUB") {
        _mint(msg.sender, 1_000_000 ether);
    }
}

contract MockSwapRouterV3 is ISwapRouterV3 {
    IERC20 public immutable club;
    MockWETN public immutable wetn;
    address public immutable dead;

    constructor(address club_, MockWETN wetn_, address dead_) {
        club = IERC20(club_);
        wetn = wetn_;
        dead = dead_;
    }

    function exactInput(ExactInputParams calldata params) external payable returns (uint256 amountOut) {
        wetn.pull(msg.sender, params.amountIn);
        amountOut = params.amountIn;
        require(club.transfer(params.recipient, amountOut), "club transfer failed");
        return amountOut;
    }

    function exactOutput(ExactOutputParams calldata params) external payable returns (uint256 amountIn) {
        amountIn = params.amountOut;
        wetn.pull(msg.sender, amountIn);
        require(club.transfer(params.recipient, params.amountOut), "club transfer failed");
        return amountIn;
    }
}
