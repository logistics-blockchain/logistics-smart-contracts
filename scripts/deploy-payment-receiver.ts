// @ts-nocheck
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import "dotenv/config";
import { readFileSync } from "fs";

async function main() {
  console.log("Deploying PaymentReceiver to Base Sepolia");

  const privateKey = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
  const account = privateKeyToAccount(privateKey);
  console.log("Deployer:", account.address);

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http("https://sepolia.base.org"),
  });

  const walletClient = createWalletClient({
    chain: baseSepolia,
    transport: http("https://sepolia.base.org"),
    account,
  });

  const balance = await publicClient.getBalance({ address: account.address });
  console.log("Balance:", Number(balance) / 1e18, "ETH");

  if (balance === 0n) {
    console.error("No balance. Get testnet ETH from a faucet first.");
    process.exit(1);
  }

  // Load compiled bytecode
  const artifact = JSON.parse(
    readFileSync("./artifacts/contracts/PaymentReceiver.sol/PaymentReceiver.json", "utf8")
  );

  console.log("Deploying...");
  const hash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode as `0x${string}`,
  });

  console.log("Transaction hash:", hash);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log("PaymentReceiver deployed to:", receipt.contractAddress);
  console.log("Relayer set to:", account.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
